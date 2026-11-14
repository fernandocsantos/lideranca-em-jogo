import base64

from fastapi.testclient import TestClient

from app import settings
from app.main import app


def _basic(u, s):
    return {"Authorization": "Basic " + base64.b64encode(f"{u}:{s}".encode()).decode()}


def test_sem_senha_configurada_o_acesso_e_livre(monkeypatch):
    monkeypatch.setattr(settings, "ACESSO_SENHA", "")
    with TestClient(app) as cli:
        assert cli.get("/api/config").status_code == 200


def test_com_senha_todo_o_site_pede_credenciais(monkeypatch):
    monkeypatch.setattr(settings, "ACESSO_SENHA", "s3gredo-da-turma")
    monkeypatch.setattr(settings, "ACESSO_USUARIO", "hackathon")
    with TestClient(app) as cli:
        for caminho in ("/", "/api/config", "/static/app.js", "/facilitador"):
            r = cli.get(caminho)
            assert r.status_code == 401 and "WWW-Authenticate" in r.headers, caminho
        assert cli.get("/api/config", headers=_basic("hackathon", "errada")).status_code == 401
        assert cli.get("/api/config", headers=_basic("outro", "s3gredo-da-turma")).status_code == 401
        assert cli.get("/api/config", headers=_basic("hackathon", "s3gredo-da-turma")).status_code == 200
        assert cli.get("/", headers=_basic("hackathon", "s3gredo-da-turma")).status_code == 200


def test_teto_diario_do_site(monkeypatch):
    from app import config, custos, db
    monkeypatch.setitem(config.jogo()["limites"], "simulacoes_por_dia_total", 2)
    for i in range(2):
        db.inserir("tentativas", {"id": f"t{i}", "campanha_id": "c", "sessao_id": f"s{i}", "cenario_id": "x", "indice": 0,
                                  "decisao": "d", "esclarecimentos": [], "status": "concluida",
                                  "criado_em": db.agora(), "atualizado_em": db.agora()})
    ok, motivo = custos.pode_simular("outra_sessao")
    assert not ok and "todos os participantes" in motivo
