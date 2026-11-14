"""Fatos de trimestre gerados de notícias (aprovados pelo facilitador antes de entrar no jogo)."""
from __future__ import annotations

import json
from pathlib import Path

from . import settings


def _dir() -> Path:
    d = Path(settings.CENARIOS_DIR) / "fatos"
    d.mkdir(parents=True, exist_ok=True)
    return d


def todos(incluir_pendentes: bool = False) -> list[dict]:
    out = []
    for p in sorted(_dir().glob("*.json")):
        f = json.loads(p.read_text(encoding="utf-8"))
        if f.get("status") == "aprovado" or (incluir_pendentes and f.get("status") == "pendente_revisao"):
            out.append(f)
    out.sort(key=lambda f: f.get("fonte", {}).get("data", ""), reverse=True)
    return out


def salvar(f: dict) -> None:
    (_dir() / f"{f['id']}.json").write_text(json.dumps(f, ensure_ascii=False, indent=2), encoding="utf-8")


def definir_status(fid: str, status: str) -> dict:
    p = _dir() / f"{fid}.json"
    if not p.exists():
        raise KeyError(fid)
    f = json.loads(p.read_text(encoding="utf-8"))
    f["status"] = status
    salvar(f)
    return f


def para_trimestre(indice: int) -> dict | None:
    """Fato aprovado mais recente para o trimestre de índice `indice` (0, 1, ...), se houver."""
    aprovados = todos()
    return aprovados[indice] if indice < len(aprovados) else None


def publico(f: dict) -> dict:
    """O jogador vê o fato ficcional, o veículo, a data, o link e o recorte — não o título original."""
    fonte = f.get("fonte", {})
    return {"id": f["id"], "titulo": f["titulo"], "texto": f["texto"], "recorte": f.get("recorte", ""),
            "delta_orcamento": f.get("delta_orcamento", 0),
            "fonte": {"veiculo": fonte.get("veiculo"), "data": fonte.get("data"), "url": fonte.get("url")}}
