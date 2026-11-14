import httpx
from fastapi.testclient import TestClient

from app import mirofish_client
from app.main import app
from app.mirofish_client import MiroFish

from .mirofish_falso import MiroFishFalso
from .test_avaliacao import BOA, _esc


def test_certificacoes_por_competencia():
    with TestClient(app) as cli:
        mirofish_client.definir_fabrica(lambda: MiroFish("http://mf", transport=httpx.MockTransport(MiroFishFalso(saudavel=False))))
        s = cli.post("/api/sessoes", json={"apelido": "Clara"}).json()
        h = {"X-Sessao": s["token"]}
        camp = cli.post("/api/campanhas", headers=h, json={}).json()
        r = cli.get(f"/api/campanhas/{camp['id']}/selos", headers=h).json()
        assert len(r["selos"]) == 9 and not any(x["ganho"] for x in r["selos"]) and r["novos"] == []
        nomes = {x["nome"] for x in r["selos"]}
        assert {"Decisão clara", "Meta mensurável", "Orçamento equilibrado", "Ouviu a rede", "Consultou os associados",
                "Comparou alternativas", "Previsão certeira", "Revisou com base em resultados", "Deixou seu legado"} == nomes
        esc = _esc(alternativas=[{"rotulo": "A"}, {"rotulo": "B"}], alternativa_escolhida="A")
        t = cli.post(f"/api/campanhas/{camp['id']}/tentativas", headers=h, json={
            "decisao": "Prioridade: digitalização, formação online e atendimento.", "alocacao": BOA, "escolhas": esc}).json()
        r = cli.get(f"/api/campanhas/{camp['id']}/selos", headers=h).json()
        ganhos = {x["id"] for x in r["selos"] if x["ganho"]}
        assert {"decisao_clara", "meta_mensuravel", "orcamento_equilibrado", "ouviu_rede", "consultou_associados",
                "comparou_alternativas"} <= ganhos
        assert {x["id"] for x in r["novos"]} == ganhos
        assert cli.get(f"/api/campanhas/{camp['id']}/selos", headers=h).json()["novos"] == []  # só avisa uma vez
        # experimentar outro caminho na mesma missão = revisou com base em resultados
        cli.post(f"/api/campanhas/{camp['id']}/tentativas", headers=h, json={
            "decisao": "Outro caminho: atendimento e digitalização.", "alocacao": {"atendimento": 8000, "digitalizacao": 12000}, "escolhas": {}})
        assert "revisou_resultados" in {x["id"] for x in cli.get(f"/api/campanhas/{camp['id']}/selos", headers=h).json()["novos"]}
        av = cli.post(f"/api/campanhas/{camp['id']}/avancar", headers=h, json={"tentativa_id": t["tentativa_id"]})
        assert av.status_code == 200, av.text
        cert = cli.get(f"/api/campanhas/{camp['id']}/certificado", headers=h).json()
        assert cert["apelido"] == "Clara" and len(cert["selos"]) >= 6
