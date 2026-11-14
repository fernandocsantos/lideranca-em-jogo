"""Configurações vindas do ambiente (.env) — chaves só no servidor."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_DIR = Path(os.environ.get("CONFIG_DIR", BASE_DIR / "config"))
CENARIOS_DIR = Path(os.environ.get("CENARIOS_DIR", BASE_DIR / "cenarios"))
FRONTEND_DIR = BASE_DIR / "frontend"
DB_PATH = os.environ.get("DB_PATH", str(BASE_DIR / "dados" / "jogo.sqlite3"))

MIROFISH_URL = os.environ.get("MIROFISH_URL", "")  # sobrescreve jogo.yaml se definido
MIROFISH_DESATIVADO = os.environ.get("MIROFISH_DESATIVADO", "false").lower() == "true"
FACILITADOR_CODIGO = os.environ.get("FACILITADOR_CODIGO", "")
