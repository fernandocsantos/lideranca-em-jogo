"""Avaliação determinística da missão: carimbo, "o que mais pesou", desempenho acadêmico e feedback.

Regras em config/avaliacao.yaml. Mesma entrada, mesma saída. O LLM não decide nada aqui: a simulação dos
agentes só ajusta os indicadores dentro da faixa limitada (indicadores.yaml), e esta conta usa o resultado.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from . import config, settings
from .alocacao import horas_usadas
from .modelos import Cenario

NOTA = {"A": 4, "B": 3, "C": 2, "D": 1}
LETRA = {4: "A", 3: "B", 2: "C", 1: "D"}
CHAVES_DECISAO = {"comunicacao": "Plano de comunicação", "meta_mensuravel": "Meta mensurável",
                  "revisao_programada": "Data de revisão", "consultou_associados": "Consulta aos associados",
                  "interpretou_relato": "Leitura do relato da rede"}


@lru_cache(maxsize=1)
def regras() -> dict[str, Any]:
    return yaml.safe_load((Path(settings.CONFIG_DIR) / "avaliacao.yaml").read_text(encoding="utf-8"))


def expectativas() -> list[dict[str, Any]]:
    return regras()["expectativas"]


def _cortes_sem_justificativa(c: Cenario, aloc: dict[str, int], escolhas: dict) -> list[str]:
    base = escolhas.get("ano_anterior") or {d.id: (d.ano_anterior or 0) for d in c.demandas}
    just = escolhas.get("cortes_linhas") or {}
    faltam = []
    for d in c.demandas:
        if int(aloc.get(d.id, 0)) < int(base.get(d.id, 0) or 0):
            j = just.get(d.id) or {}
            if not (j.get("motivos") or (j.get("texto") or "").strip()):
                faltam.append(d.titulo)
    return faltam


def _faltas_justificativa(c: Cenario, aloc: dict[str, int], escolhas: dict) -> list[str]:
    faltas = []
    if not (escolhas.get("motivos") or (escolhas.get("justificativa") or "").strip()):
        faltas.append("justificativa geral")
    if not escolhas.get("meta_mensuravel"):
        faltas.append("meta com quantidade, o quê e prazo")
    if not escolhas.get("revisao_programada"):
        faltas.append("data de revisão")
    if _cortes_sem_justificativa(c, aloc, escolhas):
        faltas.append("justificativa de cada corte")
    if not escolhas.get("indicadores_sugeridos"):
        faltas.append("indicadores de acompanhamento")
    return faltas


def _dentro_dos_limites(c: Cenario, aloc: dict[str, int], escolhas: dict) -> bool:
    if sum(aloc.values()) > c.disponivel:
        return False
    return not c.horas_equipe or horas_usadas(c, aloc, escolhas) <= c.horas_equipe


def _expectativas(escolhas: dict, variacao: dict[str, float]) -> list[dict[str, Any]]:
    ids = escolhas.get("expectativa_ids") or []
    out = []
    for e in expectativas():
        if e["id"] not in ids:
            continue
        v = float(variacao.get(e["indicador"], 0.0))
        ok = v > 0.5 if e["direcao"] == "sobe" else (v < -0.5 if e["direcao"] == "desce" else v >= -1.5)
        out.append({"id": e["id"], "texto": e["texto"], "confirmada": ok})
    return out


def _fonte(a: dict[str, Any], nomes_atores: dict[str, str]) -> str:
    det = a.get("detalhe", "")
    r = a.get("regra")
    if r == "alocacao":
        return det.split(":")[0]
    if r == "adiamento":
        return det.split(" adiada")[0].split(" parcial")[0]
    if r == "saldo":
        return "Saldo guardado"
    if r == "decisao":
        chave = det.replace("Decisão com ", "").replace(" ", "_")
        return CHAVES_DECISAO.get(chave, det)
    if r == "hipotese":
        return det
    if r == "postura":
        nome = det.split(" (")[0]
        return f"Reação de {nome}"
    if r == "flag":
        return det.split(":")[0].replace("_", " ").capitalize()
    return "Reações na simulação dos agentes"


def pesos(c: Cenario, auditoria: list[dict[str, Any]]) -> dict[str, list[dict[str, str]]]:
    """Agrupa a auditoria por fator e devolve, sem números, o que mais e o que menos pesou."""
    nomes_ind = {k: v["nome"] for k, v in config.indicadores()["indicadores"].items()}
    nomes_atores = {a.id: a.nome for a in c.atores}
    grupos: dict[str, dict[str, float]] = {}
    for a in auditoria:
        if a.get("regra") in ("consolidacao", None) or not a.get("pontos"):
            continue
        g = grupos.setdefault(_fonte(a, nomes_atores), {})
        g[a["indicador"]] = g.get(a["indicador"], 0.0) + float(a["pontos"])
    itens = []
    for fator, por_ind in grupos.items():
        total = sum(abs(v) for v in por_ind.values())
        if total < 0.05:
            continue
        ajudou = [nomes_ind.get(i, i).lower() for i, v in sorted(por_ind.items(), key=lambda x: -x[1]) if v > 0]
        pesou = [nomes_ind.get(i, i).lower() for i, v in sorted(por_ind.items(), key=lambda x: x[1]) if v < 0]
        partes = ([f"ajudou {', '.join(ajudou[:2])}"] if ajudou else []) + ([f"pesou contra {', '.join(pesou[:2])}"] if pesou else [])
        itens.append({"fator": fator, "efeito": "; ".join(partes), "sentido": "positivo" if sum(por_ind.values()) >= 0 else "negativo",
                      "_peso": total})
    itens.sort(key=lambda x: -x["_peso"])
    limpa = lambda xs: [{k: v for k, v in x.items() if k != "_peso"} for x in xs]  # noqa: E731
    return {"mais": limpa(itens[:3]), "menos": limpa(list(reversed(itens[3:]))[:2] if len(itens) > 3 else [])}


def feedback_relato(c: Cenario, escolhas: dict) -> list[str]:
    if not c.relato:
        return []
    op = {o.id: o for o in c.relato.opcoes}
    escolhida = op.get(escolhas.get("interpretacao") or "")
    out = []
    if escolhida is None:
        out.append(f"Você não registrou uma interpretação do relato de {c.relato.autor} ({c.relato.funcao}).")
    elif escolhida.adequada:
        out.append(f"Boa leitura do relato de {c.relato.autor} ({c.relato.funcao}): \"{escolhida.texto}\" é o que a experiência sugere.")
    else:
        adequada = next((o.texto for o in c.relato.opcoes if o.adequada), "")
        out.append(f"\"{escolhida.texto}\" não é o que o relato mostra: a baixa participação veio do horário. "
                   f"Leitura mais adequada: \"{adequada}\".")
    if escolhas.get("consultou_associados"):
        out.append(f"Você consultou os associados ({c.relato.consulta_horas} h da equipe) e descobriu: {c.relato.consulta_achado}")
    else:
        out.append("Você pulou a consulta aos associados. Com poucas horas da equipe, ela teria mostrado a preferência "
                   "por formação online à noite e liberado uma alternativa mais barata.")
    return out


def avaliar(c: Cenario, resultado: dict[str, Any], escolhas: dict, aloc: dict[str, int]) -> dict[str, Any]:
    r = regras()
    rc = r["carimbo"]
    ind = resultado.get("indicadores") or {}
    variacao = ind.get("variacao") or {}
    meta = resultado.get("meta") or {}
    pct = int(meta.get("pct") or 0) if meta else 0
    soma = round(sum(float(v) for v in variacao.values()), 1)
    limites = _dentro_dos_limites(c, aloc, escolhas)
    faltas = _faltas_justificativa(c, aloc, escolhas)

    p_meta = next((x["pontos"] for x in rc["meta"] if meta and pct >= x["min_pct"]), 0)
    p_ind = next((x["pontos"] for x in rc["indicadores"] if soma >= x["min_soma"]), 0)
    p_ata = rc["ata_completa"] if not faltas else 0
    total = p_meta + p_ind + p_ata
    if not limites:
        carimbo, motivo = "FRACASSO", "A decisão passou do teto do orçamento ou das horas da equipe."
    else:
        carimbo = "SUCESSO" if total >= rc["faixas"]["sucesso"] and p_meta >= 1 else "SUCESSO PARCIAL" if total >= rc["faixas"]["parcial"] else "FRACASSO"
        if carimbo == "SUCESSO":
            partes = [f"meta {meta.get('situacao', '')} ({pct}% previsto)" if meta else "",
                      "indicadores em alta" if p_ind == 2 else "indicadores estáveis",
                      "Ata completa" if p_ata else ""]
            motivo = ", ".join(x for x in partes if x).capitalize() + "."
        elif p_meta < 2 and meta:
            motivo = f"A meta ficou {meta.get('situacao', 'longe')} ({pct}% previsto)."
        elif not meta:
            motivo = "Sem meta mensurável, não há como dizer se a decisão funcionou."
        elif p_ind < 2:
            motivo = "A decisão cumpre a meta, mas os indicadores da associação caíram ou ficaram parados."
        else:
            motivo = f"A Ata ficou incompleta: falta {faltas[0]}."
    exps = _expectativas(escolhas, variacao)

    def conceito_frac(f: float, tem: bool) -> str:
        return "D" if not tem else "A" if f >= 1 else "B" if f >= 0.5 else "C" if f > 0 else "D"

    criterios = [
        {"id": "expectativa", "nome": "Expectativa × simulação",
         "conceito": conceito_frac(sum(e["confirmada"] for e in exps) / len(exps) if exps else 0, bool(exps)),
         "explicacao": (f"{sum(e['confirmada'] for e in exps)} de {len(exps)} expectativas confirmadas pela simulação."
                        if exps else "Nenhuma expectativa registrada.")},
        {"id": "meta", "nome": "Meta × resultado",
         "conceito": next((x["conceito"] for x in r["desempenho"]["meta_resultado"] if meta and pct >= x["min_pct"]), "D"),
         "explicacao": f"{pct}% da meta previsto." if meta else "Sem meta mensurável."},
        {"id": "limites", "nome": "Dentro dos limites", "conceito": "A" if limites else "D",
         "explicacao": "Teto do orçamento e horas da equipe respeitados." if limites else "Passou do teto ou das horas."},
        {"id": "justificativa", "nome": "Justificativa completa",
         "conceito": ["A", "B", "C"][len(faltas)] if len(faltas) < 3 else "D",
         "explicacao": "Todos os elementos da Ata presentes." if not faltas else f"Faltou: {', '.join(faltas)}."},
    ]
    if c.relato:
        adequada = any(o.adequada and o.id == escolhas.get("interpretacao") for o in c.relato.opcoes)
        consultou = bool(escolhas.get("consultou_associados"))
        criterios.append({"id": "relato", "nome": "Interpretação do relato",
                          "conceito": "A" if adequada and consultou else "B" if adequada else "C" if consultou else "D",
                          "explicacao": ("Leitura adequada" if adequada else "Leitura pouco adequada") +
                                        (" e consulta aos associados." if consultou else "; sem consulta aos associados.")})
    media = sum(NOTA[x["conceito"]] for x in criterios) / len(criterios)
    geral = LETRA[max(1, min(4, int(media + 0.5)))]
    from .cenarios import hipoteses_usadas
    return {
        "carimbo": carimbo, "motivo": motivo,
        "regra": {"pontos_meta": p_meta, "pontos_indicadores": p_ind, "pontos_ata": p_ata, "total": total,
                  "limites": limites, "soma_variacoes": soma, "pct_meta": pct if meta else None},
        "pesos": pesos(c, ind.get("auditoria") or []),
        "desempenho": {"criterios": criterios, "geral": geral},
        "expectativas": exps,
        "feedback_relato": feedback_relato(c, escolhas),
        "hipoteses": hipoteses_usadas(c, escolhas),
        "faltas": faltas,
    }
