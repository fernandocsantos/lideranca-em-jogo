"""Cliente HTTP da API do MiroFish (backend Flask, porta 5001).

Endpoints documentados em docs/arquitetura.md §3. Todas as respostas seguem
{"success": bool, "data": {...}, "error": "..."}.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from . import config, settings
from .mascaramento import EnvioBloqueado, guarda  # noqa: F401  (bloqueio antes de todo envio)

log = logging.getLogger(__name__)


class ErroMiroFish(RuntimeError):
    pass


_dormir = asyncio.sleep  # substituível nos testes


class MiroFish:
    def __init__(self, url: str | None = None, transport: httpx.AsyncBaseTransport | None = None) -> None:
        cfg = config.jogo()["mirofish"]
        self.url = (url or settings.MIROFISH_URL or cfg["url"]).rstrip("/")
        self.timeout = float(cfg["timeout_chamada_s"])
        self.intervalo = float(cfg["intervalo_polling_s"])
        self.plataforma = cfg.get("plataforma", "reddit")
        self.headers = {"Accept-Language": cfg.get("idioma", "pt")}
        self._transport = transport

    def _cliente(self, timeout: float | None = None) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self.url, timeout=timeout or self.timeout, headers=self.headers,
                                 transport=self._transport)

    async def _req(self, metodo: str, caminho: str, tentativas: int = 3, timeout: float | None = None,
                   **kw: Any) -> dict[str, Any]:
        ultimo: Exception | None = None
        for i in range(tentativas):
            try:
                async with self._cliente(timeout) as c:
                    r = await c.request(metodo, caminho, **kw)
                if r.status_code >= 500:
                    raise ErroMiroFish(f"{caminho}: HTTP {r.status_code}")
                corpo = r.json()
                if not corpo.get("success", False):
                    # Erro de negócio (4xx): não adianta repetir.
                    raise ErroMiroFish(f"{caminho}: {corpo.get('error') or r.status_code}")
                return corpo.get("data") or {}
            except (httpx.TransportError, ErroMiroFish, ValueError) as e:
                ultimo = e
                if isinstance(e, ErroMiroFish) and "HTTP 5" not in str(e):
                    raise
                espera = 2 ** i
                log.warning("MiroFish %s falhou (%s); nova tentativa em %ss", caminho, e, espera)
                await _dormir(espera)
        raise ErroMiroFish(f"MiroFish indisponível em {caminho}: {ultimo}")

    # ------------------------------------------------------------------ saúde
    async def saudavel(self) -> bool:
        try:
            async with self._cliente(5) as c:
                r = await c.get("/api/graph/project/list")
            return r.status_code < 500
        except httpx.HTTPError:
            return False

    # ------------------------------------------------------------------ grafo
    async def gerar_ontologia(self, material_md: str, requisito: str, nome: str) -> dict[str, Any]:
        guarda(material_md + "\n" + requisito, "MiroFish")
        arquivos = {"files": ("cenario.md", material_md.encode("utf-8"), "text/markdown")}
        dados = {"simulation_requirement": requisito, "project_name": nome,
                 "additional_context": "Cenário fictício de treinamento em português do Brasil."}
        return await self._req("POST", "/api/graph/ontology/generate", files=arquivos, data=dados, timeout=300)

    async def construir_grafo(self, project_id: str) -> str:
        d = await self._req("POST", "/api/graph/build",
                            json={"project_id": project_id, "chunk_size": 800, "chunk_overlap": 80})
        return d["task_id"]

    async def tarefa(self, task_id: str) -> dict[str, Any]:
        return await self._req("GET", f"/api/graph/task/{task_id}")

    # -------------------------------------------------------------- simulação
    async def criar_simulacao(self, project_id: str, graph_id: str | None) -> str:
        corpo: dict[str, Any] = {"project_id": project_id, "enable_twitter": self.plataforma == "twitter",
                                 "enable_reddit": self.plataforma == "reddit"}
        if graph_id:
            corpo["graph_id"] = graph_id
        d = await self._req("POST", "/api/simulation/create", json=corpo)
        return d["simulation_id"]

    async def preparar(self, simulation_id: str, entity_types: list[str] | None = None) -> dict[str, Any]:
        corpo: dict[str, Any] = {"simulation_id": simulation_id, "use_llm_for_profiles": True,
                                 "parallel_profile_count": 3}
        if entity_types:
            corpo["entity_types"] = entity_types
        return await self._req("POST", "/api/simulation/prepare", json=corpo)

    async def status_preparo(self, simulation_id: str, task_id: str | None) -> dict[str, Any]:
        return await self._req("POST", "/api/simulation/prepare/status",
                               json={"simulation_id": simulation_id, "task_id": task_id})

    async def perfis(self, simulation_id: str) -> list[dict[str, Any]]:
        d = await self._req("GET", f"/api/simulation/{simulation_id}/profiles",
                            params={"platform": self.plataforma})
        return d.get("profiles", [])

    async def entidades(self, graph_id: str) -> dict[str, Any]:
        return await self._req("GET", f"/api/simulation/entities/{graph_id}")

    async def iniciar(self, simulation_id: str, max_rodadas: int) -> dict[str, Any]:
        # A gravação da memória no Zep durante a simulação travou o OASIS no teste real (14/11/2026);
        # fica desligada por padrão (jogo.yaml -> mirofish.memoria_no_grafo).
        memoria = bool(config.jogo()["mirofish"].get("memoria_no_grafo", False))
        return await self._req("POST", "/api/simulation/start", json={
            "simulation_id": simulation_id, "platform": self.plataforma, "max_rounds": max_rodadas,
            "enable_graph_memory_update": memoria})

    async def status_execucao(self, simulation_id: str) -> dict[str, Any]:
        return await self._req("GET", f"/api/simulation/{simulation_id}/run-status")

    async def acoes(self, simulation_id: str, limite: int = 20, offset: int = 0) -> list[dict[str, Any]]:
        d = await self._req("GET", f"/api/simulation/{simulation_id}/actions",
                            params={"limit": limite, "offset": offset, "platform": self.plataforma})
        return d.get("actions", [])

    async def atividade(self, simulation_id: str, limite: int = 1000) -> list[dict[str, Any]]:
        """Posts + comentários gravados no banco da simulação, em ordem de criação."""
        p = await self._req("GET", f"/api/simulation/{simulation_id}/posts",
                            params={"limit": limite, "platform": self.plataforma})
        c = await self._req("GET", f"/api/simulation/{simulation_id}/comments",
                            params={"limit": limite, "platform": self.plataforma})
        itens = list(p.get("posts", [])) + list(c.get("comments", []))
        return sorted(itens, key=lambda i: str(i.get("created_at", "")))

    # --------------------------------------------------------------- relatório
    async def gerar_relatorio(self, simulation_id: str) -> dict[str, Any]:
        return await self._req("POST", "/api/report/generate", json={"simulation_id": simulation_id})

    async def status_relatorio(self, simulation_id: str, task_id: str | None) -> dict[str, Any]:
        return await self._req("POST", "/api/report/generate/status",
                               json={"simulation_id": simulation_id, "task_id": task_id})

    async def relatorio(self, simulation_id: str) -> dict[str, Any]:
        return await self._req("GET", f"/api/report/by-simulation/{simulation_id}")

    # ---------------------------------------------------------------- conversa
    async def ambiente_vivo(self, simulation_id: str) -> bool:
        try:
            d = await self._req("POST", "/api/simulation/env-status", json={"simulation_id": simulation_id},
                                tentativas=1)
        except ErroMiroFish:
            return False
        return bool(d.get("env_alive") or d.get("alive") or d.get("status") == "alive")

    async def entrevistar(self, simulation_id: str, agent_id: int, pergunta: str) -> str:
        guarda(pergunta, "MiroFish")
        d = await self._req("POST", "/api/simulation/interview", timeout=90, tentativas=1, json={
            "simulation_id": simulation_id, "agent_id": agent_id, "prompt": pergunta,
            "platform": self.plataforma, "timeout": 60})
        res = d.get("result", {})
        if "response" in res:
            return res["response"]
        plat = res.get("platforms", {}).get(self.plataforma, {})
        return plat.get("response", "")

    async def conversar_relatorio(self, simulation_id: str, mensagem: str, historico: list[dict]) -> str:
        guarda(mensagem + " ".join(h.get("content", "") for h in historico), "MiroFish")
        d = await self._req("POST", "/api/report/chat", timeout=180, tentativas=1, json={
            "simulation_id": simulation_id, "message": mensagem, "chat_history": historico})
        return d.get("response", "")

    async def fechar_ambiente(self, simulation_id: str) -> None:
        try:
            await self._req("POST", "/api/simulation/close-env", json={"simulation_id": simulation_id},
                            tentativas=1)
        except ErroMiroFish:
            pass

    # ------------------------------------------------------------------ util
    async def aguardar(self, consultar, pronto, falhou, prazo_s: float, ao_progredir=None) -> dict[str, Any]:
        """Polling genérico até `pronto(d)` ou `falhou(d)`, respeitando o prazo."""
        fim = asyncio.get_event_loop().time() + prazo_s
        while True:
            d = await consultar()
            if ao_progredir:
                await ao_progredir(d)
            if falhou(d):
                raise ErroMiroFish(d.get("error") or d.get("message") or "tarefa falhou")
            if pronto(d):
                return d
            if asyncio.get_event_loop().time() > fim:
                raise ErroMiroFish("tempo esgotado aguardando o MiroFish")
            await _dormir(self.intervalo)


_fabrica = None


def novo() -> MiroFish:
    """Ponto único de criação (os testes trocam por um MiroFish simulado)."""
    return _fabrica() if _fabrica else MiroFish()


def definir_fabrica(f) -> None:
    global _fabrica
    _fabrica = f
