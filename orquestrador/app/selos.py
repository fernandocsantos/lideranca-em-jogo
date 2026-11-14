"""Selos por comportamento, calculados no servidor a partir do que o jogador fez."""
from __future__ import annotations

from typing import Any

from . import config, db


def definicoes() -> dict[str, dict[str, Any]]:
    return config.carregar("selos")["selos"]


def _postura(resultado: dict, ator_id: str) -> int:
    for r in resultado.get("reacoes", []):
        if r["ator_id"] == ator_id:
            return int(r.get("postura_final", 0))
    for d in resultado.get("demandas", []):
        if d.get("solicitante") == ator_id:
            return int(d.get("postura_prevista", 0))
    return 0


def avaliar(campanha: dict) -> set[str]:
    ganhos: set[str] = set()
    ts = db.varios("SELECT * FROM tentativas WHERE campanha_id=?", (campanha["id"],))
    for t in ts:
        e = t.get("escolhas") or {}
        if e.get("resumo_completo"):
            ganhos.add("decisao_clara")
        if e.get("meta_mensuravel"):
            ganhos.add("meta_mensuravel")
        if e.get("continuidade") in ("ajustar", "rever"):
            ganhos.add("revisou_resultados")
        res = t.get("resultado") or {}
        for m in db.varios("SELECT DISTINCT interlocutor FROM mensagens WHERE tentativa_id=? AND papel='jogador'", (t["id"],)):
            if m["interlocutor"] != "relatorio" and _postura(res, m["interlocutor"]) <= -1:
                ganhos.add("ouviu_discordante")
    try:
        if db.um("SELECT COUNT(*) n FROM consultas_conselheiro WHERE campanha_id=?", (campanha["id"],))["n"]:
            ganhos.add("ouviu_experiencia")
        if db.um("SELECT COUNT(*) n FROM contribuicoes WHERE sessao_id=?", (campanha["sessao_id"],))["n"]:
            ganhos.add("conselheiro_rede")
    except Exception:  # noqa: BLE001 — tabelas da Sala do Conselho ainda não criadas
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
