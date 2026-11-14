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
class AtorGerado(Estrito):
    """Formato pedido ao LLM na ficcionalização (sem campos de avatar)."""
    id: str
    nome: str
    tipo: TipoAtor
    papel: str
    persona: str
    interesses: list[str]
    influencia: int  # 1..5
    postura_inicial: int  # -2 (hostil) .. +2 (aliado)


class Ator(AtorGerado):
    # Aparência do avatar ilustrado (nunca foto). Se ausente, é derivada do id de forma estável.
    idade: Optional[int] = None
    genero: Optional[Literal["f", "m"]] = None


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


class Demanda(Estrito):
    """Pedido que disputa o orçamento do período."""
    id: str
    titulo: str
    custo: int                      # R$
    solicitante: str                # ator_id de quem pede
    beneficio: str                  # 1 linha
    efeitos: dict[str, float]       # pontos por indicador se financiada por inteiro
    efeitos_adiar: dict[str, float] = {}  # pontos por indicador se não financiada
    minimo_util: float = 0.5        # abaixo desta fração o benefício cai pela metade
    meta_sugerida: str = ""         # unidade da meta, ex.: "lojas vendendo pela internet"
    ano_anterior: Optional[int] = None  # valor executado no período anterior (ponto de partida da Mesa)


class Regra(Estrito):
    """Restrição que a decisão e a simulação devem respeitar (ícone + 1 linha)."""
    icone: str
    texto: str


class Evento(Estrito):
    """Fato novo do período (ex.: receita prevista cai R$ 6 mil)."""
    titulo: str
    texto: str
    delta_orcamento: int = 0
    fonte: Optional[Referencia] = None


class Cenario(BaseModel):
    id: str
    titulo: str
    tema: str
    dificuldade: int = Field(ge=1, le=3)
    associacao: Associacao
    texto: str                      # contexto completo (vai ao MiroFish e à devolutiva)
    restricoes: list[str]
    em_jogo: str
    atores: list[Ator]
    inspirado_em: Optional[Referencia] = None
    status: Literal["curado", "pendente_revisao", "aprovado", "rejeitado"] = "curado"
    # --- mecânica de orçamento (versão CACB) ---
    narrativa: str = ""             # até 80 palavras, o que o jogador lê na pauta
    tags: list[str] = []            # "o que está em jogo" em até 3 tags
    orcamento: int = 0              # R$ disponíveis no período (antes do evento)
    periodo: str = "trimestre"
    demandas: list[Demanda] = []
    regras: list[Regra] = []
    evento: Optional[Evento] = None
    usa_perfil: bool = False        # associação, atores e escala do orçamento vêm do perfil da AC
    trimestre: int = 1
    continua_de: Optional[str] = None  # cenário anterior encadeado (manter/ajustar/rever)

    @property
    def disponivel(self) -> int:
        return max(0, self.orcamento + (self.evento.delta_orcamento if self.evento else 0))


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


class Momento(Estrito):
    ator_id: str
    fala: str  # até 2 frases, em 1ª pessoa


class ExtracaoSinais(Estrito):
    resumo_narrativo: str
    momentos: list[Momento]
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


class FatoGerado(Estrito):
    """Fato novo do trimestre, ficcionalizado a partir de uma notícia (saída do LLM)."""
    relevante: bool
    titulo: str                 # até 8 palavras
    texto: str                  # até 2 frases
    recorte: str                # recorte temático usado (ex.: "inadimplência no varejo")
    tema: str
    efeito_orcamento: int       # R$ para uma AC média (30 mil/trimestre); 0 se não mexe no caixa
    nomes_reais_removidos: list[str]


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
    atores: list[AtorGerado]
    nomes_reais_removidos: list[str]
