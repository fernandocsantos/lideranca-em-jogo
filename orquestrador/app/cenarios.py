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


def obter(cenario_id: str, perfil_id: str | None = None) -> Cenario:
    from . import perfis
    for sub in ("curados", "gerados"):
        p = _dir(sub) / f"{cenario_id}.json"
        if p.exists():
            return perfis.aplicar(_ler(p), perfil_id)
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
                    "postura_inicial": a.postura_inicial, "idade": a.idade, "genero": a.genero} for a in c.atores],
        "narrativa": c.narrativa, "tags": c.tags[:3], "orcamento": c.orcamento, "periodo": c.periodo,
        "disponivel": c.disponivel, "trimestre": c.trimestre, "continua_de": c.continua_de,
        "evento": c.evento.model_dump() if c.evento else None,
        "demandas": [d.model_dump(include={"id", "titulo", "custo", "solicitante", "beneficio", "minimo_util"})
                     for d in c.demandas],
        "regras": [r.model_dump() for r in c.regras],
    }


def _brl(v: int) -> str:
    return f"R$ {v:,}".replace(",", ".")


def bloco_alocacao(c: Cenario, alocacao: dict[str, int]) -> list[str]:
    nomes = {a.id: a.nome for a in c.atores}
    linhas = [f"## Orçamento do {c.periodo} e alocação decidida",
              f"Orçamento: {_brl(c.orcamento)}" + (f"; {c.evento.titulo} ({_brl(c.evento.delta_orcamento)})"
                                                     if c.evento else "") + f"; disponível: {_brl(c.disponivel)}.",
              "",
              "| Demanda | Quem pediu | Custo | Valor aprovado | Situação |",
              "|---|---|---|---|---|"]
    for d in c.demandas:
        v = int(alocacao.get(d.id, 0))
        sit = "financiada" if v >= d.custo else ("adiada" if v == 0 else f"parcial ({v * 100 // d.custo}%)")
        linhas.append(f"| {d.titulo} | {nomes.get(d.solicitante, d.solicitante)} | {_brl(d.custo)} | {_brl(v)} | {sit} |")
    saldo = c.disponivel - sum(int(alocacao.get(d.id, 0)) for d in c.demandas)
    linhas += ["", f"Saldo guardado: {_brl(saldo)}.", ""]
    return linhas


def material_semente(c: Cenario, decisao: str | None = None, alocacao: dict[str, int] | None = None,
                     experiencias: list[str] | None = None) -> str:
    """Documento .md enviado ao MiroFish.

    Sem decisão: material-base do cenário (o grafo dele fica em cache). Com decisão: material de cada
    tentativa, com a alocação estruturada, o resumo da decisão e as experiências da rede.
    """
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
    ]
    if c.demandas:
        nomes = {x.id: x.nome for x in c.atores}
        linhas += [f"## Pedidos que disputam o orçamento ({_brl(c.disponivel)} disponíveis)"]
        linhas += [f"- {d.titulo} ({_brl(d.custo)}), pedido por {nomes.get(d.solicitante, d.solicitante)}: {d.beneficio}"
                   for d in c.demandas]
        linhas.append("")
    linhas += ["## Regras que a decisão e a simulação devem respeitar",
               *[f"- {r}" for r in (c.restricoes or [g.texto for g in c.regras])], "",
               "## O que está em jogo", c.em_jogo, "",
               "## Pessoas e organizações envolvidas"]
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
        if alocacao is not None and c.demandas:
            linhas += bloco_alocacao(c, alocacao)
        linhas += ["## Resumo da decisão anunciada pela presidência da associação", decisao, ""]
        if experiencias:
            linhas += ["## Experiências de dirigentes da rede (contexto, não ordens)",
                       *[f"- {e}" for e in experiencias], ""]
    return "\n".join(linhas)


def requisito_simulacao(c: Cenario, decisao: str, alocacao: dict[str, int] | None = None) -> str:
    resumo_aloc = ""
    if alocacao is not None and c.demandas:
        partes = [f"{d.titulo}: {_brl(int(alocacao.get(d.id, 0)))} de {_brl(d.custo)}" for d in c.demandas]
        resumo_aloc = f" Alocação do orçamento ({_brl(c.disponivel)} disponíveis): " + "; ".join(partes) + "."
    return (
        f"Simule, em português do Brasil, como as pessoas e organizações do cenário '{c.titulo}' "
        f"reagem à decisão anunciada pela presidência da {c.associacao.nome}: \"{decisao}\".{resumo_aloc} "
        "Quem teve o pedido adiado ou cortado tende a cobrar explicações; quem foi atendido cobra resultados. "
        "Mostre apoios, críticas, negociações, boatos e mudanças de posição ao longo do tempo. "
        "Não crie personagens além dos listados. IDIOMA OBRIGATÓRIO: escreva perfis, personas, publicações, "
        "comentários e o relatório em português do Brasil (nunca em chinês ou inglês)."
    )
