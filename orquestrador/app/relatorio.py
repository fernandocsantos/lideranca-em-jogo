"""Plano de decisão — Legado: resumo em tópicos + a mesma estrutura de 8 seções por missão + desempenho consolidado.

A estrutura é fixa para padronizar os critérios de decisão entre diretorias, respeitando cada contexto. Sem dados
pessoais: o apelido só entra se o jogador pedir. O frontend gera PDF, CSV e texto a partir deste JSON (offline).
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from . import avaliacao, cenarios, config, db, fatos, funcoes, perfis, selos, vivencias
from .alocacao import horas_linha, horas_usadas

AVISO = "Simulação para apoio à decisão; não é garantia de resultado."
SELO = "Demonstração com dados fictícios"
SLOGAN = "Seu mandato passa. O que você ensina continua cuidando de quem empreende."
DESCRICAO = ("Treinamento gamificado para novas lideranças decidirem sobre prioridades, orçamento e resultados, "
             "aprendendo com dirigentes seniores.")
SECOES = ["Contexto e restrições", "Prioridades", "Orçamento e horas", "Alternativas comparadas",
          "Relatos considerados", "Resultados", "Aprendizados para a próxima decisão", "Simulação"]
NOTA = {"A": 4, "B": 3, "C": 2, "D": 1}


def _pct(a: float, b: float) -> float | None:
    return round((b - a) / a * 100, 1) if a else None


def _brl(v: int) -> str:
    return f"R$ {int(v):,}".replace(",", ".")


def _letra(media: float) -> str:
    return "ABCD"[4 - max(1, min(4, int(media + 0.5)))]


def missao(campanha: dict, t: dict, consolidada: bool) -> dict[str, Any]:
    c = cenarios.obter(t["cenario_id"], campanha.get("perfil"))
    gente = funcoes.pessoas(c)
    e = t.get("escolhas") or {}
    res = t.get("resultado") or {}
    dev = t.get("devolutiva") or {}
    aloc = {k: int(v) for k, v in (t.get("alocacao") or {}).items()}
    base = e.get("ano_anterior") or {d.id: (d.ano_anterior or 0) for d in c.demandas}
    av = res.get("avaliacao") or (avaliacao.avaliar(c, res, e, aloc) if aloc else {})
    nomes = {a.id: a for a in c.atores}
    just = e.get("cortes_linhas") or {}

    linhas = []
    for d in c.demandas:
        ant, prop = int(base.get(d.id, 0) or 0), int(aloc.get(d.id, 0))
        if not ant and not prop:
            continue  # alternativa não usada
        j = just.get(d.id) or {}
        motivo = "; ".join([*(j.get("motivos") or []), *([j["texto"].strip()] if (j.get("texto") or "").strip() else [])])
        linhas.append({"linha": d.titulo, "ano_anterior": ant, "planejado": prop, "executado": prop, "variacao": prop - ant,
                       "variacao_pct": _pct(ant, prop), "horas": horas_linha(d, prop), "justificativa": motivo if prop < ant else ""})
    total = sum(x["planejado"] for x in linhas)
    escolhidas = [f"{d.titulo} ({_brl(aloc[d.id])})" for d in sorted(c.demandas, key=lambda x: -aloc.get(x.id, 0)) if aloc.get(d.id, 0) > 0]
    adiadas = [x["linha"] for x in linhas if x["planejado"] == 0]
    criado = datetime.fromisoformat(t["criado_em"])
    revisao = (criado + timedelta(days=int(e["revisao_dias"]))).date().isoformat() if e.get("revisao_dias") else None
    fato = fatos.para_trimestre(int(t["indice"]))
    titulos = {d.id: d.titulo for d in c.demandas}
    relato = None
    if c.relato:
        op = {o.id: o.texto for o in c.relato.opcoes}
        relato = {"autor": c.relato.autor, "funcao": c.relato.funcao, "texto": c.relato.texto,
                  "interpretacao": op.get(e.get("interpretacao") or "", "não registrada"),
                  "consulta": c.relato.consulta_achado if e.get("consultou_associados") else "não feita"}
    outros = [f"{r['perfil']}: \"{r['trecho']}\"" for r in vivencias.relatos(c)] if e.get("considerou_vivencias") else []
    aprendizados = (dev.get("aprendizados") or dev.get("perguntas_reflexivas") or [])[:3]
    if not aprendizados:
        aprendizados = list(av.get("feedback_relato") or [])[:2] or ["Revisar a meta na data marcada e comparar com os indicadores sugeridos."]
    ind = res.get("indicadores") or {}
    nomes_ind = {k: v["nome"] for k, v in config.indicadores()["indicadores"].items()}
    out = {
        "missao": int(t["indice"]) + 1, "tentativa_id": t["id"], "consolidada": consolidada, "data": t["criado_em"][:10],
        "titulo": c.titulo, "carimbo": av.get("carimbo"), "motivo": av.get("motivo"), "desempenho": av.get("desempenho"),
        "secoes": {
            "contexto": {"associacao": f"{c.associacao.nome} — {c.associacao.cidade}", "perfil": perfis.obter(campanha.get("perfil"))["nome"],
                         "orcamento_antes": c.orcamento, "orcamento_depois": c.disponivel, "horas_equipe": c.horas_equipe,
                         "horas_usadas": horas_usadas(c, aloc, e) if aloc else 0,
                         "fato_novo": f"{fato['titulo']}. {fato['texto']}" if fato else (f"{c.evento.titulo}. {c.evento.texto}" if c.evento else ""),
                         "restricoes": [r.texto for r in c.regras]},
            "prioridades": {"escolhidas": escolhidas, "adiadas": adiadas, "criterios": e.get("motivos") or []},
            "orcamento": {"linhas": linhas, "total": total, "teto": c.disponivel, "saldo": c.disponivel - total},
            "alternativas": {"comparadas": [{"rotulo": a.get("rotulo"), "total": a.get("total"), "horas": a.get("horas"),
                                             "atendidos": a.get("atendidos") or []} for a in (e.get("alternativas") or [])],
                             "escolhida": e.get("alternativa_escolhida"), "motivo": e.get("motivo_alternativa") or []},
            "relatos": {"relato": relato, "outros": outros},
            "resultados": {"meta": e.get("meta") or "", "responsavel": e.get("responsavel") or "", "revisao": revisao,
                           "indicadores_sugeridos": [{"prioridade": titulos.get(k, k), "indicador": v}
                                                     for k, v in (e.get("indicadores_sugeridos") or {}).items() if v],
                           "previsao_meta": res.get("meta"), "expectativa": e.get("expectativa") or []},
            "aprendizados": aprendizados,
            "simulacao": {"hipoteses": av.get("hipoteses") or cenarios.hipoteses_usadas(c, e),
                          "riscos": res.get("riscos") or [], "sinais_alerta": res.get("sinais_alerta") or [],
                          "reacoes": [{"nome": (f"{nomes[r['ator_id']].nome} ({nomes[r['ator_id']].funcao_curta})" if r.get("ator_id") in nomes else r["nome"]),
                                       "postura": r["postura_final"], "reacao": r.get("reacao", "")} for r in res.get("reacoes", [])],
                          "revisao_humana": "validada pelo facilitador" if t.get("revisao_humana") == "validada" else "pendente",
                          "modo": "agentes de IA (MiroFish)" if t.get("modo") == "mirofish" else "modo offline (cache ou regras)",
                          "fase": res.get("fase"), "aviso": AVISO},
        },
        "indicadores": [{"indicador": nomes_ind.get(k, k), "antes": ind.get("antes", {}).get(k), "depois": v,
                         "variacao": ind.get("variacao", {}).get(k)} for k, v in (ind.get("depois") or {}).items()],
        "ata_texto": t["decisao"],
    }
    return funcoes.aplicar(out, gente)


def _resumo(m: dict) -> dict[str, Any]:
    s = m["secoes"]
    cortes = [f"{x['linha']} −{_brl(-x['variacao'])}" for x in s["orcamento"]["linhas"] if x["variacao"] < 0]
    corte_total = -sum(x["variacao"] for x in s["orcamento"]["linhas"] if x["variacao"] < 0)
    aumentos = [f"{x['linha']} +{_brl(x['variacao'])}" for x in s["orcamento"]["linhas"] if x["variacao"] > 0]
    acrescimo = sum(x["variacao"] for x in s["orcamento"]["linhas"] if x["variacao"] > 0)
    return {"missao": m["missao"], "titulo": m["titulo"],
            "priorizou": ", ".join(x.split(" (R$")[0] for x in s["prioridades"]["escolhidas"][:3]) or "nenhuma demanda",
            "alocou_cortou": f"Alocou {_brl(s['orcamento']['total'])} de {_brl(s['orcamento']['teto'])}" +
                             (f"; cortou {_brl(corte_total)} ({'; '.join(cortes)})" if cortes else "; sem cortes") +
                             (f"; acrescentou {_brl(acrescimo)} ({'; '.join(aumentos)})" if aumentos else ""),
            "alternativa": (f"Alternativa {s['alternativas']['escolhida']} (de {len(s['alternativas']['comparadas'])})"
                            if s["alternativas"]["escolhida"] else "Sem comparação de alternativas"),
            "meta": s["resultados"]["meta"] or "Sem meta mensurável", "carimbo": m["carimbo"] or "—"}


def desempenho_consolidado(missoes: list[dict]) -> dict[str, Any]:
    por: dict[str, dict[str, Any]] = {}
    for m in missoes:
        for x in (m.get("desempenho") or {}).get("criterios", []):
            p = por.setdefault(x["id"], {"id": x["id"], "nome": x["nome"], "conceitos": {}})
            p["conceitos"][str(m["missao"])] = x["conceito"]
    out = []
    for p in por.values():
        vals = [NOTA[v] for v in p["conceitos"].values()]
        p["media"] = _letra(sum(vals) / len(vals))
        out.append(p)
    gerais = [NOTA[m["desempenho"]["geral"]] for m in missoes if m.get("desempenho")]
    return {"criterios": out, "geral": _letra(sum(gerais) / len(gerais)) if gerais else None}


def montar(campanha: dict, incluir_apelido: str | None = None) -> dict[str, Any]:
    tentativas = db.varios("SELECT * FROM tentativas WHERE campanha_id=? AND resultado IS NOT NULL ORDER BY criado_em", (campanha["id"],))
    consolidadas = {h["tentativa_id"] for h in campanha["historico"]}
    por_indice: dict[int, list[dict]] = {}
    for t in tentativas:
        por_indice.setdefault(int(t["indice"]), []).append(t)
    missoes = []
    for i in sorted(por_indice):
        escolhida = next((t for t in por_indice[i] if t["id"] in consolidadas), por_indice[i][-1])
        missoes.append(missao(campanha, escolhida, escolhida["id"] in consolidadas))
    refeitas = []
    for i, ts in sorted(por_indice.items()):
        if len(ts) > 1:
            mudancas = []
            for a, b in zip(ts, ts[1:]):
                da, dbb = a.get("alocacao") or {}, b.get("alocacao") or {}
                dif = [f"{k}: {_brl(da.get(k, 0))} → {_brl(dbb.get(k, 0))}" for k in sorted(set(da) | set(dbb)) if da.get(k, 0) != dbb.get(k, 0)]
                mudancas.append("; ".join(dif) or "mesma divisão, Ata diferente")
            refeitas.append({"missao": i + 1, "tentativas": len(ts), "mudancas": mudancas})
    sel = selos.atualizar(campanha)
    evolucao = [{"missao": 0, **dict(config.jogo()["campanha"]["indicadores_iniciais"])}]
    for h in campanha["historico"]:
        evolucao.append({"missao": h["indice"] + 1, **h["depois"]})
    return {"titulo": "Plano de decisão — Legado", "gerado_em": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "apelido": incluir_apelido, "perfil": perfis.obter(campanha.get("perfil"))["nome"],
            "associacao": missoes[0]["secoes"]["contexto"]["associacao"] if missoes else "", "status": campanha["status"],
            "selo": SELO, "slogan": SLOGAN, "descricao": DESCRICAO, "secoes": SECOES,
            "resumo": [_resumo(m) for m in missoes], "missoes": missoes,
            "desempenho": desempenho_consolidado(missoes),
            "certificacoes": [x for x in sel["selos"] if x["ganho"]],
            "evolucao": evolucao, "nomes_indicadores": {k: v["nome"] for k, v in config.indicadores()["indicadores"].items()},
            "refeitas": refeitas, "aviso": AVISO}
