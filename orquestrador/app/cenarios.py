"""Biblioteca de cenários (curados + gerados aprovados) e material-semente para o MiroFish."""
from __future__ import annotations

import json
from pathlib import Path

from . import settings
from .modelos import Cenario

POSTURAS = {-2: "hostil", -1: "desconfiada", 0: "neutra", 1: "favorável", 2: "aliada"}


def _dir(sub: str) -> Path:
    return Path(settings.CENARIOS_DIR) / sub


def _ler(p: Path) -> Cenario:
    return Cenario.model_validate(json.loads(p.read_text(encoding="utf-8")))


def todos(incluir_pendentes: bool = False) -> list[Cenario]:
    out: list[Cenario] = []
    for sub in ("curados", "gerados"):
        d = _dir(sub)
        if not d.exists():
            continue
        for p in sorted(d.glob("*.json")):
            c = _ler(p)
            if c.status in ("curado", "aprovado") or (incluir_pendentes and c.status == "pendente_revisao"):
                out.append(c)
    return out


def obter(cenario_id: str) -> Cenario:
    for sub in ("curados", "gerados"):
        p = _dir(sub) / f"{cenario_id}.json"
        if p.exists():
            return _ler(p)
    raise KeyError(cenario_id)


def salvar_gerado(c: Cenario) -> Path:
    d = _dir("gerados")
    d.mkdir(parents=True, exist_ok=True)
    p = d / f"{c.id}.json"
    p.write_text(json.dumps(c.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8")
    return p


def definir_status(cenario_id: str, status: str) -> Cenario:
    p = _dir("gerados") / f"{cenario_id}.json"
    if not p.exists():
        raise KeyError(cenario_id)
    c = _ler(p)
    c.status = status  # type: ignore[assignment]
    salvar_gerado(c)
    return c


def publico(c: Cenario) -> dict:
    """O que o jogador vê (sem detalhes internos de persona)."""
    return {
        "id": c.id, "titulo": c.titulo, "tema": c.tema, "dificuldade": c.dificuldade,
        "associacao": c.associacao.model_dump(), "texto": c.texto, "restricoes": c.restricoes,
        "em_jogo": c.em_jogo, "inspirado_em": c.inspirado_em.model_dump() if c.inspirado_em else None,
        "atores": [{"id": a.id, "nome": a.nome, "tipo": a.tipo, "papel": a.papel, "influencia": a.influencia,
                    "postura_inicial": a.postura_inicial} for a in c.atores],
    }


def material_semente(c: Cenario, decisao: str | None = None) -> str:
    """Documento .md enviado ao MiroFish para construir o grafo e as personas."""
    a = c.associacao
    linhas = [
        f"# {c.titulo}",
        "",
        "Este é um cenário FICTÍCIO de treinamento. Todas as pessoas, empresas e cidades são inventadas.",
        "Idioma: português do Brasil. Perfis, publicações, comentários e relatórios devem ser escritos em português do Brasil.",
        "",
        "## A associação",
        f"{a.nome}, na cidade de {a.cidade}. Porte: {a.porte}. Associados: {a.associados}. "
        f"Situação financeira: {a.situacao_financeira}.",
        "",
        "## Situação",
        c.texto,
        "",
        "## Restrições",
        *[f"- {r}" for r in c.restricoes],
        "",
        "## O que está em jogo",
        c.em_jogo,
        "",
        "## Pessoas e organizações envolvidas",
    ]
    for at in c.atores:
        linhas += [
            f"### {at.nome}",
            f"- Papel: {at.papel}",
            f"- Tipo: {at.tipo}",
            f"- Perfil: {at.persona}",
            f"- Interesses: {'; '.join(at.interesses)}",
            f"- Influência na cidade (1 a 5): {at.influencia}",
            f"- Postura inicial em relação à diretoria da associação: {POSTURAS.get(at.postura_inicial, 'neutra')}",
            "",
        ]
    if decisao:
        linhas += ["## Decisão anunciada pela presidência da associação", decisao, ""]
    return "\n".join(linhas)


def requisito_simulacao(c: Cenario, decisao: str) -> str:
    return (
        f"Simule, em português do Brasil, como as pessoas e organizações do cenário '{c.titulo}' "
        f"reagem à decisão anunciada pela presidência da {c.associacao.nome}: \"{decisao}\". "
        "Mostre apoios, críticas, negociações, boatos e mudanças de posição ao longo do tempo. "
        "Não crie personagens além dos listados. IDIOMA OBRIGATÓRIO: escreva perfis, personas, publicações, "
        "comentários e o relatório em português do Brasil (nunca em chinês ou inglês)."
    )
