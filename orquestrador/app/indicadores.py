"""Conversão determinística e auditável: sinais extraídos -> variação dos indicadores.

O LLM só extrai sinais (app/sinais.py). Toda a aritmética está aqui, guiada por
config/indicadores.yaml. Mesma entrada => mesma saída.
"""
from __future__ import annotations

from typing import Any

from . import config
from .config import INDICADORES
from .modelos import Cenario, ExtracaoSinais


def _limitar(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def calcular(antes: dict[str, float], extracao: ExtracaoSinais, cenario: Cenario,
             regras: dict[str, Any] | None = None) -> dict[str, Any]:
    regras = regras or config.indicadores()
    lim = regras["limites"]
    atores = {a.id: a for a in cenario.atores}
    brutos = {i: 0.0 for i in INDICADORES}
    auditoria: list[dict[str, Any]] = []

    # 1) Sinais
    for s in extracao.sinais:
        intens = int(_limitar(s.intensidade, -3, 3))
        base = float(regras["peso_intensidade"][str(intens)])
        ator = atores.get(s.ator_id or "")
        mult = float(regras["multiplicador_influencia"][str(int(_limitar(ator.influencia, 1, 5)))]) if ator \
            else float(regras.get("multiplicador_sem_ator", 1.0))
        pts = base * mult
        brutos[s.indicador] += pts
        auditoria.append({"regra": "sinal", "indicador": s.indicador, "pontos": round(pts, 2),
                          "detalhe": f"intensidade {intens:+d} ({base:+.0f}) × influência "
                                     f"{ator.nome if ator else 'sem ator'} ({mult})",
                          "evidencia": s.evidencia})

    # 2) Mudança de postura dos atores
    for r in extracao.reacoes:
        ator = atores.get(r.ator_id)
        if not ator:
            continue
        mudanca = int(_limitar(r.postura_final, -2, 2)) - int(_limitar(ator.postura_inicial, -2, 2))
        if mudanca == 0:
            continue
        for ind, por_unidade in regras["postura_por_tipo"].get(ator.tipo, {}).items():
            pts = mudanca * float(por_unidade)
            brutos[ind] += pts
            auditoria.append({"regra": "postura", "indicador": ind, "pontos": round(pts, 2),
                              "detalhe": f"{ator.nome} ({ator.tipo}) mudou postura {mudanca:+d} × {por_unidade}",
                              "evidencia": r.reacao})

    # 3) Flags (lista fechada)
    for f in sorted(set(extracao.flags)):
        regra = regras["flags"].get(f)
        if not regra:
            continue
        for ind, pts in regra.items():
            if ind == "descricao":
                continue
            brutos[ind] += float(pts)
            auditoria.append({"regra": "flag", "indicador": ind, "pontos": float(pts),
                              "detalhe": f"{f}: {regra.get('descricao', '')}", "evidencia": ""})

    cons = consolidar(antes, {i: 0.0 for i in INDICADORES}, brutos, regras, limitar_ajuste=False)
    return {"antes": dict(antes), "depois": cons["depois"], "variacao": cons["variacao"],
            "auditoria": auditoria + cons["auditoria"], "brutos": brutos, "auditoria_sinais": auditoria}


def consolidar(antes: dict[str, float], base: dict[str, float], ajuste: dict[str, float],
               regras: dict[str, Any] | None = None, limitar_ajuste: bool = True) -> dict[str, Any]:
    """Soma o resultado base (alocação) com o ajuste da simulação (limitado a ±ajuste_llm_max),
    aplica o limite por rodada, a elasticidade perto dos extremos e a faixa 0..100."""
    regras = regras or config.indicadores()
    lim = regras["limites"]
    amax = float(regras.get("ajuste_llm_max", 10))
    dmax = float(lim["delta_maximo_por_rodada"])
    depois: dict[str, float] = {}
    variacao: dict[str, float] = {}
    auditoria: list[dict[str, Any]] = []
    for ind in INDICADORES:
        v = float(antes[ind])
        aj = float(ajuste.get(ind, 0.0))
        aj_lim = _limitar(aj, -amax, amax) if limitar_ajuste else aj
        bruto = float(base.get(ind, 0.0)) + aj_lim
        d = _limitar(bruto, -dmax, dmax)
        if d > 0:
            el = _limitar((100 - v) / 50, lim["elasticidade_min"], lim["elasticidade_max"])
        elif d < 0:
            el = _limitar(v / 50, lim["elasticidade_min"], lim["elasticidade_max"])
        else:
            el = 1.0
        novo = round(_limitar(v + d * el, lim["minimo"], lim["maximo"]), 1)
        depois[ind] = novo
        variacao[ind] = round(novo - v, 1)
        extra = f" + ajuste da simulação {aj_lim:+.2f}" + (f" (bruto {aj:+.2f}, limitado a ±{amax:g})"
                                                           if limitar_ajuste and aj != aj_lim else "")
        auditoria.append({"regra": "consolidacao", "indicador": ind, "pontos": variacao[ind],
                          "detalhe": f"base {float(base.get(ind, 0.0)):+.2f}{extra} → limitado {d:+.2f} "
                                     f"× elasticidade {el:.2f}", "evidencia": ""})
    return {"antes": dict(antes), "depois": depois, "variacao": variacao, "auditoria": auditoria}
