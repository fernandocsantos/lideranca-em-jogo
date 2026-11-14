"""Campanha: seleção de cenários (dificuldade crescente, variedade temática) e acúmulo de indicadores."""
from __future__ import annotations

import random

from . import cenarios, config, db
from .modelos import Cenario


def selecionar(n: int, semente: int | None = None, disponiveis: list[Cenario] | None = None) -> list[str]:
    """Escolhe n cenários: ordena por dificuldade e evita repetir tema enquanto houver opção."""
    rnd = random.Random(semente)
    pool = list(disponiveis if disponiveis is not None else cenarios.todos())
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


def criar(sessao_id: str, semente: int | None = None) -> dict:
    cfg = config.jogo()["campanha"]
    n = max(5, min(8, int(cfg["numero_cenarios"])))
    ids = selecionar(n, semente)
    camp = {
        "id": db.novo_id("camp"), "sessao_id": sessao_id, "cenarios": ids, "indice_atual": 0,
        "indicadores": dict(cfg["indicadores_iniciais"]), "historico": [], "status": "em_andamento",
        "criado_em": db.agora(),
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
    }]
    novo_indice = campanha["indice_atual"] + 1
    status = "concluida" if novo_indice >= len(campanha["cenarios"]) else "em_andamento"
    dados = {"historico": historico, "indice_atual": novo_indice, "indicadores": tentativa["indicadores_depois"],
             "status": status}
    db.atualizar("campanhas", campanha["id"], dados)
    return {**campanha, **dados}
