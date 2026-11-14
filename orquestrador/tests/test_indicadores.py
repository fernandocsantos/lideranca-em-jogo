from app import cenarios
from app.indicadores import calcular
from app.modelos import ExtracaoSinais, ReacaoAtor, Sinal

BASE = {"engajamento": 50, "saude_financeira": 50, "reputacao": 50, "capital_politico": 50, "coesao": 50,
        "conformidade": 50}


def _ext(sinais=(), reacoes=(), flags=()):
    return ExtracaoSinais(resumo_narrativo="x", momentos=[], riscos=[], sinais_alerta=[], o_que_mudaria=[], sinais=list(sinais), reacoes=list(reacoes),
                          flags=list(flags))


def test_deterministico():
    c = cenarios.obter("cur_01_natal_iluminado")
    e = _ext([Sinal(indicador="reputacao", intensidade=2, evidencia="e", ator_id="jornal")],
             [ReacaoAtor(ator_id="lojista_bairro", postura_final=1, reacao="r", citacao="")], ["consulta_aos_associados"])
    assert calcular(BASE, e, c) == calcular(BASE, e, c)


def test_sinal_com_influencia():
    c = cenarios.obter("cur_01_natal_iluminado")  # jornal tem influência 3 => multiplicador 1.0
    r = calcular(BASE, _ext([Sinal(indicador="reputacao", intensidade=2, evidencia="e", ator_id="jornal")]), c)
    # +4 pontos, elasticidade em 50 = 1.0
    assert r["variacao"]["reputacao"] == 4.0
    assert all(v == 0 for k, v in r["variacao"].items() if k != "reputacao")


def test_mudanca_de_postura_por_tipo():
    c = cenarios.obter("cur_01_natal_iluminado")  # lojista_bairro: associado, postura -1
    r = calcular(BASE, _ext(reacoes=[ReacaoAtor(ator_id="lojista_bairro", postura_final=1, reacao="", citacao="")]), c)
    assert r["variacao"]["engajamento"] == 3.0  # +2 × 1.5
    assert r["variacao"]["saude_financeira"] == 1.0  # +2 × 0.5


def test_flags_e_limite_por_rodada():
    c = cenarios.obter("cur_02_lgpd_cadastro")
    sinais = [Sinal(indicador="conformidade", intensidade=-3, evidencia="e", ator_id=None)] * 5
    r = calcular(BASE, _ext(sinais, flags=["risco_lgpd", "conflito_de_interesse"]), c)
    assert r["variacao"]["conformidade"] == -20.0  # bruto -48, limitado a -20, elasticidade 1.0


def test_elasticidade_perto_dos_extremos():
    c = cenarios.obter("cur_01_natal_iluminado")
    alto = dict(BASE, reputacao=95)
    r = calcular(alto, _ext([Sinal(indicador="reputacao", intensidade=3, evidencia="e", ator_id=None)]), c)
    assert r["variacao"]["reputacao"] == 3.0  # +6 × 0.5
    baixo = dict(BASE, reputacao=2)
    r = calcular(baixo, _ext([Sinal(indicador="reputacao", intensidade=-3, evidencia="e", ator_id=None)]), c)
    assert r["depois"]["reputacao"] == 0  # nunca abaixo de 0


def test_intensidade_fora_da_faixa_e_limitada():
    c = cenarios.obter("cur_01_natal_iluminado")
    r = calcular(BASE, _ext([Sinal(indicador="coesao", intensidade=9, evidencia="e", ator_id=None)]), c)
    assert r["variacao"]["coesao"] == 6.0


def test_auditoria_registra_cada_passo():
    c = cenarios.obter("cur_01_natal_iluminado")
    r = calcular(BASE, _ext([Sinal(indicador="coesao", intensidade=1, evidencia="ev", ator_id="tesoureira")],
                            flags=["transparencia_ativa"]), c)
    regras = {a["regra"] for a in r["auditoria"]}
    assert {"sinal", "flag", "consolidacao"} <= regras
