"""Persistência em SQLite (arquivo local). Simples e suficiente para o protótipo."""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import settings

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessoes (
  id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, apelido TEXT NOT NULL, criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS campanhas (
  id TEXT PRIMARY KEY, sessao_id TEXT NOT NULL, cenarios TEXT NOT NULL, indice_atual INTEGER NOT NULL,
  indicadores TEXT NOT NULL, historico TEXT NOT NULL, status TEXT NOT NULL, criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tentativas (
  id TEXT PRIMARY KEY, campanha_id TEXT NOT NULL, sessao_id TEXT NOT NULL, cenario_id TEXT NOT NULL,
  indice INTEGER NOT NULL, decisao TEXT NOT NULL, esclarecimentos TEXT NOT NULL,
  status TEXT NOT NULL, etapa TEXT, progresso INTEGER DEFAULT 0, parciais TEXT DEFAULT '[]',
  modo TEXT, aviso TEXT, rodadas INTEGER, resultado TEXT, indicadores_antes TEXT, indicadores_depois TEXT,
  mirofish TEXT DEFAULT '{}', erro TEXT, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tentativa_id TEXT NOT NULL, interlocutor TEXT NOT NULL,
  papel TEXT NOT NULL, conteudo TEXT NOT NULL, criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS uso_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT, sessao_id TEXT, campanha_id TEXT, tentativa_id TEXT,
  tarefa TEXT NOT NULL, modelo TEXT NOT NULL, entrada INTEGER NOT NULL, saida INTEGER NOT NULL,
  custo_usd REAL NOT NULL, estimado INTEGER NOT NULL DEFAULT 0, criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS grafos_cache (
  chave TEXT PRIMARY KEY, graph_id TEXT NOT NULL, project_id TEXT NOT NULL, criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS configuracao (
  chave TEXT PRIMARY KEY, valor TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS llm_cache (
  chave TEXT PRIMARY KEY, tarefa TEXT NOT NULL, resposta TEXT NOT NULL, criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sim_cache (
  chave TEXT PRIMARY KEY, dados TEXT NOT NULL, criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tent_camp ON tentativas(campanha_id);
CREATE INDEX IF NOT EXISTS idx_uso_sessao ON uso_tokens(sessao_id);
"""

JSON_COLS = {"cenarios", "indicadores", "historico", "esclarecimentos", "parciais", "resultado",
             "indicadores_antes", "indicadores_depois", "mirofish", "alocacao", "escolhas", "devolutiva",
             "selos", "dados", "avatar", "respostas"}

# Colunas acrescentadas depois da primeira versão (migração simples e idempotente).
MIGRACOES = {
    "campanhas": {"perfil": "TEXT", "selos": "TEXT DEFAULT '[]'"},
    "tentativas": {"alocacao": "TEXT", "escolhas": "TEXT", "devolutiva": "TEXT", "fase": "TEXT",
                   "revisao_humana": "TEXT DEFAULT 'pendente'"},
}


def agora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def novo_id(prefixo: str) -> str:
    return f"{prefixo}_{uuid.uuid4().hex[:12]}"


def conectar(caminho: str | None = None) -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is not None and caminho is None:
            return _conn
        caminho = caminho or settings.DB_PATH
        if caminho != ":memory:":
            Path(caminho).parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(caminho, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.executescript(SCHEMA)
        for tabela, cols in MIGRACOES.items():
            existentes = {r[1] for r in _conn.execute(f"PRAGMA table_info({tabela})")}
            for col, tipo in cols.items():
                if col not in existentes:
                    _conn.execute(f"ALTER TABLE {tabela} ADD COLUMN {col} {tipo}")
        _conn.commit()
        return _conn


def _dec(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    d = dict(row)
    for k in JSON_COLS & d.keys():
        if d[k] is not None:
            d[k] = json.loads(d[k])
    return d


def _enc(v: Any) -> Any:
    return json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v


def inserir(tabela: str, dados: dict[str, Any]) -> None:
    cols = ",".join(dados)
    marc = ",".join("?" for _ in dados)
    with _lock:
        c = conectar()
        c.execute(f"INSERT INTO {tabela} ({cols}) VALUES ({marc})", [_enc(v) for v in dados.values()])
        c.commit()


def atualizar(tabela: str, id_: str, dados: dict[str, Any], chave: str = "id") -> None:
    if tabela == "tentativas":
        dados = {**dados, "atualizado_em": agora()}
    sets = ",".join(f"{k}=?" for k in dados)
    with _lock:
        c = conectar()
        c.execute(f"UPDATE {tabela} SET {sets} WHERE {chave}=?", [_enc(v) for v in dados.values()] + [id_])
        c.commit()


def um(sql: str, params: tuple = ()) -> dict[str, Any] | None:
    with _lock:
        return _dec(conectar().execute(sql, params).fetchone())


def varios(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    with _lock:
        return [_dec(r) for r in conectar().execute(sql, params).fetchall()]


def executar(sql: str, params: tuple = ()) -> None:
    with _lock:
        c = conectar()
        c.execute(sql, params)
        c.commit()


def apagar_sessao(sessao_id: str) -> None:
    """LGPD: remove tudo o que pertence à sessão."""
    with _lock:
        c = conectar()
        tent = [r[0] for r in c.execute("SELECT id FROM tentativas WHERE sessao_id=?", (sessao_id,))]
        for t in tent:
            c.execute("DELETE FROM mensagens WHERE tentativa_id=?", (t,))
        c.execute("DELETE FROM tentativas WHERE sessao_id=?", (sessao_id,))
        c.execute("DELETE FROM campanhas WHERE sessao_id=?", (sessao_id,))
        c.execute("UPDATE uso_tokens SET sessao_id=NULL WHERE sessao_id=?", (sessao_id,))
        c.execute("DELETE FROM sessoes WHERE id=?", (sessao_id,))
        try:
            c.execute("DELETE FROM vivencias WHERE sessao_id=? AND status!='aprovada'", (sessao_id,))
            c.execute("UPDATE vivencias SET sessao_id=NULL WHERE sessao_id=?", (sessao_id,))
        except sqlite3.OperationalError:
            pass
        c.commit()
