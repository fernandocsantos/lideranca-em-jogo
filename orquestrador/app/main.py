"""API HTTP do orquestrador (FastAPI) + entrega da SPA."""
from __future__ import annotations

import csv
import io
import logging
import secrets
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import asyncio

from . import alocacao as aloc_mod
from . import campanha as camp
from . import cenarios, config, conselho, conversa, custos, db, esclarecimento, fila, moderacao, perfis, selos, settings, simulacao
from .llm import Ctx, ErroLLM
from .mirofish_client import novo as novo_mirofish

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def ciclo(app: FastAPI):
    db.conectar()
    conselho.preparar()
    fila.iniciar()
    yield
    await fila.parar()


app = FastAPI(title="Liderança em Jogo — orquestrador", lifespan=ciclo)


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


class AvatarEscolhido(BaseModel):
    genero: Optional[str] = None
    idade: Optional[int] = None


class Contribuicao(BaseModel):
    nome: str = Field(default="", max_length=80)
    anonimo: bool = False
    entidade: str = Field(default="", max_length=120)
    anos: Optional[int] = Field(default=None, ge=0, le=80)
    avatar: AvatarEscolhido = AvatarEscolhido()
    tema: str
    respostas: dict[str, str]
    consentimento: str  # com_nome | anonimo


class Pergunta(BaseModel):
    pergunta: str = Field(min_length=2, max_length=600)


class StatusContribuicao(BaseModel):
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
    experiencias = []
    if c["status"] == "em_andamento":
        cid = c["cenarios"][c["indice_atual"]]
        cen_obj = cenarios.obter(cid, c.get("perfil"))
        atual = cenarios.publico(cen_obj)
        # Na pauta, 1 experiência com citação curta (limite de 80 palavras por tela); as demais no conselheiro.
        experiencias = [{**e, "citacao": conselho.frase_citacao(e, max_palavras=12)}
                        for e in conselho.aprovadas(conselho.temas_do_cenario(cen_obj))[:1]]
        tentativas = [_resumo_tentativa(t) for t in db.varios(
            "SELECT * FROM tentativas WHERE campanha_id=? AND indice=? ORDER BY criado_em",
            (c["id"], c["indice_atual"]))]
    return {
        "id": c["id"], "status": c["status"], "indice_atual": c["indice_atual"], "total": len(c["cenarios"]),
        "indicadores": c["indicadores"], "historico": c["historico"], "cenario": atual, "tentativas": tentativas,
        "custo": custos.resumo("campanha_id", c["id"]), "perfil": c.get("perfil"), "selos": c.get("selos") or [],
        "experiencias": experiencias,
    }


def _resumo_tentativa(t: dict) -> dict:
    res = t.get("resultado") or {}
    return {"id": t["id"], "status": t["status"], "decisao": t["decisao"], "modo": t["modo"], "fase": t.get("fase"),
            "alocacao": t.get("alocacao"), "variacao": (res.get("indicadores") or {}).get("variacao"),
            "criado_em": t["criado_em"]}


@app.post("/api/campanhas")
async def nova_campanha(dados: Optional[NovaCampanha] = None, s: dict = Depends(sessao_atual)):
    dados = dados or NovaCampanha()
    return _estado(camp.criar(s["id"], perfil=dados.perfil, modo=dados.modo))


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
    todo = texto + "\n" + "\n".join(e.resposta for e in dados.esclarecimentos)
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
# ------------------------------------------------------------- Sala do Conselho
@app.get("/api/conselho")
async def conselho_config():
    k = conselho.cfg()
    return {"temas": [{"id": t, **v} for t, v in k["temas"].items()], "perguntas": k["perguntas"],
            "sugestoes": k["conselheiro"]["sugestoes"],
            "perguntas_por_trimestre": k["conselheiro"]["perguntas_por_trimestre"]}


@app.post("/api/conselho/contribuicoes")
async def nova_contribuicao(dados: Contribuicao, x_sessao: str = Header(default="")):
    k = conselho.cfg()
    if dados.tema not in k["temas"]:
        raise HTTPException(400, "Tema inválido.")
    if dados.consentimento not in ("com_nome", "anonimo"):
        raise HTTPException(400, "Escolha como a experiência pode ser usada.")
    ids = [p["id"] for p in k["perguntas"]]
    respostas = {i: (dados.respostas.get(i) or "").strip()[:2000] for i in ids}
    if not any(respostas.values()):
        raise HTTPException(400, "Responda pelo menos uma pergunta.")
    s = db.um("SELECT * FROM sessoes WHERE token=?", (x_sessao,)) if x_sessao else None
    ctx = Ctx(s["id"] if s else None, None, None)
    mod = await moderacao.moderar("\n".join(respostas.values()), ctx)
    if not mod.permitido and mod.categoria != "fora_de_contexto":
        raise HTTPException(400, mod.motivo or "O texto não pôde ser aceito.")
    anonimo = dados.anonimo or dados.consentimento == "anonimo" or not dados.nome.strip()
    cid = db.novo_id("contrib")
    db.inserir("contribuicoes", {
        "id": cid, "nome": "" if anonimo else dados.nome.strip(), "anonimo": int(anonimo),
        "entidade": dados.entidade.strip(), "anos": dados.anos, "avatar": dados.avatar.model_dump(),
        "tema": dados.tema, "respostas": respostas, "consentimento": "anonimo" if anonimo else "com_nome",
        "status": "em_revisao", "ficticia": 0, "sessao_id": s["id"] if s else None, "criado_em": db.agora()})
    return {"id": cid, "status": "em_revisao"}


@app.get("/api/campanhas/{cid}/selos")
async def ver_selos(cid: str, s: dict = Depends(sessao_atual)):
    return selos.atualizar(_campanha_da_sessao(cid, s))


@app.get("/api/selos")
async def lista_selos():
    return {"selos": [{"id": k, **v} for k, v in selos.definicoes().items()]}


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


@app.get("/api/campanhas/{cid}/conselheiro")
async def historico_conselheiro(cid: str, s: dict = Depends(sessao_atual)):
    c = _campanha_da_sessao(cid, s)
    hist = conselho.consultas(cid, c["indice_atual"])
    limite = int(conselho.cfg()["conselheiro"]["perguntas_por_trimestre"])
    return {"mensagens": hist, "restantes": max(0, limite - len(hist))}


@app.post("/api/campanhas/{cid}/conselheiro")
async def perguntar_conselheiro(cid: str, dados: Pergunta, s: dict = Depends(sessao_atual)):
    c = _campanha_da_sessao(cid, s)
    limite = int(conselho.cfg()["conselheiro"]["perguntas_por_trimestre"])
    if len(conselho.consultas(cid, c["indice_atual"])) >= limite:
        raise HTTPException(429, f"O conselheiro já respondeu {limite} perguntas neste trimestre.")
    ctx = Ctx(s["id"], cid, None)
    mod = await moderacao.moderar(dados.pergunta, ctx)
    if not mod.permitido:
        raise HTTPException(400, mod.motivo)
    try:
        return await conselho.responder(c, _cenario_atual(c), dados.pergunta, ctx)
    except ErroLLM as e:
        raise HTTPException(503, str(e)) from e


@app.get("/api/facilitador/contribuicoes", dependencies=[Depends(facilitador)])
async def listar_contribuicoes():
    linhas = db.varios("SELECT * FROM contribuicoes ORDER BY CASE status WHEN 'em_revisao' THEN 0 ELSE 1 END, criado_em DESC")
    return {"contribuicoes": [{**conselho.publica(x), "status": x["status"], "entidade": x["entidade"],
                               "nome_real": x["nome"], "consentimento": x["consentimento"]} for x in linhas]}


@app.post("/api/facilitador/contribuicoes/{cid}/status", dependencies=[Depends(facilitador)])
async def moderar_contribuicao(cid: str, dados: StatusContribuicao):
    if dados.status not in ("aprovada", "rejeitada", "em_revisao"):
        raise HTTPException(400, "Status inválido.")
    if not db.um("SELECT id FROM contribuicoes WHERE id=?", (cid,)):
        raise HTTPException(404, "Contribuição não encontrada.")
    db.atualizar("contribuicoes", cid, {"status": dados.status})
    return {"ok": True}


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


@app.post("/api/facilitador/noticias/gerar", dependencies=[Depends(facilitador)])
async def gerar_de_noticias(max_cenarios: int = 3):
    from .news import pipeline
    return await pipeline.executar(max_cenarios=max(1, min(max_cenarios, 5)))


# ------------------------------------------------------------------------ SPA
app.mount("/static", StaticFiles(directory=settings.FRONTEND_DIR), name="static")


@app.get("/")
@app.get("/facilitador")
@app.get("/conselho")
@app.get("/certificado")
async def spa():
    return FileResponse(settings.FRONTEND_DIR / "index.html")
