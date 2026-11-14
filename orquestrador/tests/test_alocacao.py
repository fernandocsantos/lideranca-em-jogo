import pytest

from app import alocacao, cenarios, config, perfis
from app.alocacao import AlocacaoInvalida

INI = config.jogo()["campanha"]["indicadores_iniciais"]


def _c(perfil="media"):
    return cenarios.obter("guia_t1_orcamento", perfil)


def test_caso_do_guia():
    c = _c()
    assert c.orcamento == 30000 and c.disponivel == 24000
    assert {d.id: d.custo for d in c.demandas} == {"digitalizacao": 18000, "formacao_vendas": 14000, "atendimento": 8000}


def test_soma_nunca_passa_do_disponivel():
    c = _c()
    with pytest.raises(AlocacaoInvalida):
        alocacao.normalizar(c, {"digitalizacao": 18000, "formacao_vendas": 14000})
    with pytest.raises(AlocacaoInvalida):
        alocacao.normalizar(c, {"inexistente": 100})
    with pytest.raises(AlocacaoInvalida):
        alocacao.normalizar(c, {"atendimento": 9000})  # acima do custo
    assert alocacao.normalizar(c, {"atendimento": 8000}) == {"atendimento": 8000, "digitalizacao": 0, "formacao_vendas": 0}


def test_previa_deterministica_e_expressoes():
    c = _c()
    a = {"digitalizacao": 0, "formacao_vendas": 14000, "atendimento": 8000}
    p1, p2 = alocacao.previa(c, a, INI), alocacao.previa(c, a, INI)
    assert p1 == p2
    exp = {d["id"]: d["expressao"] for d in p1["demandas"]}
    assert exp["formacao_vendas"] == "favoravel" and exp["atendimento"] == "favoravel"
    assert exp["digitalizacao"] == "desconfiada"  # Rafael (influência 3) adiado: postura 1 -> -1
    assert p1["saldo"] == 2000
    assert p1["tendencia"]["saude_financeira"] == "sobe"


def test_adiar_quem_tem_muita_influencia_gera_insatisfacao():
    c = _c()
    p = alocacao.previa(c, {"digitalizacao": 18000, "atendimento": 6000}, INI)
    exp = {d["id"]: d["expressao"] for d in p["demandas"]}
    assert exp["formacao_vendas"] == "insatisfeita"  # Dona Cida tem influência 4


def test_meio_termo_abaixo_do_minimo_rende_menos():
    c = _c()
    d = next(x for x in c.demandas if x.id == "digitalizacao")
    regras = config.indicadores()["alocacao"]
    assert alocacao.utilidade(d, 9000, regras) == 0.5
    assert alocacao.utilidade(d, 4500, regras) == pytest.approx(0.125)


def test_perfis_escalam_orcamento_e_custos():
    p = _c("pequena")
    g = _c("grande")
    assert p.orcamento == 9000 and g.orcamento == 120000
    assert sum(d.custo for d in p.demandas) > p.disponivel
    assert p.associacao.nome != g.associacao.nome
    assert "R$ 9 mil" in p.narrativa
    assert {x["id"] for x in perfis.listar()} == {"pequena", "media", "grande"}


def test_material_semente_tem_alocacao_estruturada():
    c = _c()
    m = cenarios.material_semente(c, "Priorizamos o atendimento.", {"atendimento": 8000})
    assert "| Atendimento ao associado | Patrícia Lemos | R$ 8.000 | R$ 8.000 | financiada |" in m
    assert "adiada" in m and "Regras que a decisão e a simulação devem respeitar" in m


def test_decisao_guiada_soma_pontos_de_comunicacao_e_meta():
    c = _c()
    a = {"atendimento": 8000}
    sem = alocacao.calcular(c, a, {})["pontos"]
    com = alocacao.calcular(c, a, {"comunicacao": 1, "meta_mensuravel": 1, "revisao_programada": 1})["pontos"]
    assert com["engajamento"] - sem["engajamento"] == 1.5
    assert com["conformidade"] - sem["conformidade"] == 2.0
