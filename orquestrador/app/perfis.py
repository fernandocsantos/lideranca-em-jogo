"""Perfis de AC (replicação): associação, pessoas, equipe e escala do orçamento em config/perfis/*.yaml."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from . import config, settings
from .modelos import Associacao, Ator, Cenario


@lru_cache(maxsize=None)
def _todos() -> dict[str, dict[str, Any]]:
    d = Path(settings.CONFIG_DIR) / "perfis"
    out = {}
    for p in sorted(d.glob("*.yaml")):
        dados = yaml.safe_load(p.read_text(encoding="utf-8"))
        out[dados["id"]] = dados
    return out


def listar() -> list[dict[str, Any]]:
    return [{"id": p["id"], "nome": p["nome"], "descricao": p.get("descricao", ""),
             "orcamento_trimestral": p["orcamento_trimestral"], "equipe": p.get("equipe", ""),
             "associados": p["associacao"]["associados"]} for p in _todos().values()]


def padrao() -> str:
    """Perfil dos novos mandatos: o escolhido pelo facilitador (banco) ou o de jogo.yaml."""
    try:
        from . import db
        r = db.um("SELECT valor FROM configuracao WHERE chave='perfil_padrao'")
        if r and r["valor"] in _todos():
            return r["valor"]
    except Exception:  # noqa: BLE001
        pass
    return config.jogo()["campanha"].get("perfil_padrao", "media")


def definir_padrao(perfil_id: str) -> None:
    from . import db
    if perfil_id not in _todos():
        raise KeyError(perfil_id)
    db.executar("INSERT OR REPLACE INTO configuracao (chave, valor) VALUES ('perfil_padrao', ?)", (perfil_id,))


def obter(perfil_id: str | None) -> dict[str, Any]:
    todos = _todos()
    return todos.get(perfil_id or padrao()) or todos[padrao()]


def _arredondar(v: float, passo: int = 500) -> int:
    return int(round(v / passo) * passo)


def aplicar(c: Cenario, perfil_id: str | None) -> Cenario:
    """Troca associação e pessoas pelas do perfil e escala custos e orçamento.

    Os valores do cenário são de referência (perfil médio, R$ 30 mil). Num perfil com R$ 9 mil,
    tudo é multiplicado por 0,3 e arredondado a R$ 500.
    """
    if not c.usa_perfil:
        return c
    p = obter(perfil_id)
    fator = p["orcamento_trimestral"] / c.orcamento if c.orcamento else 1.0
    novo = c.model_copy(deep=True)
    novo.associacao = Associacao(**p["associacao"])
    novo.atores = [Ator(**a) for a in p["atores"]]
    novo.orcamento = p["orcamento_trimestral"]
    for d in novo.demandas:
        d.custo = max(500, _arredondar(d.custo * fator))
        if d.ano_anterior is not None:
            d.ano_anterior = min(d.custo, _arredondar(d.ano_anterior * fator))
    if novo.evento and novo.evento.delta_orcamento:
        novo.evento.delta_orcamento = _arredondar(novo.evento.delta_orcamento * fator)
    # O texto completo cita os valores de referência; acrescenta a versão do perfil para o MiroFish.
    valores = "; ".join(f"{d.titulo}: R$ {d.custo:,}".replace(",", ".") for d in novo.demandas)
    novo.texto = (f"{c.texto}\n\nValores para esta associação ({p['nome']}; {p.get('equipe', '')}): "
                  f"orçamento de R$ {novo.orcamento:,}".replace(",", ".") +
                  (f", variação de R$ {novo.evento.delta_orcamento:,}".replace(",", ".") if novo.evento else "") +
                  f". Pedidos: {valores}.")
    # horas da equipe: escala própria do perfil (equipe maior ou menor), não a do orçamento
    hf = float(p.get("horas_fator", 1.0))
    if hf != 1.0:
        novo.horas_equipe = int(round(c.horas_equipe * hf))
        for d in novo.demandas:
            d.horas = max(1, int(round(d.horas * hf)))
    nome_ref = c.associacao.nome
    # valores citados nos textos: troca os de referência pelos do perfil (mil e milhar)
    pares = [(c.orcamento, novo.orcamento), (c.disponivel, novo.disponivel)]
    if c.evento and novo.evento:
        pares.append((abs(c.evento.delta_orcamento), abs(novo.evento.delta_orcamento)))
    for d0, d1 in zip(c.demandas, novo.demandas):
        pares += [(d0.custo, d1.custo)] + ([(d0.ano_anterior, d1.ano_anterior)] if d0.ano_anterior else [])
    trocas: dict[str, str] = {}
    for ref, val in sorted(set(pares), key=lambda x: -x[0]):
        if not ref or ref == val:
            continue
        trocas[f"R$ {ref // 1000} mil"] = f"R$ {val / 1000:g} mil".replace(".", ",")
        trocas[f"R$ {ref:,}".replace(",", ".")] = f"R$ {val:,}".replace(",", ".")
    if hf != 1.0 and c.horas_equipe:
        trocas[f"{c.horas_equipe} horas"] = f"{novo.horas_equipe} horas"

    def trocar(t: str) -> str:
        if not t:
            return t
        # passa por marcadores para não trocar duas vezes (ex.: 30 → 9 → 2,5)
        marc = {}
        for i, (a, b) in enumerate(trocas.items()):
            if a in t:
                t = t.replace(a, f"\x00{i}\x00")
                marc[f"\x00{i}\x00"] = b
        for k, v in marc.items():
            t = t.replace(k, v)
        return t
    novo.narrativa = trocar(c.narrativa)
    novo.titulo = trocar(c.titulo)
    if novo.evento and c.evento:
        novo.evento.titulo = trocar(c.evento.titulo)
    novo.regras = [r.model_copy(update={"texto": trocar(r.texto)}) for r in novo.regras]
    novo.texto = novo.texto.replace(nome_ref, novo.associacao.nome)
    return novo
