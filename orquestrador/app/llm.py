"""Camada de acesso à Anthropic (SDK oficial) com registro de tokens e custo por partida."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable, TypeVar

import anthropic
from pydantic import BaseModel

from . import config, custos

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)


@dataclass
class Ctx:
    sessao_id: str | None = None
    campanha_id: str | None = None
    tentativa_id: str | None = None


class ErroLLM(RuntimeError):
    """Falha ao obter resposta utilizável do LLM."""


class RecusaLLM(ErroLLM):
    """O modelo recusou o pedido por política de segurança."""


class LLM:
    """Cliente real. Usa structured outputs (messages.parse) e fallback do servidor quando suportado."""

    def __init__(self) -> None:
        # Credenciais resolvidas do ambiente (ANTHROPIC_API_KEY) — nunca chegam ao navegador.
        self.cliente = anthropic.AsyncAnthropic(max_retries=3, timeout=180.0)

    def _params(self, tarefa: str) -> tuple[str, dict[str, Any], bool]:
        cfg = config.llm()
        t = cfg["tarefas"][tarefa]
        fb = cfg.get("fallback_servidor", {})
        usa_fb = bool(fb.get("ativo")) and t["modelo"] in fb.get("modelos_suportados", [])
        return t["modelo"], {"max_tokens": t.get("max_tokens", 8000), "effort": t.get("esforco", "medium")}, usa_fb

    async def _chamar(self, tarefa: str, system: str, messages: list[dict], ctx: Ctx,
                      saida: type[BaseModel] | None):
        modelo, p, usa_fb = self._params(tarefa)
        kwargs: dict[str, Any] = dict(
            model=modelo,
            max_tokens=p["max_tokens"],
            system=system,
            messages=messages,
            output_config={"effort": p["effort"]},
        )
        try:
            if usa_fb:
                api = self.cliente.beta.messages
                kwargs.update(betas=["server-side-fallback-2026-07-01"], fallbacks="default")
            else:
                api = self.cliente.messages
            if saida is not None:
                resp = await api.parse(output_format=saida, **kwargs)
            else:
                resp = await api.create(**kwargs)
        except anthropic.BadRequestError as e:
            raise ErroLLM(f"Requisição inválida ao LLM: {e.message}") from e
        except anthropic.AuthenticationError as e:
            raise ErroLLM("Chave da Anthropic inválida ou ausente (ANTHROPIC_API_KEY).") from e
        except anthropic.RateLimitError as e:
            raise ErroLLM("Limite de uso da Anthropic atingido; tente em instantes.") from e
        except anthropic.APIStatusError as e:
            raise ErroLLM(f"Erro do serviço de LLM ({e.status_code}).") from e
        except anthropic.APIConnectionError as e:
            raise ErroLLM("Sem conexão com a Anthropic.") from e

        u = resp.usage
        custos.registrar(ctx, tarefa, getattr(resp, "model", modelo), u.input_tokens or 0, u.output_tokens or 0,
                         getattr(u, "cache_read_input_tokens", 0) or 0)
        if resp.stop_reason == "refusal":
            raise RecusaLLM("O modelo recusou o pedido.")
        if resp.stop_reason == "max_tokens":
            raise ErroLLM("Resposta do LLM truncada (max_tokens).")
        return resp

    async def estruturado(self, tarefa: str, system: str, usuario: str, saida: type[T], ctx: Ctx) -> T:
        resp = await self._chamar(tarefa, system, [{"role": "user", "content": usuario}], ctx, saida)
        out = getattr(resp, "parsed_output", None)
        if out is None:
            raise ErroLLM("O LLM não devolveu JSON válido no formato esperado.")
        return out

    async def texto(self, tarefa: str, system: str, messages: list[dict], ctx: Ctx) -> str:
        resp = await self._chamar(tarefa, system, messages, ctx, None)
        return "".join(b.text for b in resp.content if b.type == "text").strip()


class LLMFalso:
    """Substituto determinístico para testes e para rodar sem chave (LLM_FALSO=true)."""

    def __init__(self, respostas: dict[str, Callable[..., Any]] | None = None) -> None:
        self.respostas = respostas or {}
        self.chamadas: list[tuple[str, str]] = []

    async def estruturado(self, tarefa, system, usuario, saida, ctx):
        self.chamadas.append((tarefa, usuario))
        custos.registrar(ctx, tarefa, "falso", 100, 50, 0)
        if tarefa not in self.respostas:
            raise ErroLLM(f"LLMFalso sem resposta para '{tarefa}'")
        r = self.respostas[tarefa](usuario)
        return r if isinstance(r, BaseModel) else saida.model_validate(r)

    async def texto(self, tarefa, system, messages, ctx):
        self.chamadas.append((tarefa, messages[-1]["content"]))
        custos.registrar(ctx, tarefa, "falso", 100, 50, 0)
        f = self.respostas.get(tarefa)
        return f(messages) if f else "Resposta simulada."


_instancia: Any = None


def obter() -> Any:
    global _instancia
    if _instancia is None:
        import os
        if os.environ.get("LLM_FALSO", "false").lower() == "true":
            from .demo import llm_demo
            _instancia = llm_demo()
        else:
            _instancia = LLM()
    return _instancia


def definir(instancia: Any) -> None:
    global _instancia
    _instancia = instancia
