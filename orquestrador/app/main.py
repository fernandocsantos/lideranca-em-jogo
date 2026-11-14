"""API HTTP do orquestrador (FastAPI) + entrega da SPA."""
from __future__ import annotations

import csv
import io
import logging
import secrets
from contextlib import asynccontextmanager
from typing import Optional

import base64

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import asyncio

from . import alocacao as aloc_mod
from . import campanha as camp
from . import mascaramento
from . import cenarios, config, conversa, custos, db, esclarecimento, fatos, fila, moderacao, perfis, selos, settings, simulacao, vivencias
from .llm import Ctx, ErroLLM
from .mirofish_client import novo as novo_mirofish

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def ciclo(app: FastAPI):
    db.conectar()
    vivencias.preparar()
    vivencias.expirar()
    fila.iniciar()
    yield
    await fila.parar()


app = FastAPI(title="Liderança em Jogo — orquestrador", lifespan=ciclo)


@app.middleware("http")
async def revalidar_estaticos(request: Request, chamar):
    """Arquivos da interface sempre revalidados (ETag): atualizações aparecem sem limpar cache."""
    resp = await chamar(request)
    if request.url.path.startswith("/static/") or request.url.path == "/":
        resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.middleware("http")
async def senha_de_acesso(request: Request, chamar):
    """Com ACESSO_SENHA definida, todo o site pede usuário e senha (HTTP Basic).

    Serve para publicar por túnel só para quem recebeu a senha. O túnel entrega HTTPS, então a senha
    não trafega aberta.
    """
    senha = settings.ACESSO_SENHA
    if not senha:
        return await chamar(request)
    cab = request.headers.get("authorization", "")
    ok = False
    if cab.lower().startswith("basic "):
        try:
            usuario, _, dada = base64.b64decode(cab[6:]).decode("utf-8").partition(":")
            ok = secrets.compare_digest(usuario, settings.ACESSO_USUARIO) and secrets.compare_digest(dada, senha)
        except (ValueError, UnicodeDecodeError):
            ok = False
    if not ok:
        return Response("Acesso restrito aos participantes do hackathon.", status_code=401,
                        headers={"WWW-Authenticate": 'Basic realm="Lideranca em Jogo", charset="UTF-8"'},
                        media_type="text/plain; charset=utf-8")
    return await chamar(request)


# ------------------------------------------------------------------ autenticação
def sessao_atual(x_sessao: str = Header(default="")) -> dict:
    s = db.um("SELECT * FROM sessoes WHERE token=?", (x_sessao,)) if x_sessao else None
    if not s:
        raise HTTPException(401, "Sessão inválida. Recarregue a página para começar.")
    return s


def facilitador(x_facilitador: str = Header(default="")) -> None:
    if not settings.FACILITADOR_CODIGO or not secrets.compare_digest(x_facilitador, settings.FACILITADOR_CODIGO):
        raise HTTPException(403, "Código do facilitador inválido.")


def _campanha_da_sessao(campanha_id: str, s: dict) -> dict:
    c = camp.obter(campanha_id)
    if not c or c["sessao_id"] != s["id"]:
        raise HTTPException(404, "Campanha não encontrada.")
    return c


def _tentativa_da_sessao(tid: str, s: dict) -> dict:
    t = db.um("SELECT * FROM tentativas WHERE id=?", (tid,))
    if not t or t["sessao_id"] != s["id"]:
        raise HTTPException(404, "Tentativa não encontrada.")
    return t


# ---------------------------------------------------------------------- modelos
class NovaSessao(BaseModel):
    apelido: str = Field(min_length=2, max_length=40)


class Esclarecimento(BaseModel):
    pergunta: str = Field(max_length=500)
    resposta: str = Field(max_length=600)


class Decisao(BaseModel):
    decisao: str
    esclarecimentos: list[Esclarecimento] = []
    rodadas: Optional[int] = None
    alocacao: dict[str, float] = {}
    escolhas: dict = {}


class NovaCampanha(BaseModel):
    perfil: Optional[str] = None
    modo: Optional[str] = None


class NovaVivencia(BaseModel):
    perfil: dict[str, str]
    tipo: str
    tema: str
    respostas: dict[str, str]
    consentimento: dict[str, bool]


class TextoMascarar(BaseModel):
    respostas: dict[str, str]


class Codigo(BaseModel):
    codigo: str = Field(min_length=4, max_length=40)


class StatusVivencia(BaseModel):
    status: str


class Previa(BaseModel):
    alocacao: dict[str, float] = {}
    escolhas: dict = {}


class Avancar(BaseModel):
    tentativa_id: str


class Mensagem(BaseModel):
    interlocutor: str
    mensagem: str = Field(min_length=1, max_length=800)


class StatusCenario(BaseModel):
    status: str


# ----------------------------------------------------------------------- público
@app.get("/api/config")
async def config_publica():
    ind = config.indicadores()["indicadores"]
    jg = config.jogo()
    return {
        "indicadores": [{"id": k, **v} for k, v in ind.items()],
        "competencias": [{"id": k, "nome": v["nome"]} for k, v in config.rubrica()["competencias"].items()],
        "niveis": config.rubrica()["niveis"],
        "decisao": jg["decisao"],
        "perfis": perfis.listar(),
        "roteiro_demo": jg.get("roteiro_demo"),
        "perfil_padrao": perfis.padrao(),
        "simulacao": {"max_rodadas": jg["simulacao"]["max_rodadas"], "rodadas_padrao": jg["simulacao"]["rodadas_padrao"]},
        "limites": {"simulacoes_por_dia": jg["limites"]["simulacoes_por_dia"],
                    "mensagens_conversa_por_tentativa": jg["limites"]["mensagens_conversa_por_tentativa"]},
    }


@app.get("/api/status")
async def status():
    if settings.MIROFISH_DESATIVADO:
        return {"mirofish": False, "motivo": "desativado na configuração"}
    ok = await novo_mirofish().saudavel()
    return {"mirofish": ok, "motivo": "" if ok else "serviço não respondeu"}


@app.post("/api/sessoes")
async def criar_sessao(dados: NovaSessao):
    s = {"id": db.novo_id("ses"), "token": secrets.token_urlsafe(24), "apelido": dados.apelido.strip(),
         "criado_em": db.agora()}
    db.inserir("sessoes", s)
    return {"sessao_id": s["id"], "token": s["token"], "apelido": s["apelido"]}


@app.get("/api/sessoes/eu")
async def minha_sessao(s: dict = Depends(sessao_atual)):
    camps = db.varios("SELECT id, status, indice_atual, criado_em FROM campanhas WHERE sessao_id=? "
                      "ORDER BY criado_em DESC", (s["id"],))
    return {"apelido": s["apelido"], "campanhas": camps, "custo": custos.resumo("sessao_id", s["id"])}


@app.delete("/api/sessoes/eu")
async def apagar_sessao(s: dict = Depends(sessao_atual)):
    db.apagar_sessao(s["id"])
    return {"ok": True}


# --------------------------------------------------------------------- campanha
def _estado(c: dict) -> dict:
    atual = None
    tentativas = []
    if c["status"] == "em_andamento":
        cid = c["cenarios"][c["indice_atual"]]
        cen_obj = cenarios.obter(cid, c.get("perfil"))
        atual = cenarios.publico(cen_obj)
        anterior = (c["historico"][-1].get("alocacao") if c["historico"] and cen_obj.continua_de else None)
        base = aloc_mod.anos_anteriores(cen_obj, anterior)
        nomes_ind = {k: v["nome"] for k, v in config.indicadores()["indicadores"].items()}
        efeitos = {d.id: [nomes_ind.get(i, i) for i, p in d.efeitos.items() if p > 0] for d in cen_obj.demandas}
        for d in atual["demandas"]:
            d["ano_anterior"] = base[d["id"]]
            d["afeta"] = efeitos.get(d["id"], [])
        fato = fatos.para_trimestre(c["indice_atual"])
        atual["fato_noticia"] = fatos.publico(fato) if fato else None
        atual["relatos_rede"] = vivencias.relatos(cen_obj)
        atual["vivencias_base"] = cen_obj.vivencias_base
        tentativas = [_resumo_tentativa(t) for t in db.varios(
            "SELECT * FROM tentativas WHERE campanha_id=? AND indice=? ORDER BY criado_em",
            (c["id"], c["indice_atual"]))]
    return {
        "id": c["id"], "status": c["status"], "indice_atual": c["indice_atual"], "total": len(c["cenarios"]),
        "indicadores": c["indicadores"], "historico": c["historico"], "cenario": atual, "tentativas": tentativas,
        "custo": custos.resumo("campanha_id", c["id"]), "perfil": c.get("perfil"), "selos": c.get("selos") or [],
        "mandato": _lista_mandato(c),
    }


def _lista_mandato(c: dict) -> list[dict]:
    """Cenários do mandato com progresso, para o Painel."""
    temas = {"orcamento_prioridades": "Orçamento e prioridades"}
    out = []
    for i, cid in enumerate(c["cenarios"]):
        cen = cenarios.obter(cid, c.get("perfil"))
        status = "concluido" if i < c["indice_atual"] else ("atual" if i == c["indice_atual"] and c["status"] == "em_andamento" else "bloqueado")
        out.append({"indice": i, "id": cid, "titulo": cen.titulo, "tema": temas.get(cen.tema, cen.tema.replace("_", " ").capitalize()),
                    "status": status, "duracao_min": 10, "demandas": len(cen.demandas)})
    return out


def _resumo_tentativa(t: dict) -> dict:
    res = t.get("resultado") or {}
    return {"id": t["id"], "status": t["status"], "decisao": t["decisao"], "modo": t["modo"], "fase": t.get("fase"),
            "alocacao": t.get("alocacao"), "variacao": (res.get("indicadores") or {}).get("variacao"),
            "criado_em": t["criado_em"]}


@app.post("/api/campanhas")
async def nova_campanha(dados: Optional[NovaCampanha] = None, s: dict = Depends(sessao_atual)):
    dados = dados or NovaCampanha()
    return _estado(camp.criar(s["id"], perfil=dados.perfil, modo=dados.modo))


def _nomes_ficticios(cen) -> list[str]:
    nomes = [a.nome for a in cen.atores] + [cen.associacao.nome, cen.associacao.cidade.split(" (")[0]]
    nomes += [p for a in cen.atores for p in a.nome.split() if len(p) > 3 and p[0].isupper()]
    return nomes


def _cenario_atual(c: dict):
    return cenarios.obter(c["cenarios"][c["indice_atual"]], c.get("perfil"))


@app.post("/api/campanhas/{cid}/previa")
async def previa(cid: str, dados: Previa, s: dict = Depends(sessao_atual)):
    """Prévia instantânea da alocação: cálculo em código, sem IA."""
    c = _campanha_da_sessao(cid, s)
    if c["status"] != "em_andamento":
        raise HTTPException(400, "Campanha encerrada.")
    try:
        return aloc_mod.previa(_cenario_atual(c), dados.alocacao, c["indicadores"], dados.escolhas)
    except aloc_mod.AlocacaoInvalida as e:
        raise HTTPException(400, str(e)) from e


@app.get("/api/campanhas/{cid}")
async def ver_campanha(cid: str, s: dict = Depends(sessao_atual)):
    return _estado(_campanha_da_sessao(cid, s))


@app.post("/api/campanhas/{cid}/avancar")
async def avancar(cid: str, dados: Avancar, s: dict = Depends(sessao_atual)):
    c = _campanha_da_sessao(cid, s)
    t = _tentativa_da_sessao(dados.tentativa_id, s)
    if t["campanha_id"] != cid or t["indice"] != c["indice_atual"] or not t.get("resultado"):
        raise HTTPException(400, "Escolha uma tentativa do trimestre atual que já tenha resultado.")
    return _estado(camp.avancar(c, t))


def _validar_texto(decisao: str) -> str:
    lim = config.jogo()["decisao"]
    d = decisao.strip()
    if len(d) < lim["min_caracteres"]:
        raise HTTPException(400, f"Descreva sua decisão com pelo menos {lim['min_caracteres']} caracteres.")
    if len(d) > lim["max_caracteres"]:
        raise HTTPException(400, f"A decisão pode ter no máximo {lim['max_caracteres']} caracteres.")
    return d


@app.post("/api/campanhas/{cid}/decisoes/avaliar")
async def avaliar_decisao(cid: str, dados: Decisao, s: dict = Depends(sessao_atual)):
    c = _campanha_da_sessao(cid, s)
    if c["status"] != "em_andamento":
        raise HTTPException(400, "Campanha encerrada.")
    texto = _validar_texto(dados.decisao)
    ctx = Ctx(s["id"], cid, None)
    todo = texto + "\n" + "\n".join(e.resposta for e in dados.esclarecimentos)
    mod = await moderacao.moderar(todo, ctx)
    if not mod.permitido:
        return {"permitido": False, "motivo": mod.motivo, "simulavel": False, "perguntas": []}
    cen = _cenario_atual(c)
    av = await esclarecimento.avaliar(cen, texto, [e.model_dump() for e in dados.esclarecimentos], ctx)
    return {"permitido": True, "motivo": "", "simulavel": av.simulavel, "perguntas": av.perguntas}


@app.post("/api/campanhas/{cid}/tentativas")
async def nova_tentativa(cid: str, dados: Decisao, s: dict = Depends(sessao_atual)):
    c = _campanha_da_sessao(cid, s)
    if c["status"] != "em_andamento":
        raise HTTPException(400, "Campanha encerrada.")
    texto = _validar_texto(dados.decisao)
    # dados pessoais são mascarados (abaixo), não recusados; a moderação local barra ofensa e manipulação
    todo = mascaramento.mascarar(texto + "\n" + "\n".join(e.resposta for e in dados.esclarecimentos), generalizar_valores=False)["texto"]
    local = moderacao.regras_locais(todo)
    if local:
        raise HTTPException(400, local.motivo)
    ok, motivo = custos.pode_simular(s["id"])
    if not ok:
        raise HTTPException(429, motivo)
    if custos.orcamento_esgotado():
        raise HTTPException(429, "O orçamento mensal do protótipo foi atingido. Fale com o facilitador.")
    jg = config.jogo()["simulacao"]
    rodadas = max(3, min(int(dados.rodadas or jg["rodadas_padrao"]), int(jg["max_rodadas"])))
    cen = _cenario_atual(c)
    try:
        aloc = aloc_mod.normalizar(cen, dados.alocacao) if cen.demandas else {}
    except aloc_mod.AlocacaoInvalida as e:
        raise HTTPException(400, str(e)) from e
    escolhas = dict(dados.escolhas or {})
    # LGPD: o texto livre do jogador é mascarado antes de salvar e de seguir para o LLM e o MiroFish.
    ficticios = _nomes_ficticios(cen)
    texto = mascaramento.mascarar(texto, permitidos=ficticios, generalizar_valores=False)["texto"]
    k = escolhas.get("construtor") or {}
    for campo in ("motivoLivre", "canalLivre", "oqueLivre", "ataEditada"):
        if isinstance(k.get(campo), str) and k[campo]:
            k[campo] = mascaramento.mascarar(k[campo], permitidos=ficticios, generalizar_valores=False)["texto"]
    base = simulacao.resultado_base(cen, aloc, escolhas, c["indicadores"]) if cen.demandas else None
    t = {
        "id": db.novo_id("tent"), "campanha_id": cid, "sessao_id": s["id"],
        "cenario_id": c["cenarios"][c["indice_atual"]], "indice": c["indice_atual"], "decisao": texto,
        "esclarecimentos": [e.model_dump() for e in dados.esclarecimentos], "status": "na_fila",
        "etapa": "Aguardando na fila", "progresso": 0, "rodadas": rodadas,
        "indicadores_antes": c["indicadores"], "criado_em": db.agora(), "atualizado_em": db.agora(),
        "alocacao": aloc, "escolhas": escolhas,
    }
    if base:
        t.update(resultado=base, indicadores_depois=base["indicadores"]["depois"], fase="base")
    db.inserir("tentativas", t)
    asyncio.create_task(simulacao.gerar_devolutiva(t["id"]))  # não espera a simulação dos agentes
    pos = fila.enfileirar(t["id"])
    return {"tentativa_id": t["id"], "posicao": pos}


@app.get("/api/tentativas/{tid}")
async def ver_tentativa(tid: str, s: dict = Depends(sessao_atual)):
    t = _tentativa_da_sessao(tid, s)
    return {
        "id": t["id"], "status": t["status"], "etapa": t["etapa"], "progresso": t["progresso"],
        "posicao_fila": fila.posicao(tid), "parciais": t["parciais"], "modo": t["modo"], "aviso": t["aviso"],
        "rodadas": t["rodadas"], "decisao": t["decisao"], "esclarecimentos": t["esclarecimentos"],
        "resultado": t["resultado"], "erro": t["erro"], "cenario_id": t["cenario_id"], "fase": t.get("fase"),
        "alocacao": t.get("alocacao"), "escolhas": t.get("escolhas"), "devolutiva": t.get("devolutiva"),
        "custo": custos.resumo("tentativa_id", tid),
    }


@app.get("/api/tentativas/{tid}/conversa")
async def ver_conversa(tid: str, interlocutor: str = Query(...), s: dict = Depends(sessao_atual)):
    _tentativa_da_sessao(tid, s)
    return {"mensagens": conversa.historico(tid, interlocutor)}


@app.post("/api/tentativas/{tid}/conversa")
async def conversar(tid: str, dados: Mensagem, s: dict = Depends(sessao_atual)):
    t = _tentativa_da_sessao(tid, s)
    if not t.get("resultado"):
        raise HTTPException(400, "A conversa fica disponível quando houver resultado.")
    cen = cenarios.obter(t["cenario_id"], simulacao.perfil_da_campanha(t["campanha_id"]))
    if dados.interlocutor != conversa.RELATORIO and dados.interlocutor not in {a.id for a in cen.atores}:
        raise HTTPException(400, "Interlocutor desconhecido.")
    if conversa.total_mensagens(tid) >= int(config.jogo()["limites"]["mensagens_conversa_por_tentativa"]):
        raise HTTPException(429, "Limite de mensagens desta tentativa atingido.")
    dados.mensagem = mascaramento.mascarar(dados.mensagem, permitidos=_nomes_ficticios(cen), generalizar_valores=False)["texto"]
    mod = await moderacao.moderar(dados.mensagem, Ctx(s["id"], t["campanha_id"], tid))
    if not mod.permitido:
        raise HTTPException(400, mod.motivo)
    try:
        return await conversa.responder(t, dados.interlocutor, dados.mensagem)
    except ErroLLM as e:
        raise HTTPException(503, str(e)) from e


@app.get("/api/campanhas/{cid}/comparar")
async def comparar(cid: str, indice: int, s: dict = Depends(sessao_atual)):
    _campanha_da_sessao(cid, s)
    ts = db.varios("SELECT * FROM tentativas WHERE campanha_id=? AND indice=? AND resultado IS NOT NULL "
                   "ORDER BY criado_em", (cid, indice))
    return {"tentativas": [{**_resumo_tentativa(t),
                            "competencias": (t.get("devolutiva") or {}).get("competencias", [])} for t in ts]}


# ------------------------------------------------------------------ facilitador
# ------------------------------------------------------------- certificações e relatório
@app.get("/api/campanhas/{cid}/selos")
async def ver_selos(cid: str, s: dict = Depends(sessao_atual)):
    return selos.atualizar(_campanha_da_sessao(cid, s))


@app.get("/api/selos")
async def lista_selos():
    return {"selos": [{"id": k, **v} for k, v in selos.definicoes().items()]}


@app.get("/api/campanhas/{cid}/relatorio")
async def relatorio_mandato(cid: str, apelido: int = 0, s: dict = Depends(sessao_atual)):
    from . import relatorio
    return relatorio.montar(_campanha_da_sessao(cid, s), s["apelido"] if apelido else None)


@app.get("/api/campanhas/{cid}/certificado")
async def certificado(cid: str, s: dict = Depends(sessao_atual)):
    c = _campanha_da_sessao(cid, s)
    sel = selos.atualizar(c)
    p = perfis.obter(c.get("perfil"))
    return {"apelido": s["apelido"], "associacao": p["associacao"]["nome"], "perfil": p["nome"],
            "data": db.agora()[:10], "selos": [x for x in sel["selos"] if x["ganho"]],
            "trimestres": [{"indice": h["indice"], "cenario": cenarios.obter(h["cenario_id"], c.get("perfil")).titulo,
                            "resumo": h.get("resumo"), "meta": h.get("meta"), "antes": h["antes"], "depois": h["depois"]}
                           for h in c["historico"]],
            "indicadores": c["indicadores"], "status": c["status"]}


class PerfilPadrao(BaseModel):
    perfil: str


@app.get("/api/facilitador/perfil-padrao", dependencies=[Depends(facilitador)])
async def ver_perfil_padrao():
    return {"perfis": perfis.listar(), "padrao": perfis.padrao()}


@app.post("/api/facilitador/perfil-padrao", dependencies=[Depends(facilitador)])
async def mudar_perfil_padrao(dados: PerfilPadrao):
    try:
        perfis.definir_padrao(dados.perfil)
    except KeyError as e:
        raise HTTPException(404, "Perfil não encontrado.") from e
    return {"padrao": perfis.padrao()}


# ------------------------------------------------------------- Banco de Vivências
@app.get("/api/vivencias/config")
async def vivencias_config():
    k = vivencias.cfg()
    return {"perfil": k["perfil"], "temas": k["temas"],
            "tipos": {t: {"nome": v["nome"], "perguntas": v["perguntas"]} for t, v in k["tipos"].items()},
            "consentimento": k["consentimento"]}


@app.post("/api/vivencias/mascarar")
async def vivencias_mascarar(dados: TextoMascarar):
    """Devolve a versão mascarada para o contribuidor conferir. Nada é gravado nem registrado em log."""
    return vivencias.mascarar_respostas(dados.respostas)


@app.post("/api/vivencias")
async def vivencias_registrar(dados: NovaVivencia, x_sessao: str = Header(default="")):
    k = vivencias.cfg()
    if dados.tipo not in k["tipos"] or dados.tema not in k["temas"]:
        raise HTTPException(400, "Tipo ou tema inválido.")
    for campo, opcoes in k["perfil"].items():
        if dados.perfil.get(campo) not in opcoes:
            raise HTTPException(400, f"Escolha uma opção de {campo}.")
    obrig = ("finalidade", "retencao", "compartilhamento")
    if not all(dados.consentimento.get(x) for x in obrig):
        raise HTTPException(400, "Para enviar, é preciso concordar com a finalidade, a retenção e o compartilhamento.")
    ids = [q["id"] for q in k["tipos"][dados.tipo]["perguntas"]]
    respostas = {i: (dados.respostas.get(i) or "").strip()[:2000] for i in ids}
    if not any(respostas.values()):
        raise HTTPException(400, "Responda pelo menos uma pergunta.")
    if any(moderacao.regras_locais(v) and moderacao.regras_locais(v).categoria in ("ofensivo", "manipulacao") for v in respostas.values() if v):
        raise HTTPException(400, "O texto não pôde ser aceito: reformule sem ofensas nem instruções ao sistema.")
    s = db.um("SELECT id FROM sessoes WHERE token=?", (x_sessao,)) if x_sessao else None
    perfil = {c: dados.perfil[c] for c in k["perfil"]}
    return vivencias.registrar(perfil, dados.tipo, dados.tema, respostas, s["id"] if s else None)


@app.post("/api/vivencias/excluir")
async def vivencias_excluir(dados: Codigo):
    if not vivencias.excluir_por_codigo(dados.codigo):
        raise HTTPException(404, "Código não encontrado (a vivência pode já ter sido excluída).")
    return {"ok": True}


@app.get("/api/vivencias/publicas")
async def vivencias_publicas():
    return {"vivencias": [{"id": v["id"], "tema": vivencias.cfg()["temas"].get(v["tema"], v["tema"]), "tipo": v["tipo"],
                           "perfil": vivencias.perfil_texto(v["perfil"]), "trecho": vivencias.trecho(v), "ficticia": bool(v["ficticia"])}
                          for v in vivencias.listar("aprovada")]}


@app.get("/api/facilitador/vivencias", dependencies=[Depends(facilitador)])
async def facilitador_vivencias():
    return {"vivencias": [{**v, "perfil_texto": vivencias.perfil_texto(v["perfil"]), "codigo_hash": None}
                          for v in vivencias.listar()],
            "personas": vivencias.personas(),
            "bloqueios": db.varios("SELECT destino, tipos, criado_em FROM bloqueios_envio ORDER BY id DESC LIMIT 20")}


@app.post("/api/facilitador/vivencias/{vid}/status", dependencies=[Depends(facilitador)])
async def facilitador_status_vivencia(vid: str, dados: StatusVivencia):
    v = db.um("SELECT risco FROM vivencias WHERE id=?", (vid,))
    if not v:
        raise HTTPException(404, "Vivência não encontrada.")
    if dados.status not in ("aprovada", "rejeitada", "em_revisao"):
        raise HTTPException(400, "Status inválido.")
    risco = v["risco"] if isinstance(v["risco"], dict) else __import__("json").loads(v["risco"])
    if dados.status == "aprovada" and risco.get("nivel") == "alto":
        raise HTTPException(400, "Bloqueada: risco alto de reidentificação (" + "; ".join(risco.get("motivos", [])) + ").")
    db.atualizar("vivencias", vid, {"status": dados.status})
    return {"ok": True}


@app.post("/api/facilitador/personas/gerar", dependencies=[Depends(facilitador)])
async def facilitador_gerar_personas():
    try:
        return await vivencias.gerar_personas(Ctx())
    except (ErroLLM, vivencias.mascaramento.EnvioBloqueado) as e:
        raise HTTPException(503, str(e)) from e


@app.post("/api/facilitador/cenarios/gerar-de-vivencias", dependencies=[Depends(facilitador)])
async def facilitador_cenario_de_vivencias():
    try:
        return await vivencias.gerar_cenario(Ctx())
    except (ErroLLM, vivencias.mascaramento.EnvioBloqueado) as e:
        raise HTTPException(503, str(e)) from e


class Ensaio(BaseModel):
    titulo: str = Field(default="", max_length=200)
    contexto: str = Field(default="", max_length=2000)
    teto: int = 0
    linhas: list[dict] = []
    opcoes: list[str] = []
    criterios: list[str] = []
    stakeholders: list[str] = []
    meta: str = ""
    responsavel: str = ""
    comunicacao: list[str] = []


@app.post("/api/ensaio/simular")
async def ensaio_simular(dados: Ensaio):
    """Não grava nada do ensaio no servidor (só o custo agregado da chamada)."""
    from . import ensaio
    if not dados.linhas and not dados.contexto.strip():
        raise HTTPException(400, "Descreva a decisão e o orçamento.")
    todo = " ".join([dados.titulo, dados.contexto, *dados.opcoes])
    local = moderacao.regras_locais(mascaramento.mascarar(todo, generalizar_valores=False)["texto"])
    if local and local.categoria in ("ofensivo", "manipulacao"):
        raise HTTPException(400, local.motivo)
    try:
        return await ensaio.simular(dados.model_dump(), Ctx())
    except (ErroLLM, mascaramento.EnvioBloqueado) as e:
        raise HTTPException(503, str(e)) from e


@app.get("/api/ensaio/stakeholders")
async def ensaio_stakeholders():
    from . import vivencias as v
    base = ["Associados do varejo", "Associados de serviços", "Diretoria", "Conselho", "Equipe da associação", "Prefeitura", "Câmara municipal",
            "Imprensa local", "Parceiro (Sebrae, banco, cooperativa)", "Fornecedores", "Outra entidade"]
    return {"stakeholders": base, "personas": [{"nome": p.get("nome"), "papel": p.get("papel"), "grupo": p.get("papel_grupo"), "fontes": p.get("fontes")} for p in v.personas()]}


@app.get("/api/perfis")
async def listar_perfis():
    return {"perfis": perfis.listar(), "padrao": perfis.padrao()}


@app.get("/api/facilitador/partidas", dependencies=[Depends(facilitador)])
async def partidas():
    linhas = db.varios("SELECT c.*, s.apelido FROM campanhas c JOIN sessoes s ON s.id=c.sessao_id "
                       "ORDER BY c.criado_em DESC")
    return {"partidas": [{"campanha_id": c["id"], "apelido": c["apelido"], "status": c["status"],
                          "cenario_atual": c["indice_atual"], "total": len(c["cenarios"]),
                          "indicadores": c["indicadores"], "custo": custos.resumo("campanha_id", c["id"])}
                         for c in linhas],
            "gasto_mes_brl": round(custos.gasto_mes_brl(), 2),
            "orcamento_mensal_brl": config.jogo()["limites"]["orcamento_mensal_brl"]}


@app.get("/api/facilitador/cenarios", dependencies=[Depends(facilitador)])
async def listar_cenarios():
    return {"cenarios": [{**cenarios.publico(c), "status": c.status} for c in cenarios.todos(incluir_pendentes=True)]}


@app.post("/api/facilitador/cenarios/{cid}/status", dependencies=[Depends(facilitador)])
async def mudar_status(cid: str, dados: StatusCenario):
    if dados.status not in ("aprovado", "rejeitado", "pendente_revisao"):
        raise HTTPException(400, "Status inválido.")
    try:
        return cenarios.definir_status(cid, dados.status).model_dump()
    except KeyError as e:
        raise HTTPException(404, "Cenário gerado não encontrado (curados não mudam de status).") from e


@app.get("/api/facilitador/cenarios/{cid}/decisoes", dependencies=[Depends(facilitador)])
async def decisoes_do_cenario(cid: str):
    ts = db.varios("SELECT t.*, s.apelido FROM tentativas t JOIN sessoes s ON s.id=t.sessao_id "
                   "WHERE t.cenario_id=? AND t.status='concluida' ORDER BY t.criado_em", (cid,))
    return {"decisoes": [{"apelido": t["apelido"], "tentativa_id": t["id"], "decisao": t["decisao"],
                          "modo": t["modo"], "variacao": t["resultado"]["indicadores"]["variacao"],
                          "alocacao": t.get("alocacao"),
                          "competencias": {c["id"]: c["nivel"] for c in (t.get("devolutiva") or {}).get("competencias", [])},
                          "trade_offs": (t.get("devolutiva") or {}).get("trade_offs", [])} for t in ts]}


@app.get("/api/facilitador/export.csv", dependencies=[Depends(facilitador)])
async def exportar_csv():
    comp = list(config.rubrica()["competencias"].keys())
    ts = db.varios("SELECT t.*, s.apelido FROM tentativas t JOIN sessoes s ON s.id=t.sessao_id "
                   "WHERE t.status='concluida' ORDER BY s.apelido, t.criado_em")
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["apelido", "campanha", "cenario", "tentativa", "modo", "data", "decisao",
                *[f"delta_{i}" for i in config.INDICADORES], *[f"nivel_{c}" for c in comp]])
    for t in ts:
        var = t["resultado"]["indicadores"]["variacao"]
        niv = {c["id"]: c["nivel"] for c in (t.get("devolutiva") or {}).get("competencias", [])}
        w.writerow([t["apelido"], t["campanha_id"], t["cenario_id"], t["id"], t["modo"], t["criado_em"],
                    t["decisao"].replace("\n", " "), *[var.get(i) for i in config.INDICADORES],
                    *[niv.get(c) for c in comp]])
    return StreamingResponse(iter(["﻿" + buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": 'attachment; filename="desempenho.csv"'})


@app.get("/api/facilitador/fatos", dependencies=[Depends(facilitador)])
async def listar_fatos():
    return {"fatos": fatos.todos(incluir_pendentes=True)}


@app.post("/api/facilitador/fatos/{fid}/status", dependencies=[Depends(facilitador)])
async def mudar_status_fato(fid: str, dados: StatusCenario):
    if dados.status not in ("aprovado", "rejeitado", "pendente_revisao"):
        raise HTTPException(400, "Status inválido.")
    try:
        return fatos.definir_status(fid, dados.status)
    except KeyError as e:
        raise HTTPException(404, "Fato não encontrado.") from e


@app.post("/api/facilitador/noticias/gerar", dependencies=[Depends(facilitador)])
async def gerar_de_noticias(max_cenarios: int = 3):
    from .news import pipeline
    return await pipeline.executar(max_cenarios=max(1, min(max_cenarios, 5)))


# ------------------------------------------------------------------------ SPA
app.mount("/static", StaticFiles(directory=settings.FRONTEND_DIR), name="static")


@app.get("/manifest.webmanifest")
async def manifesto():
    return FileResponse(settings.FRONTEND_DIR / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/sw.js")
async def service_worker():
    # servido na raiz para controlar todo o site; sem cache HTTP para atualizar logo
    return FileResponse(settings.FRONTEND_DIR / "sw.js", media_type="text/javascript",
                        headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"})


@app.get("/")
@app.get("/facilitador")
@app.get("/vivencias")
@app.get("/ensaio")
@app.get("/relatorio")
@app.get("/certificado")
async def spa():
    return FileResponse(settings.FRONTEND_DIR / "index.html")
