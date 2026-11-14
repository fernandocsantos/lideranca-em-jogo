"""Pipeline de uma tentativa: MiroFish (ou contingência) -> sinais -> indicadores -> devolutiva."""
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import unicodedata
from typing import Any

from . import alocacao as alocacao_mod
from . import cenarios, config, custos, db, devolutiva, indicadores, settings, sinais
from .contingencia import simular as simular_contingencia
from .esclarecimento import decisao_completa
from .llm import Ctx
from .mirofish_client import ErroMiroFish, MiroFish, novo
from .modelos import Cenario

log = logging.getLogger(__name__)

AVISO_CONTINGENCIA = ("Modo de contingência: o simulador multiagente (MiroFish) não está disponível agora. "
                      "Esta rodada usou uma simulação simplificada feita diretamente por um modelo de linguagem — "
                      "os resultados são mais esquemáticos.")


def _progresso(tid: str, etapa: str, pct: int, parciais: list[dict] | None = None) -> None:
    dados: dict[str, Any] = {"etapa": etapa, "progresso": max(0, min(100, int(pct)))}
    if parciais is not None:
        dados["parciais"] = parciais[-6:]
    db.atualizar("tentativas", tid, dados)


def _norm(t: str) -> str:
    t = unicodedata.normalize("NFKD", t.lower())
    return "".join(c for c in t if not unicodedata.combining(c))


def casar_perfis(c: Cenario, perfis: list[dict]) -> dict[str, int]:
    """Associa atores do cenário aos agentes gerados pelo MiroFish (por semelhança de nome)."""
    mapa: dict[str, int] = {}
    usados: set[int] = set()
    for a in c.atores:
        termos = [w for w in re.findall(r"[a-z]{3,}", _norm(a.nome))]
        melhor, pontos = None, 0
        for p in perfis:
            aid = int(p.get("user_id", p.get("agent_id", -1)))
            if aid in usados:
                continue
            alvo = _norm(" ".join(str(p.get(k, "")) for k in ("name", "username", "realname", "bio")))
            s = sum(1 for t in termos if t in alvo)
            if s > pontos:
                melhor, pontos = aid, s
        if melhor is not None:
            mapa[a.id] = melhor
            usados.add(melhor)
    return mapa


async def tipos_de_atores(mf: MiroFish, graph_id: str | None) -> list[str]:
    """Tipos de entidade do grafo, sem os genéricos (Person/Organization).

    O Zep extrai do texto menções genéricas ("diretoria", "lojistas", "clube") que caem nos tipos
    genéricos e virariam agentes extras. Filtrar por tipo específico mantém os atores do cenário.
    """
    if not graph_id:
        return []
    excluir = set(config.jogo()["mirofish"].get("tipos_genericos_excluidos", ["Person", "Organization"]))
    try:
        d = await mf.entidades(graph_id)
    except ErroMiroFish as e:
        log.warning("Não foi possível listar entidades (%s); sem filtro de tipos.", e)
        return []
    return sorted(t for t in d.get("entity_types", []) if t not in excluir)


async def _grafo_base(mf: MiroFish, c: Cenario, tid: str) -> str:
    material = cenarios.material_semente(c)
    chave = hashlib.sha256(material.encode()).hexdigest()
    cache = db.um("SELECT * FROM grafos_cache WHERE chave=?", (chave,))
    if cache:
        return cache["graph_id"]
    ont = await mf.gerar_ontologia(material, f"Base do cenário fictício '{c.titulo}'.", f"base-{c.id}")
    task = await mf.construir_grafo(ont["project_id"])
    prazo = config.jogo()["mirofish"]["timeout_total_min"] * 60

    async def prog(d):
        _progresso(tid, "Construindo o grafo de conhecimento do cenário", 5 + int(d.get("progress", 0)) // 7)

    fim = await mf.aguardar(lambda: mf.tarefa(task), lambda d: d.get("status") == "completed",
                            lambda d: d.get("status") == "failed", prazo, prog)
    graph_id = (fim.get("result") or {}).get("graph_id")
    if not graph_id:
        raise ErroMiroFish("construção do grafo não devolveu graph_id")
    db.inserir("grafos_cache", {"chave": chave, "graph_id": graph_id, "project_id": ont["project_id"],
                                "criado_em": db.agora()})
    return graph_id


async def executar_mirofish(mf: MiroFish, c: Cenario, decisao: str, rodadas: int, tid: str,
                            ctx: Ctx, alocacao: dict[str, int] | None = None,
                            experiencias: list[str] | None = None) -> tuple[str, list[dict], dict]:
    cfg = config.jogo()
    prazo = cfg["mirofish"]["timeout_total_min"] * 60
    info: dict[str, Any] = {}

    # 1) Grafo (com cache por cenário)
    _progresso(tid, "Construindo o grafo de conhecimento do cenário", 3)
    requisito = cenarios.requisito_simulacao(c, decisao, alocacao)
    material = cenarios.material_semente(c, decisao, alocacao, experiencias)
    sim_id = None
    if cfg["mirofish"].get("reutilizar_grafo", True):
        graph_id = await _grafo_base(mf, c, tid)
        ont = await mf.gerar_ontologia(material, requisito, f"tentativa-{tid}")
        try:
            sim_id = await mf.criar_simulacao(ont["project_id"], graph_id)
            info.update(project_id=ont["project_id"], graph_id=graph_id, grafo_reutilizado=True)
        except ErroMiroFish as e:
            log.warning("Reuso de grafo recusado (%s); construindo grafo completo.", e)
    if sim_id is None:
        ont = await mf.gerar_ontologia(material, requisito, f"tentativa-{tid}")
        task = await mf.construir_grafo(ont["project_id"])
        fim = await mf.aguardar(lambda: mf.tarefa(task), lambda d: d.get("status") == "completed",
                                lambda d: d.get("status") == "failed", prazo)
        graph_id = (fim.get("result") or {}).get("graph_id")
        sim_id = await mf.criar_simulacao(ont["project_id"], None)
        info.update(project_id=ont["project_id"], graph_id=graph_id, grafo_reutilizado=False)
    info["simulation_id"] = sim_id
    db.atualizar("tentativas", tid, {"mirofish": info})

    # 2) Personas
    _progresso(tid, "Criando as personas dos agentes", 20)
    tipos = await tipos_de_atores(mf, info.get("graph_id"))
    info["entity_types"] = tipos
    prep = await mf.preparar(sim_id, tipos or None)
    if prep.get("status") != "ready" and not prep.get("already_prepared"):
        task_id = prep.get("task_id")

        async def prog_p(d):
            _progresso(tid, "Criando as personas dos agentes", 20 + int(d.get("progress", 0)) // 7)

        await mf.aguardar(lambda: mf.status_preparo(sim_id, task_id),
                          lambda d: d.get("status") in ("completed", "ready") or d.get("already_prepared"),
                          lambda d: d.get("status") == "failed", prazo, prog_p)
    perfis = await mf.perfis(sim_id)
    max_ag = int(cfg["simulacao"]["max_agentes"])
    n_ag = max(1, len(perfis))
    if n_ag > max_ag:
        # Mantém o orçamento agentes×rodadas: reduz rodadas proporcionalmente.
        rodadas = max(3, (rodadas * max_ag) // n_ag)
        log.warning("MiroFish gerou %s agentes (> %s); rodadas reduzidas para %s", n_ag, max_ag, rodadas)
    info["mapa_agentes"] = casar_perfis(c, perfis)
    info["agentes"] = n_ag
    info["rodadas"] = rodadas
    db.atualizar("tentativas", tid, {"mirofish": info, "rodadas": rodadas})

    # 3) Simulação
    # Nesta versão do MiroFish, run-status/actions não contam rodadas nem ações, e o "ambiente vivo"
    # aparece já durante a execução. O sinal confiável é a atividade gravada no banco da simulação
    # (posts + comentários): consideramos concluído quando ela para de crescer por um tempo.
    noturnas = int(cfg["mirofish"].get("rodadas_noturnas", 8))
    estabilidade = float(cfg["mirofish"].get("estabilidade_s", 90))
    nomes_agentes = {int(p.get("user_id", p.get("agent_id", -1))): p.get("name") or p.get("username") or "?"
                     for p in perfis}
    _progresso(tid, "Simulando reações (aguardando as primeiras interações)", 35)
    await mf.iniciar(sim_id, rodadas + noturnas)
    esperado = max(1, int(n_ag * rodadas * 0.6))
    relogio = asyncio.get_event_loop().time
    inicio = relogio()
    estado = {"total": -1, "desde": inicio, "base": None}

    async def consultar_execucao():
        d = await mf.status_execucao(sim_id)
        try:
            itens = await mf.atividade(sim_id)
        except ErroMiroFish:
            itens = None
        if itens is not None:
            if estado["base"] is None:
                estado["base"] = len(itens)
            if len(itens) != estado["total"]:
                estado["total"], estado["desde"] = len(itens), relogio()
            novos = len(itens) - estado["base"]
            parado = relogio() - estado["desde"]
            if d.get("runner_status") == "running" and novos > 0 and parado >= estabilidade:
                d = {**d, "runner_status": "completed"}
            d["_itens"] = itens
            d["_novos"] = novos
        return d

    async def prog_s(d):
        itens = d.get("_itens")
        if itens is None:
            return
        ult = [_item_legivel(i, nomes_agentes) for i in itens[-6:]]
        pct = 35 + int(45 * min(1.0, d.get("_novos", 0) / esperado))
        _progresso(tid, f"Simulando reações ({d.get('_novos', 0)} interações dos agentes)", pct, ult)

    fim = await mf.aguardar(consultar_execucao,
                            lambda d: d.get("runner_status") in ("completed", "stopped"),
                            lambda d: d.get("runner_status") == "failed", prazo, prog_s)
    custos.registrar_mirofish(ctx, n_ag, rodadas)
    acoes = [_item_legivel(i, nomes_agentes) for i in (fim.get("_itens") or await mf.atividade(sim_id))]
    info["interacoes"] = len(acoes)
    db.atualizar("tentativas", tid, {"mirofish": info})

    # 4) Relatório (opcional: o Report Agent leva ~4 min; sem ele, os sinais saem direto das interações)
    if not cfg["mirofish"].get("gerar_relatorio", False):
        texto = "\n".join(f"- {a['autor']} ({a['tipo']}): {a['texto']}" for a in acoes[-150:])
        return f"Interações registradas na simulação:\n{texto}", acoes[-200:], info
    _progresso(tid, "Gerando o relatório da simulação", 82, acoes[-6:])
    g = await mf.gerar_relatorio(sim_id)
    await mf.aguardar(lambda: mf.status_relatorio(sim_id, g.get("task_id")),
                      lambda d: d.get("status") == "completed", lambda d: d.get("status") == "failed", prazo)
    rel = await mf.relatorio(sim_id)
    return rel.get("markdown_content") or rel.get("content") or "", acoes[-200:], info


def _item_legivel(i: dict, nomes: dict[int, str]) -> dict:
    try:
        autor = nomes.get(int(i.get("user_id", -1)), "?")
    except (TypeError, ValueError):
        autor = "?"
    return {"rodada": None, "autor": autor, "tipo": "comentário" if "comment_id" in i else "publicação",
            "texto": str(i.get("content") or "")[:400], "quando": i.get("created_at")}


def perfil_da_campanha(campanha_id: str) -> str | None:
    r = db.um("SELECT perfil FROM campanhas WHERE id=?", (campanha_id,))
    return r["perfil"] if r else None


def reacoes_previstas(c: Cenario, demandas_calc: list[dict]) -> list[dict]:
    """Postura de cada ator antes da simulação: quem pediu reage à alocação; os demais ficam como estavam."""
    por_sol = {d["solicitante"]: d for d in demandas_calc}
    out = []
    for a in c.atores:
        d = por_sol.get(a.id)
        out.append({"ator_id": a.id, "nome": a.nome, "tipo": a.tipo, "postura_inicial": a.postura_inicial,
                    "postura_final": d["postura_prevista"] if d else a.postura_inicial,
                    "reacao": "", "citacao": "", "prevista": True})
    return out


def resultado_base(c: Cenario, aloc: dict[str, int], escolhas: dict, antes: dict) -> dict:
    """Resultado imediato, só com a alocação (sem IA). A simulação depois só ajusta (±ajuste_llm_max)."""
    calc = alocacao_mod.calcular(c, aloc, escolhas)
    cons = indicadores.consolidar(antes, calc["pontos"], {i: 0.0 for i in config.INDICADORES})
    cons["auditoria"] = calc["auditoria"] + cons["auditoria"]
    return {"fase": "base", "resumo": "", "momentos": [], "reacoes": reacoes_previstas(c, calc["demandas"]),
            "meta": alocacao_mod.progresso_meta(c, aloc, escolhas, cons["depois"]),
            "sinais": [], "flags": [], "indicadores": cons, "pontos_base": calc["pontos"],
            "demandas": calc["demandas"], "saldo": calc["saldo"], "disponivel": calc["disponivel"],
            "relatorio": "", "acoes": []}


async def gerar_devolutiva(tid: str) -> None:
    """Devolutiva logo após a decisão (não espera a simulação dos agentes)."""
    t = db.um("SELECT * FROM tentativas WHERE id=?", (tid,))
    if not t:
        return
    c = cenarios.obter(t["cenario_id"], perfil_da_campanha(t["campanha_id"]))
    ctx = Ctx(t["sessao_id"], t["campanha_id"], tid)
    try:
        dev = await devolutiva.gerar(c, decisao_completa(t["decisao"], t["esclarecimentos"]), None,
                                     (t["resultado"] or {}).get("indicadores", {}).get("variacao", {}), ctx,
                                     alocacao=t["alocacao"] or {})
        db.atualizar("tentativas", tid, {"devolutiva": dev})
    except Exception as e:  # noqa: BLE001
        log.exception("Devolutiva da tentativa %s falhou", tid)
        db.atualizar("tentativas", tid, {"devolutiva": {"erro": f"Devolutiva indisponível: {e}"}})


async def processar(tid: str, mf: MiroFish | None = None) -> None:
    t = db.um("SELECT * FROM tentativas WHERE id=?", (tid,))
    if not t:
        return
    c = cenarios.obter(t["cenario_id"], perfil_da_campanha(t["campanha_id"]))
    ctx = Ctx(t["sessao_id"], t["campanha_id"], tid)
    decisao = decisao_completa(t["decisao"], t["esclarecimentos"])
    aloc = t.get("alocacao") or None
    escolhas = t.get("escolhas") or {}
    experiencias = escolhas.get("experiencias_citadas") or None
    if not experiencias:
        from . import conselho
        experiencias = [conselho.frase_citacao(e) for e in conselho.aprovadas(conselho.temas_do_cenario(c))[:2]] or None
    rodadas = int(t["rodadas"] or config.jogo()["simulacao"]["rodadas_padrao"])
    db.atualizar("tentativas", tid, {"status": "executando"})
    mf = mf or novo()
    modo, aviso = "mirofish", None
    try:
        relatorio, acoes = "", []
        usar_mf = not settings.MIROFISH_DESATIVADO and await mf.saudavel()
        if usar_mf:
            try:
                prazo = config.jogo()["mirofish"]["timeout_total_min"] * 60
                relatorio, acoes, _ = await asyncio.wait_for(
                    executar_mirofish(mf, c, decisao, rodadas, tid, ctx, aloc, experiencias), timeout=prazo)
            except (ErroMiroFish, asyncio.TimeoutError) as e:
                log.warning("MiroFish falhou na tentativa %s: %s", tid, e)
                usar_mf = False
                aviso = AVISO_CONTINGENCIA + f" (Motivo técnico: {str(e)[:160]})"
        if not usar_mf:
            modo = "contingencia"
            aviso = aviso or AVISO_CONTINGENCIA
            db.atualizar("tentativas", tid, {"modo": modo, "aviso": aviso})
            _progresso(tid, "Simulação simplificada (contingência)", 40)
            texto_dec = decisao
            if aloc and c.demandas:
                texto_dec += "\n" + "\n".join(cenarios.bloco_alocacao(c, aloc))
            relatorio, acoes = await simular_contingencia(c, texto_dec, rodadas, ctx)
            _progresso(tid, "Simulação simplificada (contingência)", 75, [
                {"rodada": a["round_num"], "autor": a["agent_name"], "tipo": a["action_type"],
                 "texto": a["content"]} for a in acoes[-6:]])
            acoes = [{"rodada": a["round_num"], "autor": a["agent_name"], "ator_id": a["ator_id"],
                      "tipo": a["action_type"], "texto": a["content"]} for a in acoes]
        db.atualizar("tentativas", tid, {"modo": modo, "aviso": aviso})

        _progresso(tid, "Analisando as reações", 88)
        texto_ext = decisao
        if aloc and c.demandas:
            texto_ext += "\n" + "\n".join(cenarios.bloco_alocacao(c, aloc))
        ext = await sinais.extrair(c, texto_ext, relatorio, acoes, ctx)
        sinais_calc = indicadores.calcular(t["indicadores_antes"], ext, c)
        anterior = db.um("SELECT resultado FROM tentativas WHERE id=?", (tid,))["resultado"] or {}
        base_pts = anterior.get("pontos_base") or {i: 0.0 for i in config.INDICADORES}
        final = indicadores.consolidar(t["indicadores_antes"], base_pts, sinais_calc["brutos"])
        final["auditoria"] = ((anterior.get("indicadores") or {}).get("auditoria", [])[:-6]
                              + sinais_calc["auditoria_sinais"] + final["auditoria"])

        nomes = {a.id: a for a in c.atores}
        resultado = {
            **anterior,
            "fase": "completo",
            "meta": alocacao_mod.progresso_meta(c, aloc or {}, escolhas, final["depois"]) if aloc else None,
            "resumo": ext.resumo_narrativo,
            "momentos": [{"ator_id": m.ator_id, "nome": nomes[m.ator_id].nome, "tipo": nomes[m.ator_id].tipo,
                          "fala": m.fala} for m in ext.momentos],
            "reacoes": [{"ator_id": r.ator_id, "nome": nomes[r.ator_id].nome, "tipo": nomes[r.ator_id].tipo,
                         "postura_inicial": nomes[r.ator_id].postura_inicial, "postura_final": r.postura_final,
                         "reacao": r.reacao, "citacao": r.citacao} for r in ext.reacoes],
            "sinais": [s.model_dump() for s in ext.sinais],
            "flags": ext.flags,
            "indicadores": final,
            "relatorio": relatorio[:20000],
            "acoes": acoes[:200],
        }
        db.atualizar("tentativas", tid, {"status": "concluida", "etapa": "Concluída", "progresso": 100,
                                         "fase": "completo", "resultado": resultado,
                                         "indicadores_depois": final["depois"]})
        if not aloc:  # fluxo antigo (sem orçamento): a devolutiva é gerada aqui, depois da simulação
            await gerar_devolutiva(tid)
    except Exception as e:  # noqa: BLE001 — o job nunca pode ficar pendurado
        log.exception("Tentativa %s falhou", tid)
        db.atualizar("tentativas", tid, {"status": "erro", "erro": f"Não foi possível concluir a simulação: {e}",
                                         "etapa": "Erro"})
