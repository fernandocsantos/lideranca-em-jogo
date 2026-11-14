"""Selos por comportamento, calculados no servidor a partir do que o jogador fez."""
from __future__ import annotations

from typing import Any

from . import config, db


def definicoes() -> dict[str, dict[str, Any]]:
    return config.carregar("selos")["selos"]


def avaliar(campanha: dict) -> set[str]:
    ganhos: set[str] = set()
    ts = db.varios("SELECT * FROM tentativas WHERE campanha_id=?", (campanha["id"],))
    por_missao: dict[int, int] = {}
    for t in ts:
        e = t.get("escolhas") or {}
        av = (t.get("resultado") or {}).get("avaliacao") or {}
        por_missao[int(t["indice"])] = por_missao.get(int(t["indice"]), 0) + 1
        if e.get("meta_mensuravel"):
            ganhos.add("meta_mensuravel")
        if e.get("consultou_associados"):
            ganhos.add("consultou_associados")
        if len(e.get("alternativas") or []) >= 2 and e.get("alternativa_escolhida"):
            ganhos.add("comparou_alternativas")
        if e.get("continuidade") in ("ajustar", "rever"):
            ganhos.add("revisou_resultados")
        if av:
            if not av.get("faltas") and e.get("meta_mensuravel"):
                ganhos.add("decisao_clara")
            if (av.get("regra") or {}).get("limites") and t.get("alocacao"):
                ganhos.add("orcamento_equilibrado")
            crit = {c["id"]: c["conceito"] for c in (av.get("desempenho") or {}).get("criterios", [])}
            if crit.get("relato") in ("A", "B"):
                ganhos.add("ouviu_rede")
            exps = av.get("expectativas") or []
            if exps and all(x["confirmada"] for x in exps):
                ganhos.add("previsao_certeira")
    if any(n >= 2 for n in por_missao.values()):
        ganhos.add("revisou_resultados")  # experimentou outro caminho
    try:
        if db.um("SELECT COUNT(*) n FROM vivencias WHERE sessao_id=?", (campanha["sessao_id"],))["n"]:
            ganhos.add("deixou_legado")
    except Exception:  # noqa: BLE001 — tabela do Banco de Vivências ainda não criada
        pass
    return ganhos


def atualizar(campanha: dict) -> dict[str, Any]:
    """Recalcula, grava e informa quais selos são novos desde a última consulta."""
    antes = set(campanha.get("selos") or [])
    agora = avaliar(campanha) | antes  # selo ganho não se perde
    if agora != antes:
        db.atualizar("campanhas", campanha["id"], {"selos": sorted(agora)})
    defs = definicoes()
    return {"selos": [{"id": k, **v, "ganho": k in agora} for k, v in defs.items()],
            "novos": [{"id": k, **defs[k]} for k in sorted(agora - antes) if k in defs]}
