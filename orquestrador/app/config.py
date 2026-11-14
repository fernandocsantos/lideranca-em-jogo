"""Carrega os arquivos de configuração editáveis (YAML)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from . import settings


@lru_cache(maxsize=None)
def carregar(nome: str) -> dict[str, Any]:
    caminho = Path(settings.CONFIG_DIR) / f"{nome}.yaml"
    with open(caminho, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def jogo() -> dict[str, Any]:
    return carregar("jogo")


def indicadores() -> dict[str, Any]:
    return carregar("indicadores")


def rubrica() -> dict[str, Any]:
    return carregar("rubrica")


def llm() -> dict[str, Any]:
    return carregar("llm")


def fontes() -> dict[str, Any]:
    return carregar("fontes")


def moderacao() -> dict[str, Any]:
    return carregar("moderacao")


def nomes_bloqueados() -> list[str]:
    caminho = Path(settings.CONFIG_DIR) / "nomes_reais_bloqueados.txt"
    if not caminho.exists():
        return []
    linhas = caminho.read_text(encoding="utf-8").splitlines()
    return [l.strip() for l in linhas if l.strip() and not l.startswith("#")]


INDICADORES = ["engajamento", "saude_financeira", "reputacao", "capital_politico", "coesao", "conformidade"]
