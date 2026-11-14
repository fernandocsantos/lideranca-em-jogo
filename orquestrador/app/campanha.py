"""Campanha: seleção de cenários (dificuldade crescente, variedade temática) e acúmulo de indicadores."""
from __future__ import annotations

import random

from . import cenarios, config, db
from .modelos import Cenario


def selecionar(n: int, semente: int | None = None, disponiveis: list[Cenario] | None = None) -> list[str]:
    """Escolhe n cenários: ordena por dificuldade e evita repetir tema enquanto houver opção."""
    rnd = random.Random(semente)
    pool = list(disponiveis if disponiveis is not None else cenarios.todos())
    if n <= 0 or not pool:
        return []
    rnd.shuffle(pool)
    if len(pool) < n:
        n = len(pool)
    # Quotas por dificuldade: primeiro terço fácil, meio médio, final difícil.
    alvo = [1 + (3 * i) // n for i in range(n)]  # 1..3 crescente
    escolhidos: list[Cenario] = []
    temas: set[str] = set()
    for dif in alvo:
        candidatos = [c for c in pool if c not in escolhidos]
        candidatos.sort(key=lambda c: (abs(c.dificuldade - dif), c.tema in temas))
        escolha = candidatos[0]
        escolhidos.append(escolha)
        temas.add(escolha.tema)
    escolhidos.sort(key=lambda c: c.dificuldade)  # garante não-decrescente
    return [c.id for c in escolhidos]


def criar(sessao_id: str, semente: int | None = None, perfil: str | None = None,
          modo: str | None = None) -> dict:
    """Modo "demonstracao": os trimestres encadeados do caso do guia. Modo "completa": eles e mais
    casos da biblioteca, com dificuldade crescente (total entre 5 e 8)."""
    from . import perfis
    cfg = config.jogo()["campanha"]
    modo = modo or cfg.get("modo", "demonstracao")
    inicio = list(cfg.get("trimestres_iniciais", ["guia_t1_orcamento", "guia_t2_orcamento"]))
    if modo == "completa":
        n = max(5, min(8, int(cfg["numero_cenarios"])))
        resto = [c for c in cenarios.todos() if c.id not in inicio and not c.usa_perfil]
        ids = inicio + selecionar(max(0, n - len(inicio)), semente, resto)
    else:
        ids = inicio
    camp = {
        "id": db.novo_id("camp"), "sessao_id": sessao_id, "cenarios": ids, "indice_atual": 0,
        "indicadores": dict(cfg["indicadores_iniciais"]), "historico": [], "status": "em_andamento",
        "criado_em": db.agora(), "perfil": perfis.obter(perfil)["id"], "selos": [],
    }
    db.inserir("campanhas", camp)
    return camp


def obter(campanha_id: str) -> dict | None:
    return db.um("SELECT * FROM campanhas WHERE id=?", (campanha_id,))


def avancar(campanha: dict, tentativa: dict) -> dict:
    """Consolida a tentativa escolhida e passa ao próximo cenário."""
    historico = campanha["historico"] + [{
        "indice": campanha["indice_atual"], "cenario_id": tentativa["cenario_id"], "tentativa_id": tentativa["id"],
        "antes": tentativa["indicadores_antes"], "depois": tentativa["indicadores_depois"],
        "alocacao": tentativa.get("alocacao"), "escolhas": tentativa.get("escolhas"),
        "fracoes": {d["id"]: d["fracao"] for d in (tentativa.get("resultado") or {}).get("demandas", [])},
        "resumo": tentativa.get("decisao"),
    }]
    novo_indice = campanha["indice_atual"] + 1
    status = "concluida" if novo_indice >= len(campanha["cenarios"]) else "em_andamento"
    dados = {"historico": historico, "indice_atual": novo_indice, "indicadores": tentativa["indicadores_depois"],
             "status": status}
    db.atualizar("campanhas", campanha["id"], dados)
    return {**campanha, **dados}
