"""Teste ponta a ponta: cenário -> decisão (com esclarecimento) -> simulação -> resultado -> conversa
-> refazer/comparar -> avançar, pela API HTTP real, com MiroFish simulado e LLM de demonstração."""
import time

import httpx
from fastapi.testclient import TestClient

from app import cenarios, mirofish_client
from app.main import app
from app.mirofish_client import MiroFish

from .mirofish_falso import MiroFishFalso

DECISAO_CURTA = "Vou resolver o problema conversando com as pessoas e buscando uma solução boa para todos."
DECISAO = ("Convoco reunião extraordinária do conselho em 5 dias para aprovar cotas menores de patrocínio. "
           "Em paralelo, negocio com a Secretaria de Cultura a estrutura da praça em troca de atrações nos bairros, "
           "faço consulta rápida aos associados pelo grupo e publico nota à imprensa explicando o plano e o orçamento.")


def _esperar(cli, tid, h, prazo=30):
    fim = time.time() + prazo
    while time.time() < fim:
        t = cli.get(f"/api/tentativas/{tid}", headers=h).json()
        if t["status"] in ("concluida", "erro"):
            return t
        time.sleep(0.05)
    raise AssertionError("simulação não terminou a tempo")


def _instalar_mirofish(falso):
    mirofish_client.definir_fabrica(lambda: MiroFish("http://mf", transport=httpx.MockTransport(falso)))


def _esperar_completo(cli, tid, h, prazo=30):
    fim = time.time() + prazo
    while time.time() < fim:
        t = cli.get(f"/api/tentativas/{tid}", headers=h).json()
        if (t["fase"] == "completo" or t["status"] == "erro") and t["devolutiva"]:
            return t
        time.sleep(0.05)
    raise AssertionError("simulação/devolutiva não terminou a tempo")


def test_dois_trimestres_do_guia_com_mirofish():
    inicio = time.time()
    with TestClient(app) as cli:
        cfg = cli.get("/api/config").json()
        assert {p["id"] for p in cfg["perfis"]} == {"pequena", "media", "grande"}
        s = cli.post("/api/sessoes", json={"apelido": "Ana"}).json()
        h = {"X-Sessao": s["token"]}
        camp = cli.post("/api/campanhas", headers=h, json={"perfil": "media"}).json()
        assert camp["total"] == 2 and camp["cenario"]["id"] == "guia_t1_orcamento"
        cen = camp["cenario"]
        assert cen["disponivel"] == 24000 and len(cen["narrativa"].split()) <= 80
        falso = MiroFishFalso(cen["atores"])
        _instalar_mirofish(falso)

        # prévia instantânea (sem IA): soma acima do disponível é recusada
        acima = cli.post(f"/api/campanhas/{camp['id']}/previa", headers=h,
                         json={"alocacao": {"digitalizacao": 18000, "formacao_vendas": 14000}}).json()
        assert acima["excedente"] == 8000 and not acima["fechado"]  # Mesa mostra "Falta cortar R$ 8.000"
        assert [d["ano_anterior"] for d in cen["demandas"]] == [18000, 14000, 0, 8000]  # soma 40 mil > teto 24 mil
        t0 = time.time()
        pv = cli.post(f"/api/campanhas/{camp['id']}/previa", headers=h,
                      json={"alocacao": {"formacao_vendas": 14000, "atendimento": 8000}}).json()
        assert time.time() - t0 < 0.5 and pv["saldo"] == 2000
        assert {d["id"]: d["expressao"] for d in pv["demandas"]}["digitalizacao"] == "desconfiada"

        # T1: resultado base sai na hora; a simulação ajusta depois
        aloc1 = {"formacao_vendas": 14000, "atendimento": 8000}
        r = cli.post(f"/api/campanhas/{camp['id']}/tentativas", headers=h, json={
            "decisao": "Priorizamos formação e atendimento; digitalização adiada. Comunicamos em assembleia.",
            "alocacao": aloc1, "escolhas": {"comunicacao": "assembleia"}}).json()
        t = cli.get(f"/api/tentativas/{r['tentativa_id']}", headers=h).json()
        assert t["resultado"]["fase"] in ("base", "completo") and t["resultado"]["indicadores"]["depois"]  # na hora
        assert "R$ 0 | 0 h | adiada" in falso.ultimo_material or falso.ultimo_material == ""
        t = _esperar_completo(cli, r["tentativa_id"], h)
        assert t["fase"] == "completo" and t["modo"] == "mirofish"
        assert "| Formação em vendas (presencial) | Dona Cida Moraes | R$ 14.000 | R$ 14.000 | 40 h | financiada |" in falso.ultimo_material
        res = t["resultado"]
        assert 3 <= len(res["momentos"]) <= 5 and res["resumo"]
        assert t["devolutiva"]["perguntas_reflexivas"]
        # ajuste da simulação limitado a ±10 por indicador
        base = res["pontos_base"]
        assert all(abs(res["indicadores"]["variacao"][k] - 0) <= abs(base[k]) + 10 + 0.01 for k in base)

        # conversa com agente (entrevista MiroFish) e com o analista
        c1 = cli.post(f"/api/tentativas/{t['id']}/conversa", headers=h,
                      json={"interlocutor": "lojista_digital", "mensagem": "Por que você ficou chateado?"}).json()
        assert c1["fonte"] == "mirofish"
        assert "anunciou recentemente esta decisão" in falso.ultima_pergunta

        # refazer: mesmo ponto de partida
        falso.polls_execucao = 0
        r2 = cli.post(f"/api/campanhas/{camp['id']}/tentativas", headers=h, json={
            "decisao": "Financiamos a digitalização e o atendimento.", "alocacao": {"digitalizacao": 15000, "atendimento": 8000}}).json()
        t2 = _esperar_completo(cli, r2["tentativa_id"], h)
        assert t2["resultado"]["indicadores"]["antes"] == t["resultado"]["indicadores"]["antes"]
        assert len(cli.get(f"/api/campanhas/{camp['id']}/comparar", params={"indice": 0}, headers=h).json()["tentativas"]) == 2

        # avançar para o T2 com a primeira tentativa: indicadores acumulam e a alocação fica no histórico
        est = cli.post(f"/api/campanhas/{camp['id']}/avancar", headers=h, json={"tentativa_id": t["id"]}).json()
        assert est["indice_atual"] == 1 and est["cenario"]["id"] == "guia_t2_orcamento"
        assert est["indicadores"] == t["resultado"]["indicadores"]["depois"]
        assert est["historico"][0]["alocacao"]["formacao_vendas"] == 14000
        assert est["cenario"]["disponivel"] == 35000

        falso.polls_execucao = 0
        r3 = cli.post(f"/api/campanhas/{camp['id']}/tentativas", headers=h, json={
            "decisao": "Mantemos formação e atendimento e entramos na Black Friday.",
            "alocacao": {"formacao_vendas": 10000, "atendimento": 8000, "black_friday": 9000},
            "escolhas": {"continuidade": "manter"}}).json()
        t3 = cli.get(f"/api/tentativas/{r3['tentativa_id']}", headers=h).json()
        fim = cli.post(f"/api/campanhas/{camp['id']}/avancar", headers=h, json={"tentativa_id": t3["id"]}).json()
        assert fim["status"] == "concluida"
        _esperar_completo(cli, r3["tentativa_id"], h)

        hf = {"X-Facilitador": "segredo-teste"}
        assert cli.get("/api/facilitador/partidas", headers=hf).json()["partidas"][0]["apelido"] == "Ana"
        assert "Ana" in cli.get("/api/facilitador/export.csv", headers=hf).text
        assert cli.delete("/api/sessoes/eu", headers=h).json()["ok"]
    assert time.time() - inicio < 60


def test_ciclo_em_contingencia_com_mirofish_fora():
    with TestClient(app) as cli:
        _instalar_mirofish(MiroFishFalso(saudavel=False))
        assert cli.get("/api/status").json()["mirofish"] is False
        s = cli.post("/api/sessoes", json={"apelido": "Beto"}).json()
        h = {"X-Sessao": s["token"]}
        camp = cli.post("/api/campanhas", headers=h).json()
        r = cli.post(f"/api/campanhas/{camp['id']}/tentativas", headers=h,
                     json={"decisao": DECISAO, "alocacao": {"atendimento": 8000}}).json()
        t = _esperar_completo(cli, r["tentativa_id"], h)
        assert t["status"] == "concluida" and t["modo"] == "contingencia"
        assert "contingência" in t["aviso"]
        ator = camp["cenario"]["atores"][1]["id"]
        c = cli.post(f"/api/tentativas/{t['id']}/conversa", headers=h,
                     json={"interlocutor": ator, "mensagem": "O que achou da decisão?"}).json()
        assert c["fonte"] == "contingencia" and c["resposta"]


def test_limite_diario_de_simulacoes(monkeypatch):
    from app import config
    monkeypatch.setitem(config.jogo()["limites"], "simulacoes_por_dia", 1)
    with TestClient(app) as cli:
        _instalar_mirofish(MiroFishFalso(saudavel=False))
        s = cli.post("/api/sessoes", json={"apelido": "Caio"}).json()
        h = {"X-Sessao": s["token"]}
        camp = cli.post("/api/campanhas", headers=h).json()
        assert cli.post(f"/api/campanhas/{camp['id']}/tentativas", headers=h, json={"decisao": DECISAO}).status_code == 200
        r = cli.post(f"/api/campanhas/{camp['id']}/tentativas", headers=h, json={"decisao": DECISAO})
        assert r.status_code == 429


def test_spa_e_estaticos_servidos():
    with TestClient(app) as cli:
        assert "Liderança em Jogo" in cli.get("/").text
        assert cli.get("/static/app.js").status_code == 200
        assert cli.get("/facilitador").status_code == 200


def test_relatorio_tem_ata_padronizada_com_7_secoes():
    with TestClient(app) as cli:
        _instalar_mirofish(MiroFishFalso(saudavel=False))
        s = cli.post("/api/sessoes", json={"apelido": "Rui"}).json()
        h = {"X-Sessao": s["token"]}
        camp = cli.post("/api/campanhas", headers=h, json={"perfil": "media"}).json()
        esc = {"motivos": ["Menor risco financeiro"], "envolvidos": ["tesoureiro"], "cortes_justificativa": ["Pode esperar o próximo trimestre"],
               "meta": "60 vendedores formados até 90 dias", "responsavel": "Diretoria executiva", "indicador_acompanhamento": "Engajamento dos associados",
               "revisao_dias": 30, "ano_anterior": {"digitalizacao": 12000, "formacao_vendas": 10000, "atendimento": 8000}}
        r1 = cli.post(f"/api/campanhas/{camp['id']}/tentativas", headers=h, json={"decisao": "Prioridade: formação e atendimento; digitalização reduzida.",
                      "alocacao": {"digitalizacao": 6000, "formacao_vendas": 10000, "atendimento": 8000}, "escolhas": esc}).json()
        _esperar_completo(cli, r1["tentativa_id"], h)
        r2 = cli.post(f"/api/campanhas/{camp['id']}/tentativas", headers=h, json={"decisao": "Refeito: atendimento e digitalização.",
                      "alocacao": {"digitalizacao": 15000, "atendimento": 8000}, "escolhas": esc}).json()
        _esperar_completo(cli, r2["tentativa_id"], h)
        cli.post(f"/api/campanhas/{camp['id']}/avancar", headers=h, json={"tentativa_id": r1["tentativa_id"]})
        rel = cli.get(f"/api/campanhas/{camp['id']}/relatorio", headers=h).json()
        a = rel["atas"][0]
        for secao in ("contexto", "prioridades", "orcamento", "resultados", "previsao", "indicadores", "competencias"):
            assert a[secao], secao
        assert a["consolidada"] and a["orcamento"]["linhas"][0]["variacao"] == -6000 and a["orcamento"]["linhas"][0]["variacao_pct"] == -50.0
        assert a["orcamento"]["total"] == 24000 == a["orcamento"]["teto"]
        assert a["resultados"]["revisao"] and a["resultados"]["responsavel"] == "Diretoria executiva"
        assert a["previsao"]["riscos"] and a["previsao"]["aviso"].startswith("Simulação para apoio")
        assert rel["consolidado"]["refeitas"][0]["tentativas"] == 2 and rel["consolidado"]["padroes"]
        assert rel["apelido"] is None
        assert cli.get(f"/api/campanhas/{camp['id']}/relatorio?apelido=1", headers=h).json()["apelido"] == "Rui"
