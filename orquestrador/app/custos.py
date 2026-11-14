"""Controle de custo: registro de tokens, estimativa do MiroFish e limites."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from . import config, db


def _preco(modelo: str) -> dict[str, float]:
    tabela = config.llm().get("precos_usd_por_mtok", {})
    for nome, p in tabela.items():
        if modelo.startswith(nome):
            return p
    return {"entrada": 0.0, "saida": 0.0, "cache_leitura": 0.0}


def custo_usd(modelo: str, entrada: int, saida: int, cache_leitura: int = 0) -> float:
    p = _preco(modelo)
    return (entrada * p["entrada"] + saida * p["saida"] + cache_leitura * p.get("cache_leitura", 0)) / 1_000_000


def registrar(ctx: Any, tarefa: str, modelo: str, entrada: int, saida: int, cache_leitura: int = 0,
              estimado: bool = False) -> None:
    db.inserir("uso_tokens", {
        "sessao_id": getattr(ctx, "sessao_id", None),
        "campanha_id": getattr(ctx, "campanha_id", None),
        "tentativa_id": getattr(ctx, "tentativa_id", None),
        "tarefa": tarefa, "modelo": modelo, "entrada": entrada + cache_leitura, "saida": saida,
        "custo_usd": custo_usd(modelo, entrada, saida, cache_leitura), "estimado": int(estimado),
        "criado_em": db.agora(),
    })


def estimar_mirofish(agentes: int, rodadas: int) -> tuple[int, int, float]:
    e = config.llm()["mirofish_estimativa"]
    acoes = agentes * rodadas
    entrada = acoes * e["tokens_entrada_por_acao"] + e["tokens_fixos_preparacao"]
    saida = acoes * e["tokens_saida_por_acao"] + e["tokens_fixos_preparacao"] // 10
    return entrada, saida, custo_usd(e["modelo"], entrada, saida)


def registrar_mirofish(ctx: Any, agentes: int, rodadas: int) -> None:
    entrada, saida, _ = estimar_mirofish(agentes, rodadas)
    registrar(ctx, "mirofish_simulacao", config.llm()["mirofish_estimativa"]["modelo"], entrada, saida, estimado=True)


def para_brl(usd: float) -> float:
    return usd * float(config.llm().get("cambio_usd_brl", 5.5))


def gasto_mes_brl() -> float:
    inicio = datetime.now(timezone.utc).strftime("%Y-%m-01")
    r = db.um("SELECT COALESCE(SUM(custo_usd),0) AS t FROM uso_tokens WHERE criado_em >= ?", (inicio,))
    return para_brl(r["t"] if r else 0.0)


def simulacoes_hoje(sessao_id: str) -> int:
    hoje = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    r = db.um("SELECT COUNT(*) AS n FROM tentativas WHERE sessao_id=? AND criado_em >= ?", (sessao_id, hoje))
    return r["n"] if r else 0


def resumo(filtro: str, valor: str) -> dict[str, Any]:
    assert filtro in {"sessao_id", "campanha_id", "tentativa_id"}
    linhas = db.varios(
        f"SELECT tarefa, modelo, SUM(entrada) e, SUM(saida) s, SUM(custo_usd) c, MAX(estimado) est "
        f"FROM uso_tokens WHERE {filtro}=? GROUP BY tarefa, modelo", (valor,))
    total = sum(l["c"] for l in linhas)
    return {
        "itens": [{"tarefa": l["tarefa"], "modelo": l["modelo"], "tokens_entrada": l["e"], "tokens_saida": l["s"],
                   "custo_usd": round(l["c"], 4), "estimado": bool(l["est"])} for l in linhas],
        "total_usd": round(total, 4),
        "total_brl": round(para_brl(total), 2),
    }


def simulacoes_hoje_total() -> int:
    hoje = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    r = db.um("SELECT COUNT(*) AS n FROM tentativas WHERE criado_em >= ?", (hoje,))
    return r["n"] if r else 0


def pode_simular(sessao_id: str) -> tuple[bool, str]:
    lim = config.jogo()["limites"]
    if simulacoes_hoje(sessao_id) >= lim["simulacoes_por_dia"]:
        return False, f"Você atingiu o limite de {lim['simulacoes_por_dia']} simulações por dia. Volte amanhã."
    total = lim.get("simulacoes_por_dia_total")
    if total and simulacoes_hoje_total() >= int(total):
        return False, "O jogo atingiu o limite de simulações de hoje para todos os participantes. Volte amanhã."
    return True, ""


def orcamento_esgotado() -> bool:
    return gasto_mes_brl() >= float(config.jogo()["limites"]["orcamento_mensal_brl"])
