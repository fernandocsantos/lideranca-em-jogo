"""Modelos de dados: cenários e saídas estruturadas dos LLMs."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

TipoAtor = Literal["associado", "diretoria", "conselho", "funcionarios", "poder_publico", "imprensa", "sindicato",
                   "consumidores", "entidade_concorrente", "federacao", "parceiro"]
Indicador = Literal["engajamento", "saude_financeira", "reputacao", "capital_politico", "coesao", "conformidade"]
Flag = Literal["violacao_estatuto", "risco_lgpd", "conflito_de_interesse", "gasto_sem_previsao",
               "consulta_aos_associados", "transparencia_ativa", "parceria_formalizada", "crise_mal_comunicada"]
Competencia = Literal["visao_estrategica", "escuta_representatividade", "negociacao_articulacao", "comunicacao",
                      "gestao_recursos", "etica_governanca", "gestao_crise"]


class Estrito(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ----------------------------------------------------------------- cenários
class Ator(Estrito):
    id: str
    nome: str
    tipo: TipoAtor
    papel: str
    persona: str
    interesses: list[str]
    influencia: int  # 1..5
    postura_inicial: int  # -2 (hostil) .. +2 (aliado)


class Associacao(Estrito):
    nome: str
    cidade: str
    porte: str
    associados: int
    situacao_financeira: str


class Referencia(Estrito):
    titulo: str
    veiculo: str
    data: str
    url: str


class Cenario(BaseModel):
    id: str
    titulo: str
    tema: str
    dificuldade: int = Field(ge=1, le=3)
    associacao: Associacao
    texto: str
    restricoes: list[str]
    em_jogo: str
    atores: list[Ator]
    inspirado_em: Optional[Referencia] = None
    status: Literal["curado", "pendente_revisao", "aprovado", "rejeitado"] = "curado"


# ----------------------------------------------------------- saídas de LLM
class ResultadoModeracao(Estrito):
    permitido: bool
    categoria: Literal["ok", "ofensivo", "manipulacao", "fora_de_contexto", "dados_pessoais"]
    motivo: str


class AvaliacaoClareza(Estrito):
    simulavel: bool
    perguntas: list[str]  # até 2


class Sinal(Estrito):
    indicador: Indicador
    intensidade: int  # -3..+3
    evidencia: str
    ator_id: Optional[str]


class ReacaoAtor(Estrito):
    ator_id: str
    postura_final: int  # -2..+2
    reacao: str  # 1-3 frases em 1ª pessoa
    citacao: str


class ExtracaoSinais(Estrito):
    resumo_narrativo: str
    sinais: list[Sinal]
    reacoes: list[ReacaoAtor]
    flags: list[Flag]


class AvaliacaoCompetencia(Estrito):
    competencia: Competencia
    nivel: int  # 1..4
    evidencia: str


class Devolutiva(Estrito):
    competencias: list[AvaliacaoCompetencia]
    pontos_fortes: list[str]
    riscos_ignorados: list[str]
    atores_nao_considerados: list[str]
    trade_offs: list[str]
    perguntas_reflexivas: list[str]


class AcaoSimulada(Estrito):
    rodada: int
    ator_id: str
    acao: str  # ex.: "publica no grupo", "convoca reunião"
    conteudo: str


class SimulacaoContingencia(Estrito):
    acoes: list[AcaoSimulada]
    relatorio: str


class CenarioFiccional(Estrito):
    relevante: bool
    motivo_relevancia: str
    titulo: str
    tema: str
    dificuldade: int
    associacao: Associacao
    texto: str
    restricoes: list[str]
    em_jogo: str
    atores: list[Ator]
    nomes_reais_removidos: list[str]
