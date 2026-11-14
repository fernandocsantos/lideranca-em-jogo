"""Toda pessoa citada aparece com a função: "Otávio Rezende (presidente da associação)".

Pós-processamento dos textos gerados por LLM ou pelo MiroFish: na primeira menção de cada pessoa em cada
texto, acrescenta "(função)" se ainda não houver. Os agentes também são instruídos a fazer o mesmo
(material-semente e prompts); este passo garante o resultado mesmo quando o modelo esquece.
"""
from __future__ import annotations

import re
from typing import Any, Iterable

from .modelos import Cenario

TITULOS = {"dona", "seu", "sr.", "sra.", "dr.", "dra.", "secretário", "secretária", "conselheiro", "conselheira",
           "vereador", "vereadora", "prefeito", "prefeita", "presidente", "padre", "professor", "professora"}
VANESSA = ("Vanessa", "lojista, diretora em 1º mandato")


def pessoas(c: Cenario | None, extras: Iterable[tuple[str, str]] = ()) -> list[tuple[str, str]]:
    """(nome completo, função) de cada pessoa do cenário, mais Vanessa e a autora do relato."""
    out: list[tuple[str, str]] = []
    if c:
        out += [(a.nome, a.funcao_curta) for a in c.atores if a.tipo != "imprensa"]
        if c.relato:
            out.append((c.relato.autor, c.relato.funcao))
    out.append(VANESSA)
    out += list(extras)
    return out


def apelidos(lista: list[tuple[str, str]]) -> list[tuple[list[str], str, str]]:
    """Para cada pessoa: formas de citá-la (nome completo, sem título, primeiro nome se único), nome e função."""
    primeiros: dict[str, int] = {}
    sem_titulo = {}
    for nome, _ in lista:
        partes = nome.split()
        while partes and partes[0].lower() in TITULOS:
            partes = partes[1:]
        sem_titulo[nome] = partes
        if partes:
            primeiros[partes[0]] = primeiros.get(partes[0], 0) + 1
    out = []
    for nome, funcao in lista:
        partes = sem_titulo[nome]
        formas = [nome]
        if partes and " ".join(partes) != nome:
            formas.append(" ".join(partes))
        if partes and len(partes) > 1 and primeiros.get(partes[0]) == 1:
            formas.append(partes[0])
        out.append((sorted(set(formas), key=len, reverse=True), nome, funcao))
    return out


def com_funcao(texto: str, lista: list[tuple[str, str]]) -> str:
    if not texto or not isinstance(texto, str):
        return texto
    for formas, _nome, funcao in apelidos(lista):
        if not funcao:
            continue
        padrao = re.compile(r"(?<![\wÀ-ÿ])(" + "|".join(re.escape(f) for f in formas) + r")(?![\wÀ-ÿ])")
        m = padrao.search(texto)
        if not m:
            continue
        depois = texto[m.end():m.end() + 3]
        if depois.lstrip().startswith("("):
            continue  # já tem função (ou algum parêntese explicativo)
        texto = texto[:m.end()] + f" ({funcao})" + texto[m.end():]
    return texto


def aplicar(dados: Any, lista: list[tuple[str, str]], ignorar: set[str] | None = None) -> Any:
    """Aplica com_funcao em todas as strings de uma estrutura (dict/list), exceto chaves técnicas."""
    ignorar = ignorar or {"id", "ator_id", "tipo", "nome", "indicador", "probabilidade", "impacto", "papel", "fonte",
                          "autor", "rodada", "acoes", "relatorio", "categoria"}
    if isinstance(dados, str):
        return com_funcao(dados, lista)
    if isinstance(dados, list):
        return [aplicar(x, lista, ignorar) for x in dados]
    if isinstance(dados, dict):
        return {k: (v if k in ignorar else aplicar(v, lista, ignorar)) for k, v in dados.items()}
    return dados


def sem_funcao(texto: str, lista: list[tuple[str, str]]) -> list[str]:
    """Nomes cuja PRIMEIRA menção no texto não vem seguida da função (usado nos testes)."""
    faltam = []
    for formas, nome, funcao in apelidos(lista):
        padrao = re.compile(r"(?<![\wÀ-ÿ])(" + "|".join(re.escape(f) for f in formas) + r")(?![\wÀ-ÿ])")
        m = padrao.search(texto or "")
        if m and not texto[m.end():m.end() + 3].lstrip().startswith("("):
            faltam.append(nome)
    return faltam


INSTRUCAO = ("Sempre que citar uma pessoa, escreva a função dela entre parênteses na primeira menção, "
             "como \"Otávio Rezende (presidente da associação)\".")
