import time

import httpx
from fastapi.testclient import TestClient

from app import mirofish_client
from app.main import app
from app.mirofish_client import MiroFish

from .mirofish_falso import MiroFishFalso


def test_selos_por_comportamento_e_certificado():
    with TestClient(app) as cli:
        mirofish_client.definir_fabrica(lambda: MiroFish("http://mf", transport=httpx.MockTransport(MiroFishFalso(saudavel=False))))
        s = cli.post("/api/sessoes", json={"apelido": "Clara"}).json()
        h = {"X-Sessao": s["token"]}
        camp = cli.post("/api/campanhas", headers=h, json={}).json()
        r = cli.get(f"/api/campanhas/{camp['id']}/selos", headers=h).json()
        assert len(r["selos"]) == 6 and not any(x["ganho"] for x in r["selos"]) and r["novos"] == []
        # decisão completa com meta; Seu Jorge (associado do bairro) começa desconfiado
        t = cli.post(f"/api/campanhas/{camp['id']}/tentativas", headers=h, json={
            "decisao": "Prioridade: atendimento. Meta: 50 associados recontatados.", "alocacao": {"atendimento": 8000},
            "escolhas": {"resumo_completo": 1, "meta_mensuravel": 1, "considerou_vivencias": 1}}).json()
        rc = cli.post(f"/api/tentativas/{t['tentativa_id']}/conversa", headers=h,
                      json={"interlocutor": "associado_bairro", "mensagem": "Por que você desconfia da diretoria?"})
        assert rc.status_code == 200, rc.text
        r = cli.get(f"/api/campanhas/{camp['id']}/selos", headers=h).json()
        ganhos = {x["id"] for x in r["selos"] if x["ganho"]}
        assert {"considerou_vivencia", "decisao_clara", "meta_mensuravel", "ouviu_discordante"} <= ganhos
        assert {x["id"] for x in r["novos"]} == ganhos
        assert cli.get(f"/api/campanhas/{camp['id']}/selos", headers=h).json()["novos"] == []  # só avisa uma vez
        av = cli.post(f"/api/campanhas/{camp['id']}/avancar", headers=h, json={"tentativa_id": t["tentativa_id"]})
        assert av.status_code == 200, av.text
        t2 = cli.post(f"/api/campanhas/{camp['id']}/tentativas", headers=h, json={
            "decisao": "Ajustamos o atendimento.", "alocacao": {"atendimento": 8000}, "escolhas": {"continuidade": "ajustar"}})
        assert t2.status_code == 200, t2.text
        assert "revisou_resultados" in {x["id"] for x in cli.get(f"/api/campanhas/{camp['id']}/selos", headers=h).json()["novos"]}
        cert = cli.get(f"/api/campanhas/{camp['id']}/certificado", headers=h).json()
        assert cert["apelido"] == "Clara" and len(cert["selos"]) >= 5 and cert["trimestres"][0]["resumo"].startswith("Prioridade")
