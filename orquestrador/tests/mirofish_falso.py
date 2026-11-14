"""Servidor MiroFish simulado (httpx.MockTransport) que imita os endpoints usados pelo orquestrador."""
from __future__ import annotations

import json
import re

import httpx


class MiroFishFalso:
    def __init__(self, atores: list[dict] | None = None, saudavel: bool = True, falhar_em: str | None = None,
                 rejeitar_grafo_alheio: bool = False):
        self.atores = atores or []
        self.saudavel = saudavel
        self.falhar_em = falhar_em
        self.rejeitar_grafo_alheio = rejeitar_grafo_alheio
        self.chamadas: list[str] = []
        self.n = 0
        self.polls_execucao = 0
        self.ultimo_material = ""
        self.rodadas_pedidas = None
        self.entity_types_pedidos = "nao_chamado"
        self.memoria_pedida = None

    def _ok(self, data):
        return httpx.Response(200, json={"success": True, "data": data})

    def __call__(self, req: httpx.Request) -> httpx.Response:
        caminho = req.url.path
        self.chamadas.append(f"{req.method} {caminho}")
        if not self.saudavel:
            raise httpx.ConnectError("recusado", request=req)
        if self.falhar_em and self.falhar_em in caminho:
            return httpx.Response(500, json={"success": False, "error": "falha simulada"})
        corpo = {}
        if req.headers.get("content-type", "").startswith("application/json"):
            corpo = json.loads(req.content or b"{}")
        self.n += 1
        if caminho == "/api/graph/project/list":
            return self._ok({"projects": []})
        if caminho == "/api/graph/ontology/generate":
            self.ultimo_material = req.content.decode("utf-8", "ignore")
            return self._ok({"project_id": f"proj_{self.n}", "ontology": {}})
        if caminho == "/api/graph/build":
            return self._ok({"task_id": f"task_{self.n}"})
        if caminho.startswith("/api/graph/task/"):
            return self._ok({"status": "completed", "progress": 100, "result": {"graph_id": "mirofish_g1"}})
        if caminho == "/api/simulation/create":
            if self.rejeitar_grafo_alheio and corpo.get("graph_id"):
                return httpx.Response(400, json={"success": False, "error": "graph mismatch"})
            return self._ok({"simulation_id": "sim_1", "status": "created"})
        if caminho.startswith("/api/simulation/entities/"):
            return self._ok({"entity_types": ["BusinessOwner", "MediaOutlet", "Organization", "Person"],
                             "entities": []})
        if caminho == "/api/simulation/prepare":
            self.entity_types_pedidos = corpo.get("entity_types")
            return self._ok({"task_id": "task_prep", "status": "preparing"})
        if caminho == "/api/simulation/prepare/status":
            return self._ok({"status": "completed", "progress": 100})
        if re.match(r"/api/simulation/[^/]+/profiles", caminho):
            perfis = [{"user_id": i, "username": a["nome"].lower().replace(" ", "_"), "name": a["nome"],
                       "bio": a["papel"]} for i, a in enumerate(self.atores)]
            return self._ok({"count": len(perfis), "profiles": perfis})
        if caminho == "/api/simulation/start":
            self.rodadas_pedidas = corpo.get("max_rounds")
            self.memoria_pedida = corpo.get("enable_graph_memory_update")
            return self._ok({"runner_status": "running"})
        if re.match(r"/api/simulation/[^/]+/run-status", caminho):
            self.polls_execucao += 1
            st = "running"  # como o MiroFish real: não marca "completed" ao entrar em espera
            return self._ok({"runner_status": st, "current_round": self.rodadas_pedidas if st == "completed" else 1,
                             "total_rounds": self.rodadas_pedidas})
        if re.match(r"/api/simulation/[^/]+/posts", caminho):
            posts = [{"post_id": i + 1, "user_id": i, "content": f"Post inicial de {a['nome']}",
                      "created_at": f"2026-11-14 10:00:0{i}"} for i, a in enumerate(self.atores[:2])]
            return self._ok({"count": len(posts), "total": len(posts), "posts": posts})
        if re.match(r"/api/simulation/[^/]+/comments", caminho):
            n = 0 if self.rodadas_pedidas is None else min(4, self.polls_execucao * 2)
            coms = [{"comment_id": i + 1, "post_id": 1, "user_id": i % max(1, len(self.atores)),
                     "content": f"{self.atores[i % len(self.atores)]['nome']} comenta a decisão da diretoria.",
                     "created_at": f"2026-11-14 11:00:{i:02d}"} for i in range(n)] if self.atores else []
            return self._ok({"count": len(coms), "comments": coms})
        if re.match(r"/api/simulation/[^/]+/actions", caminho):
            acoes = [{"round_num": 1, "agent_id": i, "agent_name": a["nome"], "action_type": "CREATE_POST",
                      "action_args": {"content": f"{a['nome']} comenta a decisão da diretoria."}}
                     for i, a in enumerate(self.atores[:4])]
            return self._ok({"count": len(acoes), "actions": acoes})
        if caminho == "/api/report/generate":
            return self._ok({"task_id": "task_rep", "status": "generating"})
        if caminho == "/api/report/generate/status":
            return self._ok({"status": "completed", "progress": 100})
        if caminho.startswith("/api/report/by-simulation/"):
            return self._ok({"report_id": "report_1", "markdown_content": "# Relatório\nAs reações foram mistas."})
        if caminho == "/api/simulation/env-status":
            # vivo só depois que as rodadas terminam (modo "aguardando comandos")
            return self._ok({"env_alive": self.polls_execucao >= 2 or self.rodadas_pedidas is None})
        if caminho == "/api/simulation/interview":
            self.ultima_pergunta = corpo["prompt"]
            return self._ok({"agent_id": corpo["agent_id"], "result": {"response": "Votei contra porque faltou diálogo.",
                                                                        "platform": "reddit"}})
        if caminho == "/api/report/chat":
            return self._ok({"response": "O relatório mostra apoio da base e resistência do conselho."})
        if caminho == "/api/simulation/close-env":
            return self._ok({})
        return httpx.Response(404, json={"success": False, "error": f"rota desconhecida {caminho}"})
