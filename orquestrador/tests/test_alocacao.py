import pytest

from app import alocacao, cenarios, config, perfis
from app.alocacao import AlocacaoInvalida

INI = config.jogo()["campanha"]["indicadores_iniciais"]


def _c(perfil="media"):
    return cenarios.obter("guia_t1_orcamento", perfil)


def test_caso_do_guia():
    c = _c()
    assert c.orcamento == 30000 and c.disponivel == 24000
    assert {d.id: d.custo for d in c.demandas} == {"digitalizacao": 18000, "formacao_vendas": 14000,
                                                   "formacao_online": 8000, "atendimento": 8000}
    assert {d.id: d.ano_anterior for d in c.demandas if d.ano_anterior} == {"digitalizacao": 18000, "formacao_vendas": 14000,
                                                                          "atendimento": 8000}
    assert c.horas_equipe == 100 and {d.id: d.horas for d in c.demandas}["digitalizacao"] == 60
    assert c.fala_abertura.texto == "O que vamos priorizar?" and c.frase_abertura == "Tudo importa. O dinheiro não cobre tudo."
    assert c.relato.autor == "Helena" and "ex-diretora de capacitação" in c.relato.funcao
    nomes = {a.id: (a.nome, a.funcao_curta) for a in c.atores}
    assert nomes["presidente"] == ("Otávio Rezende", "presidente da associação")


def test_horas_alternativas_e_consulta():
    c = _c()
    # horas: atendimento cheio (50 h) + digitalização R$ 16 mil (53 h) = 103 h > 100 h
    with pytest.raises(AlocacaoInvalida, match="horas"):
        alocacao.normalizar(c, {"atendimento": 8000, "digitalizacao": 16000})
    # alternativa online só depois da consulta, e nunca junto com a presencial
    with pytest.raises(AlocacaoInvalida, match="consultar"):
        alocacao.normalizar(c, {"formacao_online": 8000})
    with pytest.raises(AlocacaoInvalida, match="uma só alternativa"):
        alocacao.normalizar(c, {"formacao_online": 4000, "formacao_vendas": 4000}, escolhas={"consultou_associados": True})
    ok = {"digitalizacao": 12000, "formacao_online": 6000, "atendimento": 6000}
    assert alocacao.horas_usadas(c, ok, {"consultou_associados": True}) == 40 + 12 + 38 + 8
    assert alocacao.normalizar(c, ok, escolhas={"consultou_associados": True})["formacao_online"] == 6000
    p = alocacao.previa(c, {"atendimento": 8000, "digitalizacao": 16000}, INI)
    assert p["horas_excedente"] == 3 and not p["fechado"]


def test_soma_nunca_passa_do_disponivel():
    c = _c()
    with pytest.raises(AlocacaoInvalida):
        alocacao.normalizar(c, {"digitalizacao": 18000, "formacao_vendas": 14000})
    with pytest.raises(AlocacaoInvalida):
        alocacao.normalizar(c, {"inexistente": 100})
    with pytest.raises(AlocacaoInvalida):
        alocacao.normalizar(c, {"atendimento": 9000})  # acima do custo
    assert alocacao.normalizar(c, {"atendimento": 8000}) == {"atendimento": 8000, "digitalizacao": 0, "formacao_vendas": 0,
                                                                          "formacao_online": 0}


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
    assert "| Atendimento ao associado | Patrícia Lemos | R$ 8.000 | R$ 8.000 | 50 h | financiada |" in m
    assert "adiada" in m and "Regras que a decisão e a simulação devem respeitar" in m


def test_decisao_guiada_soma_pontos_de_comunicacao_e_meta():
    c = _c()
    a = {"atendimento": 8000}
    sem = alocacao.calcular(c, a, {})["pontos"]
    com = alocacao.calcular(c, a, {"comunicacao": 1, "meta_mensuravel": 1, "revisao_programada": 1})["pontos"]
    assert com["engajamento"] - sem["engajamento"] == 1.5
    assert com["conformidade"] - sem["conformidade"] == 2.0


def test_progresso_da_meta_do_jogador():
    c = _c()
    esc = {"construtor": {"qtd": "40", "oque": ["lojas vendendo pela internet"], "oqueLivre": ""},
           "meta": "40 lojas vendendo pela internet até o fim do trimestre"}
    cheio = alocacao.progresso_meta(c, {"digitalizacao": 18000}, esc, {"engajamento": 60})
    metade = alocacao.progresso_meta(c, {"digitalizacao": 9000}, esc, {"engajamento": 60})
    nada = alocacao.progresso_meta(c, {"atendimento": 8000}, esc, {"engajamento": 60})
    assert cheio["demanda_id"] == "digitalizacao" and cheio["previsto"] > metade["previsto"] > nada["previsto"] == 0
    assert cheio["situacao"] == "no caminho" and nada["situacao"] == "longe da meta"
    assert alocacao.progresso_meta(c, {"digitalizacao": 18000}, {}, {"engajamento": 60}) is None
