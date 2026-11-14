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
    nome_ref = c.associacao.nome
    novo.narrativa = c.narrativa.replace("R$ 30 mil", f"R$ {novo.orcamento // 1000} mil")
    if novo.evento and c.evento:
        ref = abs(c.evento.delta_orcamento) // 1000
        novo.narrativa = novo.narrativa.replace(f"R$ {ref} mil", f"R$ {abs(novo.evento.delta_orcamento) / 1000:g} mil".replace(".", ","))
        novo.evento.titulo = c.evento.titulo.replace(f"R$ {ref} mil", f"R$ {abs(novo.evento.delta_orcamento) / 1000:g} mil".replace(".", ","))
    novo.texto = novo.texto.replace(nome_ref, novo.associacao.nome)
    return novo
