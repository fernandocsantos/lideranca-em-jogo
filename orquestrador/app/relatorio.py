"""Relatório de gestão: Ata Padronizada de Decisão (7 seções fixas) por trimestre + consolidado do mandato.

Sem dados pessoais: o apelido só entra se o jogador pedir. O frontend gera PDF e CSV a partir deste JSON
(funciona offline com a última versão em cache).
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from . import cenarios, config, db, fatos, perfis, selos

AVISO = "Simulação para apoio à decisão; não é garantia de resultado."


def _pct(a: float, b: float) -> float | None:
    return round((b - a) / a * 100, 1) if a else None


def ata(campanha: dict, t: dict, consolidada: bool) -> dict[str, Any]:
    c = cenarios.obter(t["cenario_id"], campanha.get("perfil"))
    e = t.get("escolhas") or {}
    res = t.get("resultado") or {}
    dev = t.get("devolutiva") or {}
    aloc = t.get("alocacao") or {}
    base = e.get("ano_anterior") or {d.id: (d.ano_anterior or 0) for d in c.demandas}
    nomes = {a.id: a for a in c.atores}
    nomes_ind = {k: v["nome"] for k, v in config.indicadores()["indicadores"].items()}
    fato = fatos.para_trimestre(int(t["indice"]))
    linhas = []
    for d in c.demandas:
        ant, prop = int(base.get(d.id, 0)), int(aloc.get(d.id, 0))
        linhas.append({"linha": d.titulo, "solicitante": nomes[d.solicitante].nome if d.solicitante in nomes else d.solicitante,
                       "ano_anterior": ant, "proposto": prop, "variacao": prop - ant, "variacao_pct": _pct(ant, prop), "pedido": d.custo})
    total = sum(x["proposto"] for x in linhas)
    escolhida = max(linhas, key=lambda x: x["proposto"])["linha"] if linhas and total else "nenhuma"
    adiadas = [x["linha"] for x in linhas if x["proposto"] == 0]
    criado = datetime.fromisoformat(t["criado_em"])
    revisao = (criado + timedelta(days=int(e["revisao_dias"]))).date().isoformat() if e.get("revisao_dias") else None
    ind = (res.get("indicadores") or {})
    return {
        "trimestre": int(t["indice"]) + 1, "tentativa_id": t["id"], "consolidada": consolidada, "data": t["criado_em"][:10],
        "titulo": c.titulo, "modo": t.get("modo"), "fase": res.get("fase"),
        "contexto": {"associacao": f"{c.associacao.nome} — {c.associacao.cidade}", "perfil": perfis.obter(campanha.get("perfil"))["nome"],
                     "associados": c.associacao.associados, "fato_novo": (f"{fato['titulo']}. {fato['texto']}" if fato else
                                                                           (f"{c.evento.titulo}. {c.evento.texto}" if c.evento else "")),
                     "restricoes": [r.texto for r in c.regras] + [f"Teto do período: R$ {c.disponivel:,}".replace(",", ".")]},
        "prioridades": {"opcoes": [d.titulo for d in c.demandas], "escolhida": escolhida, "adiadas": adiadas,
                        "criterios": e.get("motivos") or [], "trade_offs": (dev.get("trade_offs") or [])[:3] or
                        ([f"Adiar {', '.join(adiadas)} para caber no teto"] if adiadas else []),
                        "envolvidos": [nomes[i].nome for i in e.get("envolvidos", []) if i in nomes]},
        "orcamento": {"linhas": linhas, "total": total, "teto": c.disponivel, "saldo": c.disponivel - total,
                      "justificativa_cortes": e.get("cortes_justificativa") or []},
        "resultados": {"meta": e.get("meta") or "", "responsavel": e.get("responsavel") or "", "revisao": revisao,
                       "indicador": e.get("indicador_acompanhamento") or "", "previsao_meta": res.get("meta")},
        "previsao": {"reacoes": [{"nome": r["nome"], "tipo": r["tipo"], "postura": r["postura_final"], "reacao": r.get("reacao", "")}
                                 for r in res.get("reacoes", [])],
                     "riscos": res.get("riscos") or [], "sinais_alerta": res.get("sinais_alerta") or [],
                     "o_que_mudaria": res.get("o_que_mudaria") or [], "aviso": AVISO},
        "indicadores": [{"indicador": nomes_ind.get(k, k), "antes": ind.get("antes", {}).get(k), "depois": v,
                         "variacao": ind.get("variacao", {}).get(k)} for k, v in (ind.get("depois") or {}).items()],
        "competencias": {"aprendizados": (dev.get("aprendizados") or dev.get("perguntas_reflexivas") or [])[:3]},
        "ata_texto": t["decisao"],
    }


def padroes(atas: list[dict]) -> list[str]:
    if not atas:
        return []
    out = []
    conta: dict[str, int] = {}
    for a in atas:
        for l in a["orcamento"]["linhas"]:
            nome = l["linha"].split(":")[0].lower()
            conta[nome] = conta.get(nome, 0) + l["proposto"]
    if conta:
        out.append(f"Prioriza {max(conta, key=conta.get)} (maior parte da verba no mandato).")
    if sum(1 for a in atas if any(x in " ".join(a["prioridades"]["envolvidos"]).lower() for x in ("diretor", "conselho", "presidente", "osvaldo", "marina"))) >= max(1, len(atas) // 2 + len(atas) % 2):
        out.append("Envolve a diretoria e o conselho antes de decidir.")
    if all(a["orcamento"]["justificativa_cortes"] for a in atas if any(l["variacao"] < 0 for l in a["orcamento"]["linhas"])):
        out.append("Justifica os cortes que faz.")
    if all(a["resultados"]["meta"] for a in atas):
        out.append("Define metas mensuráveis em todos os trimestres.")
    if any(a["orcamento"]["saldo"] > 0 for a in atas):
        out.append("Guarda parte do orçamento como reserva.")
    criterios = {}
    for a in atas:
        for c in a["prioridades"]["criterios"]:
            criterios[c] = criterios.get(c, 0) + 1
    if criterios:
        out.append(f"Critério mais usado: {max(criterios, key=criterios.get).lower()}.")
    return out


def montar(campanha: dict, incluir_apelido: str | None = None) -> dict[str, Any]:
    tentativas = db.varios("SELECT * FROM tentativas WHERE campanha_id=? AND resultado IS NOT NULL ORDER BY criado_em", (campanha["id"],))
    consolidadas = {h["tentativa_id"] for h in campanha["historico"]}
    por_indice: dict[int, list[dict]] = {}
    for t in tentativas:
        por_indice.setdefault(int(t["indice"]), []).append(t)
    atas = []
    for i in sorted(por_indice):
        escolhida = next((t for t in por_indice[i] if t["id"] in consolidadas), por_indice[i][-1])
        atas.append(ata(campanha, escolhida, escolhida["id"] in consolidadas))
    refeitas = []
    for i, ts in sorted(por_indice.items()):
        if len(ts) > 1:
            mudancas = []
            for a, b in zip(ts, ts[1:]):
                da, dbb = a.get("alocacao") or {}, b.get("alocacao") or {}
                dif = [f"{k}: R$ {da.get(k, 0):,} → R$ {dbb.get(k, 0):,}".replace(",", ".") for k in sorted(set(da) | set(dbb)) if da.get(k, 0) != dbb.get(k, 0)]
                mudancas.append("; ".join(dif) or "mesma divisão, Ata diferente")
            refeitas.append({"trimestre": i + 1, "tentativas": len(ts), "mudancas": mudancas})
    sel = selos.atualizar(campanha)
    evolucao = [{"trimestre": 0, **{k: v for k, v in config.jogo()["campanha"]["indicadores_iniciais"].items()}}]
    for h in campanha["historico"]:
        evolucao.append({"trimestre": h["indice"] + 1, **h["depois"]})
    return {"titulo": "Relatório de gestão do mandato", "gerado_em": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "apelido": incluir_apelido, "perfil": perfis.obter(campanha.get("perfil"))["nome"],
            "associacao": atas[0]["contexto"]["associacao"] if atas else "", "status": campanha["status"],
            "atas": atas, "certificacoes": [x for x in sel["selos"] if x["ganho"]],
            "consolidado": {"quadro": [{"trimestre": a["trimestre"], "prioridade": a["prioridades"]["escolhida"], "total": a["orcamento"]["total"],
                                        "teto": a["orcamento"]["teto"], "meta": a["resultados"]["meta"], "riscos": len(a["previsao"]["riscos"])} for a in atas],
                            "evolucao": evolucao, "nomes_indicadores": {k: v["nome"] for k, v in config.indicadores()["indicadores"].items()},
                            "padroes": padroes(atas), "refeitas": refeitas},
            "aviso": AVISO, "frase": "Treinamento gamificado que simula cenários de lideranças de associações comerciais usando uma coleção de agentes de IA para compor uma ferramenta preditiva que reduz os riscos de atuações reais."}
