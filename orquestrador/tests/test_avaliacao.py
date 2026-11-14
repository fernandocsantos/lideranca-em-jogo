"""Carimbo e desempenho acadêmico: regras determinísticas (config/avaliacao.yaml)."""
from app import avaliacao, cenarios, config, simulacao

INI = config.jogo()["campanha"]["indicadores_iniciais"]
BOA = {"digitalizacao": 12000, "formacao_online": 6000, "atendimento": 6000}


def _esc(**extra):
    e = {"consultou_associados": True, "interpretacao": "formato", "interpretou_relato": 1,
         "motivos": ["Mais associados beneficiados"], "meta_mensuravel": 1, "revisao_programada": 1,
         "construtor": {"qtd": "25", "oque": ["lojas vendendo pela internet"], "oqueLivre": "", "prazo": ["30 dias"]},
         "meta": "25 lojas vendendo pela internet até 30 dias",
         "cortes_linhas": {"digitalizacao": {"motivos": ["Falta de horas da equipe"]}, "formacao_vendas": {"motivos": ["Há alternativa mais barata"]},
                           "atendimento": {"motivos": ["Menor impacto no curto prazo"]}},
         "indicadores_sugeridos": {"digitalizacao": "% de lojistas digitalizados"}, "expectativa_ids": ["adesao"],
         "ano_anterior": {"digitalizacao": 18000, "formacao_vendas": 14000, "formacao_online": 0, "atendimento": 8000}}
    e.update(extra)
    return e


def test_caminho_do_pitch_tem_sucesso_e_conceito_a():
    c = cenarios.obter("guia_t1_orcamento", "media")
    r = simulacao.resultado_base(c, BOA, _esc(), INI)
    av = r["avaliacao"]
    assert av["carimbo"] == "SUCESSO", av
    assert av == simulacao.resultado_base(c, BOA, _esc(), INI)["avaliacao"]  # determinístico
    crit = {x["id"]: x["conceito"] for x in av["desempenho"]["criterios"]}
    assert crit["relato"] == "A" and crit["limites"] == "A" and crit["justificativa"] == "A"
    assert av["desempenho"]["geral"] in ("A", "B")
    assert av["pesos"]["mais"] and all("pontos" not in p for p in av["pesos"]["mais"])  # sem números
    assert any("consultou" in f for f in av["feedback_relato"])
    assert [h["texto"] for h in av["hipoteses"]][0] == "Lojistas com pouco tempo livre durante o dia"


def test_sem_meta_e_sem_justificativa_nao_tem_sucesso():
    c = cenarios.obter("guia_t1_orcamento", "media")
    e = _esc(meta_mensuravel=0, meta="", construtor={}, cortes_linhas={}, consultou_associados=False, interpretacao="cortar")
    av = simulacao.resultado_base(c, {"digitalizacao": 12000, "atendimento": 8000}, e, INI)["avaliacao"]
    assert av["carimbo"] != "SUCESSO"
    crit = {x["id"]: x["conceito"] for x in av["desempenho"]["criterios"]}
    assert crit["relato"] == "D" and crit["meta"] == "D" and crit["justificativa"] in ("C", "D")
    assert any("pulou a consulta" in f for f in av["feedback_relato"])


def test_limite_estourado_e_fracasso():
    c = cenarios.obter("guia_t1_orcamento", "media")
    av = avaliacao.avaliar(c, {"indicadores": {"variacao": {}}, "meta": None}, _esc(), {"digitalizacao": 18000, "atendimento": 8000})
    assert av["carimbo"] == "FRACASSO" and "teto" in av["motivo"]


def test_hipotese_ajustada_muda_o_calculo():
    c = cenarios.obter("guia_t1_orcamento", "media")
    a = simulacao.resultado_base(c, BOA, _esc(), INI)
    b = simulacao.resultado_base(c, BOA, _esc(hipoteses_trocadas=["receita"]), INI)
    assert b["indicadores"]["variacao"]["saude_financeira"] > a["indicadores"]["variacao"]["saude_financeira"]
    assert any(h["ajustada"] for h in b["avaliacao"]["hipoteses"])


def test_revisao_humana_pelo_facilitador():
    from fastapi.testclient import TestClient
    from app.main import app
    from app import settings
    with TestClient(app) as cli:
        settings.MIROFISH_DESATIVADO = True
        s = cli.post("/api/sessoes", json={"apelido": "Bia"}).json()
        h = {"X-Sessao": s["token"]}
        camp = cli.post("/api/campanhas", headers=h, json={"perfil": "media"}).json()
        r = cli.post(f"/api/campanhas/{camp['id']}/tentativas", headers=h, json={"decisao": "Prioridade: atendimento e digitalização.",
                     "alocacao": {"atendimento": 8000, "digitalizacao": 12000}, "escolhas": {}}).json()
        tid = r["tentativa_id"]
        assert cli.get(f"/api/tentativas/{tid}", headers=h).json()["revisao_humana"] == "pendente"
        hf = {"X-Facilitador": "segredo-teste"}
        assert cli.post(f"/api/facilitador/simulacoes/{tid}/revisao", json={"status": "validada"}).status_code in (401, 403)
        assert cli.post(f"/api/facilitador/simulacoes/{tid}/revisao", headers=hf, json={"status": "validada"}).json()["ok"]
        assert cli.get(f"/api/tentativas/{tid}", headers=h).json()["revisao_humana"] == "validada"
        assert any(x["id"] == tid for x in cli.get("/api/facilitador/simulacoes", headers=hf).json()["simulacoes"])


def test_desfazer_e_reiniciar_sem_corromper_o_historico():
    from fastapi.testclient import TestClient
    from app.main import app
    from app import db, settings
    with TestClient(app) as cli:
        settings.MIROFISH_DESATIVADO = True
        s = cli.post("/api/sessoes", json={"apelido": "Lia"}).json()
        h = {"X-Sessao": s["token"]}
        camp = cli.post("/api/campanhas", headers=h, json={"perfil": "media"}).json()
        cid, ini = camp["id"], camp["indicadores"]
        assert cli.post(f"/api/campanhas/{cid}/desfazer", headers=h).status_code == 400  # nada a desfazer
        r = cli.post(f"/api/campanhas/{cid}/tentativas", headers=h, json={"decisao": "Prioridade: atendimento e digitalização.",
                     "alocacao": {"atendimento": 8000, "digitalizacao": 12000}, "escolhas": {}}).json()
        est = cli.post(f"/api/campanhas/{cid}/avancar", headers=h, json={"tentativa_id": r["tentativa_id"]}).json()
        assert est["indice_atual"] == 1 and est["historico"][0]["carimbo"]
        volta = cli.post(f"/api/campanhas/{cid}/desfazer", headers=h).json()
        assert volta["indice_atual"] == 0 and volta["historico"] == [] and volta["indicadores"] == ini
        assert len(volta["tentativas"]) == 1  # a tentativa continua no histórico
        # vivência da sessão sobrevive ao reinício
        db.executar("INSERT INTO vivencias (id, sessao_id, perfil, tipo, tema, respostas, substituicoes, risco, status, codigo_hash, "
                    "consentimento, criado_em, expira_em) VALUES ('viv_t', ?, '{}', 'feedback', 'orcamento', '{}', '[]', '{}', "
                    "'em_revisao', 'x', '{}', '2026-11-14', '2028-11-14')", (s["sessao_id"],))
        nova = cli.post(f"/api/campanhas/{cid}/reiniciar", headers=h).json()
        assert nova["id"] != cid and nova["indice_atual"] == 0 and nova["historico"] == []
        assert db.um("SELECT status FROM campanhas WHERE id=?", (cid,))["status"] == "reiniciada"
        assert db.um("SELECT id FROM vivencias WHERE id='viv_t'")
