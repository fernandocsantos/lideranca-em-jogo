"""Mecânica central: alocação do orçamento do período entre as demandas.

Tudo aqui é determinístico e instantâneo (sem IA): serve para a prévia ao vivo e para o resultado base.
"""
from __future__ import annotations

from typing import Any

from . import config
from .config import INDICADORES
from .modelos import Cenario

EXPRESSAO = {2: "favoravel", 1: "favoravel", 0: "neutra", -1: "desconfiada", -2: "insatisfeita"}


class AlocacaoInvalida(ValueError):
    pass


def anos_anteriores(c: Cenario, anterior: dict[str, int] | None = None) -> dict[str, int]:
    """Ponto de partida da Mesa do Orçamento. Ordem: decisão do trimestre anterior (mesmo id),
    valor do cenário, ou um padrão que soma ~115% do teto (para obrigar a cortar)."""
    soma = sum(d.custo for d in c.demandas) or 1
    fator = min(1.0, 1.15 * c.disponivel / soma)
    out = {}
    for d in c.demandas:
        if anterior is not None and d.id in anterior:
            v = anterior[d.id]
        elif d.ano_anterior is not None:
            v = d.ano_anterior
        else:
            v = int(round(d.custo * fator / 500) * 500)
        out[d.id] = max(0, min(d.custo, int(v)))
    return out


def horas_linha(d, valor: int) -> int:
    """Horas da equipe consumidas por uma linha: proporcionais à verba aprovada."""
    return int(round(d.horas * valor / d.custo)) if d.custo and d.horas else 0


def horas_usadas(c: Cenario, alocacao: dict[str, int], escolhas: dict[str, Any] | None = None) -> int:
    h = sum(horas_linha(d, int(alocacao.get(d.id, 0))) for d in c.demandas)
    if (escolhas or {}).get("consultou_associados") and c.relato:
        h += c.relato.consulta_horas
    return h


def normalizar(c: Cenario, alocacao: dict[str, Any], permitir_excesso: bool = False,
               escolhas: dict[str, Any] | None = None) -> dict[str, int]:
    """Valida: só demandas do cenário, valores entre 0 e o custo, soma <= disponível, horas <= equipe,
    alternativas do mesmo grupo excludentes e alternativa liberada só depois da consulta."""
    ids = {d.id: d for d in c.demandas}
    out: dict[str, int] = {}
    for did, v in (alocacao or {}).items():
        if did not in ids:
            raise AlocacaoInvalida(f"Demanda desconhecida: {did}")
        try:
            v = int(round(float(v)))
        except (TypeError, ValueError) as e:
            raise AlocacaoInvalida(f"Valor inválido para {did}") from e
        if v < 0 or v > ids[did].custo:
            raise AlocacaoInvalida(f"{ids[did].titulo}: o valor deve ficar entre R$ 0 e R$ {ids[did].custo}.")
        out[did] = v
    for d in c.demandas:
        out.setdefault(d.id, 0)
    if sum(out.values()) > c.disponivel and not permitir_excesso:
        raise AlocacaoInvalida(f"A soma passa do teto de R$ {c.disponivel}. Falta cortar R$ {sum(out.values()) - c.disponivel}.")
    consultou = bool((escolhas or {}).get("consultou_associados"))
    grupos: dict[str, list[str]] = {}
    for d in c.demandas:
        if out[d.id] > 0 and d.requer_consulta and not consultou:
            raise AlocacaoInvalida(f"{d.titulo} só fica disponível depois de consultar os associados.")
        if out[d.id] > 0 and d.grupo:
            grupos.setdefault(d.grupo, []).append(d.titulo)
    for nomes in grupos.values():
        if len(nomes) > 1:
            raise AlocacaoInvalida(f"Escolha uma só alternativa: {' ou '.join(nomes)}.")
    if c.horas_equipe and not permitir_excesso:
        h = horas_usadas(c, out, escolhas)
        if h > c.horas_equipe:
            raise AlocacaoInvalida(f"As horas da equipe passam do limite: {h} h de {c.horas_equipe} h. Corte {h - c.horas_equipe} h.")
    return out


def utilidade(d, valor: int, regras: dict[str, Any]) -> float:
    f = valor / d.custo if d.custo else 0.0
    if f <= 0:
        return 0.0
    if f >= 1:
        return 1.0
    return f if f >= d.minimo_util else f * float(regras["fator_abaixo_minimo"])


def calcular(c: Cenario, alocacao: dict[str, int], escolhas: dict[str, Any] | None = None,
             regras_ind: dict[str, Any] | None = None) -> dict[str, Any]:
    """Pontos brutos por indicador, postura prevista de quem pediu e auditoria."""
    regras_ind = regras_ind or config.indicadores()
    r = regras_ind["alocacao"]
    atores = {a.id: a for a in c.atores}
    pontos = {i: 0.0 for i in INDICADORES}
    auditoria: list[dict[str, Any]] = []
    demandas = []
    for d in c.demandas:
        v = alocacao.get(d.id, 0)
        u = utilidade(d, v, r)
        for ind, p in d.efeitos.items():
            if u:
                pontos[ind] += p * u
                auditoria.append({"regra": "alocacao", "indicador": ind, "pontos": round(p * u, 2),
                                  "detalhe": f"{d.titulo}: R$ {v} de R$ {d.custo} (efeito {p:+g} × {u:.2f})",
                                  "evidencia": ""})
        for ind, p in d.efeitos_adiar.items():
            if u < 1:
                pts = p * (1 - u)
                pontos[ind] += pts
                auditoria.append({"regra": "adiamento", "indicador": ind, "pontos": round(pts, 2),
                                  "detalhe": f"{d.titulo} {'adiada' if u == 0 else 'parcial'} "
                                             f"(efeito {p:+g} × {1 - u:.2f})", "evidencia": ""})
        sol = atores.get(d.solicitante)
        base = sol.postura_inicial if sol else 0
        if u >= r["utilidade_alta"]:
            post = min(2, base + 1)
        elif u == 0 and sol and sol.influencia >= 4:
            post = -2
        elif u == 0:
            post = max(-2, base - 2)   # pedido adiado: a insatisfação fica visível
        elif u < r["utilidade_baixa"]:
            post = max(-2, base - 1)
        else:
            post = base
        demandas.append({"id": d.id, "valor": v, "custo": d.custo, "fracao": round(v / d.custo, 3) if d.custo else 0,
                         "utilidade": round(u, 3), "solicitante": d.solicitante,
                         "postura_prevista": post, "expressao": EXPRESSAO[post]})
    saldo = c.disponivel - sum(alocacao.values())
    if c.disponivel and saldo > 0:
        pts = (saldo / c.disponivel) * 10 * float(r["saude_por_10pct_saldo"])
        pontos["saude_financeira"] += pts
        auditoria.append({"regra": "saldo", "indicador": "saude_financeira", "pontos": round(pts, 2),
                          "detalhe": f"R$ {saldo} guardados ({saldo / c.disponivel:.0%} do disponível)", "evidencia": ""})
    trocadas = set((escolhas or {}).get("hipoteses_trocadas") or [])
    for h in c.hipoteses:
        if h.id in trocadas:
            for ind, p in h.efeito_alternativa.items():
                pontos[ind] += float(p)
                auditoria.append({"regra": "hipotese", "indicador": ind, "pontos": float(p),
                                  "detalhe": f"Hipótese ajustada: {h.alternativa}", "evidencia": ""})
    for chave, efeitos in r.get("bonus_decisao", {}).items():
        if (escolhas or {}).get(chave):
            for ind, p in efeitos.items():
                pontos[ind] += float(p)
                auditoria.append({"regra": "decisao", "indicador": ind, "pontos": float(p),
                                  "detalhe": f"Decisão com {chave.replace('_', ' ')}", "evidencia": ""})
    return {"pontos": pontos, "demandas": demandas, "saldo": saldo, "disponivel": c.disponivel,
            "auditoria": auditoria}


def previa(c: Cenario, alocacao: dict[str, Any], antes: dict[str, float],
           escolhas: dict[str, Any] | None = None) -> dict[str, Any]:
    from .indicadores import consolidar
    aloc = normalizar(c, alocacao, permitir_excesso=True, escolhas=escolhas)
    excedente = max(0, sum(aloc.values()) - c.disponivel)
    horas = horas_usadas(c, aloc, escolhas)
    horas_exc = max(0, horas - c.horas_equipe) if c.horas_equipe else 0
    calc = calcular(c, aloc, escolhas)
    cons = consolidar(antes, calc["pontos"], {i: 0.0 for i in INDICADORES})
    tend = {i: ("sobe" if v > 0.5 else "desce" if v < -0.5 else "estavel") for i, v in cons["variacao"].items()}
    return {"saldo": calc["saldo"], "disponivel": calc["disponivel"], "demandas": calc["demandas"],
            "variacao": cons["variacao"], "tendencia": tend, "excedente": excedente,
            "fechado": excedente == 0 and horas_exc == 0, "horas_usadas": horas,
            "horas_equipe": c.horas_equipe, "horas_excedente": horas_exc,
            "horas_linhas": {d.id: horas_linha(d, aloc.get(d.id, 0)) for d in c.demandas}}


def progresso_meta(c: Cenario, aloc: dict[str, int], escolhas: dict[str, Any] | None,
                   depois: dict[str, float]) -> dict[str, Any] | None:
    """Estimativa determinística do avanço da meta que o próprio jogador definiu.

    A meta é ligada à demanda cuja "meta_sugerida" coincide com o "o quê" escolhido (ou à demanda mais
    financiada). Previsto = quantidade × utilidade da verba × fator de engajamento dos associados.
    """
    k = (escolhas or {}).get("construtor") or {}
    try:
        alvo = int(str(k.get("qtd") or "0").strip() or 0)
    except ValueError:
        alvo = 0
    oque = (k.get("oqueLivre") or "").strip() or ((k.get("oque") or [""])[0])
    if alvo <= 0 or not oque:
        return None
    regras = config.indicadores()["alocacao"]
    d = next((x for x in c.demandas if x.meta_sugerida and x.meta_sugerida == oque), None)
    if d is None:
        financiadas = [x for x in c.demandas if aloc.get(x.id, 0) > 0]
        d = max(financiadas, key=lambda x: aloc.get(x.id, 0) / x.custo, default=None)
    u = utilidade(d, aloc.get(d.id, 0), regras) if d else 0.0
    eng = float(depois.get("engajamento", 50))
    fator = max(0.5, min(1.1, 0.75 + 0.5 * (eng - 50) / 100))
    previsto = int(round(alvo * min(1.0, u * fator)))
    pct = round(100 * previsto / alvo)
    situacao = "no caminho" if pct >= 80 else "atrasada" if pct >= 40 else "longe da meta"
    return {"texto": (escolhas or {}).get("meta") or f"{alvo} {oque}", "alvo": alvo, "unidade": oque,
            "previsto": previsto, "pct": pct, "situacao": situacao, "demanda_id": d.id if d else None,
            "explicacao": (f"{d.titulo}: {int(u * 100)}% do efeito da verba × engajamento dos associados "
                           f"({eng:.0f}/100)") if d else "Nenhum pedido financiado ligado à meta."}
