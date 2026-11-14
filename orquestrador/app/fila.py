"""Fila de simulações (asyncio). Workers configuráveis em jogo.yaml -> fila.workers."""
from __future__ import annotations

import asyncio
import logging

from . import config, db, simulacao

log = logging.getLogger(__name__)

_fila: asyncio.Queue[str] | None = None
_pendentes: list[str] = []
_workers: list[asyncio.Task] = []


async def _worker(n: int) -> None:
    assert _fila is not None
    while True:
        tid = await _fila.get()
        try:
            if tid in _pendentes:
                _pendentes.remove(tid)
            await simulacao.processar(tid)
        except Exception:  # noqa: BLE001
            log.exception("worker %s: erro inesperado na tentativa %s", n, tid)
        finally:
            _fila.task_done()


def iniciar() -> None:
    global _fila
    if _fila is not None:
        return
    _fila = asyncio.Queue()
    for n in range(int(config.jogo()["fila"]["workers"])):
        _workers.append(asyncio.create_task(_worker(n)))
    # Recupera tentativas que estavam na fila quando o servidor caiu.
    for t in db.varios("SELECT id FROM tentativas WHERE status IN ('na_fila','executando') ORDER BY criado_em"):
        enfileirar(t["id"])


async def parar() -> None:
    global _fila
    for w in _workers:
        w.cancel()
    _workers.clear()
    _pendentes.clear()
    _fila = None


def enfileirar(tid: str) -> int:
    if _fila is None:
        iniciar()
    assert _fila is not None
    _pendentes.append(tid)
    _fila.put_nowait(tid)
    db.atualizar("tentativas", tid, {"status": "na_fila", "etapa": "Aguardando na fila"})
    return len(_pendentes)


def posicao(tid: str) -> int | None:
    return _pendentes.index(tid) + 1 if tid in _pendentes else None


async def esperar_vazia() -> None:
    if _fila is not None:
        await _fila.join()
