from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from app import config, db, llm, mirofish_client, settings
from app.demo import llm_demo

RAIZ = Path(__file__).resolve().parent.parent


async def _sem_espera(_s):
    return None


@pytest.fixture(autouse=True)
def ambiente(tmp_path, monkeypatch):
    # banco e cenários isolados por teste
    db._conn = None
    db.conectar(str(tmp_path / "teste.sqlite3"))
    from app import conselho
    conselho.preparar()
    cen = tmp_path / "cenarios"
    shutil.copytree(RAIZ / "cenarios" / "curados", cen / "curados")
    (cen / "gerados").mkdir()
    monkeypatch.setattr(settings, "CENARIOS_DIR", cen)
    monkeypatch.setattr(settings, "MIROFISH_DESATIVADO", False)
    monkeypatch.setattr(settings, "FACILITADOR_CODIGO", "segredo-teste")
    monkeypatch.setattr(mirofish_client, "_dormir", _sem_espera)
    monkeypatch.setitem(config.jogo()["mirofish"], "estabilidade_s", 0)
    monkeypatch.setitem(config.jogo()["simulacao"], "cache_simulacoes", False)  # testes dedicados ligam
    monkeypatch.setitem(config.llm(), "cache_respostas", False)
    llm.definir(llm_demo())
    mirofish_client.definir_fabrica(None)
    yield
    llm.definir(None)
    mirofish_client.definir_fabrica(None)
    db._conn = None


@pytest.fixture
def regras_indicadores():
    return config.indicadores()
