"""Banco de Vivências: mascaramento (critério de aceite), consentimento, exclusão, curadoria e bloqueio antes do MiroFish."""
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from app import db, mascaramento, mirofish_client, vivencias
from app.main import app
from app.mirofish_client import MiroFish

from .mirofish_falso import MiroFishFalso

ORIGINAIS = ["João Batista Ferreira", "123.456.789-09", "(19) 99876-5432", "joao.ferreira@gmail.com", "Padaria Estrela Ltda", "Campinas"]
RELATO = ("Em 2024 o presidente João Batista Ferreira, CPF 123.456.789-09, telefone (19) 99876-5432, e-mail joao.ferreira@gmail.com, "
          "dono da Padaria Estrela Ltda, em Campinas, cortou o evento e perdemos associados.")
PERFIL = {"papel": "Liderança", "segmento": "Varejo", "porte": "Pequeno porte", "regiao": "Interior de SP", "tempo": "6 a 15 anos"}
CONSENT = {"finalidade": True, "retencao": True, "compartilhamento": True}


def test_mascaramento_remove_nome_cpf_telefone_email_empresa_e_cidade():
    r = mascaramento.mascarar(RELATO)
    for o in ORIGINAIS:
        assert o not in r["texto"], o
    assert "[CPF]" in r["texto"] and "[telefone]" in r["texto"] and "[e-mail]" in r["texto"]
    assert "[Pessoa 1]" in r["texto"] and "[Empresa 1]" in r["texto"] and "uma cidade do interior" in r["texto"]
    assert mascaramento.detectar(r["texto"]) == []


def test_valores_viram_faixas_e_nomes_ficticios_do_jogo_sao_preservados():
    assert "entre R$ 10 mil e R$ 50 mil" in mascaramento.mascarar("Gastamos R$ 25.000 no evento.")["texto"]
    r = mascaramento.mascarar("Conversei com Marina Duarte antes.", permitidos=["Marina Duarte"])
    assert "Marina Duarte" in r["texto"]


def test_seis_exemplos_ficticios_aprovados():
    ex = [v for v in vivencias.listar("aprovada") if v["ficticia"]]
    assert len(ex) == 6


def test_risco_alto_bloqueia_aprovacao():
    assert vivencias.avaliar_risco({"x": "Eu era a única mulher na diretoria e decidi sozinha."})["nivel"] == "alto"
    assert vivencias.avaliar_risco({"x": "Cortamos um projeto e explicamos aos associados."})["nivel"] == "baixo"


def test_guarda_bloqueia_envio_com_dado_pessoal_sem_registrar_o_dado():
    mf = MiroFish("http://mf", transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"success": True, "data": {}})))
    import asyncio
    with pytest.raises(mascaramento.EnvioBloqueado):
        asyncio.run(mf.gerar_ontologia("Contato: 123.456.789-09", "req", "x"))
    b = db.um("SELECT destino, tipos FROM bloqueios_envio ORDER BY id DESC LIMIT 1")
    assert b["destino"] == "MiroFish" and b["tipos"] == "cpf" and "123" not in b["tipos"]


def test_fluxo_completo_e_payload_do_mirofish_sem_dados_pessoais():
    with TestClient(app) as cli:
        k = cli.get("/api/vivencias/config").json()
        assert set(k["tipos"]) == {"decisao", "situacao", "feedback", "stakeholder"}
        # conferência antes de enviar: nada é gravado
        n0 = len(vivencias.listar())
        prev = cli.post("/api/vivencias/mascarar", json={"respostas": {"situacao": RELATO}}).json()
        assert len(vivencias.listar()) == n0 and all(o not in prev["respostas"]["situacao"] for o in ORIGINAIS)
        # sem consentimento completo, recusa
        assert cli.post("/api/vivencias", json={"perfil": PERFIL, "tipo": "situacao", "tema": "orcamento",
                        "respostas": {"situacao": RELATO}, "consentimento": {"finalidade": True}}).status_code == 400
        s = cli.post("/api/sessoes", json={"apelido": "Lia"}).json()
        h = {"X-Sessao": s["token"]}
        # mesmo que o cliente envie o original, o servidor remascara antes de gravar
        r = cli.post("/api/vivencias", headers=h, json={"perfil": PERFIL, "tipo": "situacao", "tema": "orcamento",
                     "respostas": {"situacao": RELATO, "envolvidos": "Diretoria e lojistas.", "em_jogo": "A permanência dos associados."},
                     "consentimento": CONSENT}).json()
        assert r["codigo_exclusao"] and r["risco"]["nivel"] in ("baixo", "medio")
        guardado = db.um("SELECT respostas FROM vivencias WHERE id=?", (r["id"],))["respostas"]
        assert all(o not in str(guardado) for o in ORIGINAIS)
        hf = {"X-Facilitador": "segredo-teste"}
        assert cli.post(f"/api/facilitador/vivencias/{r['id']}/status", headers=hf, json={"status": "aprovada"}).json()["ok"]
        # a vivência entra nos relatos da pauta e no material enviado ao MiroFish
        camp = cli.post("/api/campanhas", headers=h, json={"perfil": "media"}).json()
        assert any(x["id"] == r["id"] for x in camp["cenario"]["relatos_rede"]) or len(camp["cenario"]["relatos_rede"]) == 3
        falso = MiroFishFalso(camp["cenario"]["atores"])
        mirofish_client.definir_fabrica(lambda: MiroFish("http://mf", transport=httpx.MockTransport(falso)))
        t = cli.post(f"/api/campanhas/{camp['id']}/tentativas", headers=h, json={
            "decisao": "Priorizamos o atendimento. Falei com o contador José Pereira (josep@uol.com.br, 11 98888-7777).",
            "alocacao": {"atendimento": 8000}, "escolhas": {}}).json()
        fim = time.time() + 20
        while time.time() < fim and not falso.ultimo_material:
            time.sleep(0.05)
        tt = cli.get(f"/api/tentativas/{t['tentativa_id']}", headers=h).json()
        assert falso.ultimo_material, (tt["status"], tt["erro"], tt["modo"], tt["aviso"], db.varios("SELECT * FROM bloqueios_envio"))
        for o in ORIGINAIS + ["José Pereira", "josep@uol.com.br", "98888-7777"]:
            assert o not in falso.ultimo_material, o
        assert mascaramento.detectar(falso.ultimo_material) == []
        # selo "Contribuiu com a rede"
        selos = cli.get(f"/api/campanhas/{camp['id']}/selos", headers=h).json()
        assert any(x["id"] == "contribuiu_rede" and x["ganho"] for x in selos["selos"])
        # titular exclui com o código
        assert cli.post("/api/vivencias/excluir", json={"codigo": r["codigo_exclusao"]}).json()["ok"]
        assert not db.um("SELECT id FROM vivencias WHERE id=?", (r["id"],))
        assert t["tentativa_id"]


def test_ensaio_mascara_nao_grava_e_devolve_riscos():
    with TestClient(app) as cli:
        n0 = db.um("SELECT COUNT(*) n FROM tentativas")["n"]
        r = cli.post("/api/ensaio/simular", json={
            "titulo": "Corte no evento de fim de ano", "contexto": "O tesoureiro Carlos Mendes (carlos@empresa.com) sugeriu cortar o evento em Campinas.",
            "teto": 40000, "linhas": [{"nome": "Evento", "ano_anterior": 30000, "proposto": 15000}, {"nome": "Atendimento", "ano_anterior": 10000, "proposto": 20000}],
            "criterios": ["Menor risco financeiro"], "stakeholders": ["Diretoria", "Associados do varejo"], "meta": "100 associados no evento"}).json()
        txt = str(r["entrada_mascarada"])
        for o in ["Carlos Mendes", "carlos@empresa.com", "Campinas"]:
            assert o not in txt
        assert r["riscos"] and r["orcamento"]["saldo"] == 5000 and r["aviso"].startswith("Simulação")
        assert db.um("SELECT COUNT(*) n FROM tentativas")["n"] == n0  # nada do ensaio vira registro no servidor
