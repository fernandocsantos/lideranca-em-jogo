"""Mascaramento de dados pessoais (LGPD), feito localmente antes de salvar e antes de qualquer envio ao LLM
ou ao MiroFish.

1ª passada: expressões regulares (CPF, CNPJ, telefone, e-mail, CEP, placa, URL, datas exatas, valores).
2ª passada: reconhecimento de entidades em português (spaCy pt_core_news_sm: pessoas, organizações, locais),
mais lista de cidades e heurística de nomes próprios e de razões sociais.
Valores monetários viram faixas; locais viram "uma cidade do interior". Nada do original é registrado em log.
"""
from __future__ import annotations

import logging
import re
import unicodedata
from functools import lru_cache
from typing import Any

from . import config

log = logging.getLogger(__name__)

PADROES: list[tuple[str, re.Pattern, str]] = [
    ("email", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"), "[e-mail]"),
    ("url", re.compile(r"\bhttps?://\S+|\bwww\.\S+", re.I), "[link]"),
    ("cnpj", re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b"), "[CNPJ]"),
    ("cpf", re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b"), "[CPF]"),
    ("telefone", re.compile(r"(?:\+?55\s?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b"), "[telefone]"),
    ("cep", re.compile(r"\b\d{5}-?\d{3}\b"), "[CEP]"),
    ("placa", re.compile(r"\b[A-Z]{3}-?\d[A-Z0-9]\d{2}\b"), "[placa]"),
    ("data", re.compile(r"\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{1,2} de (?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?: de \d{4})?\b", re.I), "[data]"),
    ("endereco", re.compile(r"\b(?:[Rr]ua|[Aa]venida|[Aa]v\.|[Tt]ravessa|[Aa]lameda|[Pp]raça|[Rr]odovia|[Ee]strada)\s+(?:d[aeo]s?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9][\w.]*(?:\s+(?:d[aeo]s?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9][\w.]*)*(?:,?\s*(?:n[ºo°]\.?\s*)?\d{1,5})?"), "[endereço]"),
]
VALOR = re.compile(r"R\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?(\s?(?:mil|milhão|milhões))?", re.I)
SUFIXOS_EMPRESA = re.compile(r"\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\w&'.-]*(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ&][\w&'.-]*)*\s+(?:Ltda\.?|S/?A|S\.A\.|ME|EPP|Eireli|LTDA)\b")
PREFIXOS_EMPRESA = re.compile(r"\b(?:Supermercado|Mercado|Padaria|Loja|Lojas|Farmácia|Drogaria|Construtora|Restaurante|Auto Peças|Autopeças|Grupo|Rede|Banco|Cooperativa|Imobiliária|Posto|Academia|Clínica|Escola|Colégio|Indústria|Indústrias|Metalúrgica|Distribuidora|Transportadora)\s+(?:d[aeo]s?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\w'-]*(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\w'-]*)*")
NOME_PROPRIO = re.compile(r"\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+)+\b")
COMUNS = {"Associação Comercial", "Câmara Municipal", "Prefeitura Municipal", "Conselho Fiscal", "Black Friday", "Dia das Mães",
          "Banco Central", "Receita Federal", "Simples Nacional", "Sala de", "Interior de", "São Paulo"}


def _norm(t: str) -> str:
    t = unicodedata.normalize("NFKD", t.lower())
    return "".join(c for c in t if not unicodedata.combining(c))


@lru_cache(maxsize=1)
def _nlp():
    try:
        import spacy
        nlp = spacy.load("pt_core_news_sm", disable=["parser", "lemmatizer", "morphologizer", "attribute_ruler"])
        nlp.add_pipe("sentencizer")
        return nlp
    except Exception as e:  # noqa: BLE001
        log.warning("Reconhecimento de entidades indisponível (%s); usando só regras.", type(e).__name__)
        return None


def _cidades() -> list[str]:
    return config.nomes_bloqueados()


def faixa_valor(v: float) -> str:
    for lim, txt in [(1000, "menos de R$ 1 mil"), (10000, "entre R$ 1 mil e R$ 10 mil"), (50000, "entre R$ 10 mil e R$ 50 mil"),
                     (200000, "entre R$ 50 mil e R$ 200 mil"), (1000000, "entre R$ 200 mil e R$ 1 milhão")]:
        if v < lim:
            return txt
    return "mais de R$ 1 milhão"


def _valor_numerico(m: re.Match) -> float:
    n = float(m.group(1).replace(".", ""))
    mult = (m.group(2) or "").strip().lower()
    return n * (1_000_000 if mult.startswith("milh") else 1000 if mult == "mil" else 1)


def mascarar(texto: str, regiao: str = "uma cidade do interior", permitidos: list[str] | None = None,
             generalizar_valores: bool = True) -> dict[str, Any]:
    """Retorna {"texto": mascarado, "substituicoes": {tipo: quantidade}}. Não guarda o original.

    `permitidos`: nomes FICTÍCIOS do jogo (personagens, associação, cidade) que não devem ser mascarados.
    """
    protegidos: dict[str, str] = {}
    t0 = texto or ""
    for i, nome in enumerate(sorted({n for n in (permitidos or []) if n and len(n) >= 3}, key=len, reverse=True)):
        marca = f"⟦{i}⟧"
        if nome in t0:
            t0 = t0.replace(nome, marca)
            protegidos[marca] = nome
    r = _mascarar(t0, regiao, generalizar_valores)
    for marca, nome in protegidos.items():
        r["texto"] = r["texto"].replace(marca, nome)
    return r


def _mascarar(texto: str, regiao: str, generalizar_valores: bool = True) -> dict[str, Any]:
    contagem: dict[str, int] = {}
    pessoas: dict[str, str] = {}
    empresas: dict[str, str] = {}

    def conta(tipo: str) -> None:
        contagem[tipo] = contagem.get(tipo, 0) + 1

    t = texto or ""
    for tipo, rx, marc in PADROES:
        t, n = rx.subn(marc, t)
        if n:
            contagem[tipo] = contagem.get(tipo, 0) + n
    if generalizar_valores:
        t = VALOR.sub(lambda m: (conta("valor"), faixa_valor(_valor_numerico(m)))[1], t)

    def subst_empresa(nome: str) -> str:
        chave = _norm(nome)
        if chave not in empresas:
            empresas[chave] = f"[Empresa {len(empresas) + 1}]"
        conta("empresa")
        return empresas[chave]

    def subst_pessoa(nome: str) -> str:
        chave = _norm(nome)
        if chave not in pessoas:
            pessoas[chave] = f"[Pessoa {len(pessoas) + 1}]"
        conta("pessoa")
        return pessoas[chave]

    t = SUFIXOS_EMPRESA.sub(lambda m: subst_empresa(m.group(0)), t)
    t = PREFIXOS_EMPRESA.sub(lambda m: subst_empresa(m.group(0)), t)
    for cid in sorted(_cidades(), key=len, reverse=True):
        rx = re.compile(rf"\b{re.escape(cid)}\b", re.I)
        t, n = rx.subn(regiao, t)
        if n:
            contagem["local"] = contagem.get("local", 0) + n

    nlp = _nlp()
    if nlp is not None:
        doc = nlp(t)
        trocas = []
        for e in doc.ents:
            txt = e.text.strip()
            if txt.startswith("[") or txt.startswith("⟦") or txt in COMUNS or len(txt) < 3:
                continue
            if t[e.end_char:e.end_char + 1] == ":":
                continue  # rótulo ("Prioridade:", "Meta:"), não entidade
            anterior = doc[e.start - 1].lower_ if e.start > 0 else ""
            if e.label_ == "LOC" and len(e) == 1 and anterior not in {"em", "de", "para", "até", "no", "na", "do", "da", "pela", "pelo"}:
                continue  # palavra solta com inicial maiúscula (ex.: início de item); local exige preposição
            if e.label_ in ("ORG", "PER") and len(e) == 1 and e.start == e.sent.start:
                continue  # palavra única no início da frase: alto risco de falso positivo
            if e.label_ == "PER":
                trocas.append((e.start_char, e.end_char, subst_pessoa(txt)))
            elif e.label_ == "ORG" and not re.match(r"(?i)^(associação|prefeitura|câmara|conselho|diretoria|sebrae|procon)\b", txt):
                trocas.append((e.start_char, e.end_char, subst_empresa(txt)))
            elif e.label_ == "LOC" and not re.match(r"(?i)^(centro|bairro|interior|brasil|são paulo)$", txt):
                trocas.append((e.start_char, e.end_char, regiao))
                conta("local")
        for ini, fim, novo in sorted(trocas, reverse=True):
            t = t[:ini] + novo + t[fim:]

    # Reforço: nomes próprios compostos que sobraram (exceto início de frase de uma palavra só e termos comuns).
    def nome_restante(m: re.Match) -> str:
        txt = m.group(0)
        if txt in COMUNS or any(txt.startswith(c) for c in COMUNS):
            return txt
        return subst_pessoa(txt)
    t = NOME_PROPRIO.sub(nome_restante, t)
    return {"texto": t, "substituicoes": contagem}


def detectar(texto: str) -> list[str]:
    """Tipos de dado pessoal encontrados (para o bloqueio antes do envio). Só padrões objetivos:
    os textos do jogo têm personagens fictícios, que não podem ser confundidos com pessoas reais."""
    achados = set()
    for tipo, rx, _ in PADROES:
        if tipo in ("data", "url", "endereco"):
            continue  # datas e links aparecem legitimamente em cenários (fonte de notícia)
        if rx.search(texto or ""):
            achados.add(tipo)
    alvo = _norm(texto or "")
    for cid in _cidades():
        if len(cid) >= 4 and re.search(rf"\b{re.escape(_norm(cid))}\b", alvo):
            achados.add("cidade_real")
    return sorted(achados)


class EnvioBloqueado(RuntimeError):
    """Payload com padrão de dado pessoal: o envio foi bloqueado (o motivo não contém o dado)."""


def guarda(texto: str, destino: str) -> None:
    tipos = detectar(texto)
    if tipos:
        log.warning("Envio ao %s bloqueado: padrões de dado pessoal detectados (%s).", destino, ", ".join(tipos))
        registrar_bloqueio(destino, tipos)
        raise EnvioBloqueado(f"Envio bloqueado: padrões de dado pessoal ({', '.join(tipos)}).")


def registrar_bloqueio(destino: str, tipos: list[str]) -> None:
    try:
        from . import db
        db.executar("INSERT INTO bloqueios_envio (destino, tipos, criado_em) VALUES (?,?,?)", (destino, ",".join(tipos), db.agora()))
    except Exception:  # noqa: BLE001
        pass
