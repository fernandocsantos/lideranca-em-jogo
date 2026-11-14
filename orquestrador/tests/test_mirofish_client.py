import httpx
import pytest

from app.mirofish_client import ErroMiroFish, MiroFish


async def test_repete_em_erro_5xx_e_depois_funciona():
    n = {"c": 0}

    def h(req):
        n["c"] += 1
        if n["c"] < 3:
            return httpx.Response(503, text="indisponível")
        return httpx.Response(200, json={"success": True, "data": {"simulation_id": "sim_9"}})

    mf = MiroFish("http://mf", transport=httpx.MockTransport(h))
    assert await mf.criar_simulacao("proj", None) == "sim_9"
    assert n["c"] == 3


async def test_erro_de_negocio_nao_repete():
    n = {"c": 0}

    def h(req):
        n["c"] += 1
        return httpx.Response(400, json={"success": False, "error": "projeto não encontrado"})

    mf = MiroFish("http://mf", transport=httpx.MockTransport(h))
    with pytest.raises(ErroMiroFish, match="projeto não encontrado"):
        await mf.construir_grafo("x")
    assert n["c"] == 1


async def test_saude_falsa_quando_sem_conexao():
    def h(req):
        raise httpx.ConnectError("off", request=req)
    assert not await MiroFish("http://mf", transport=httpx.MockTransport(h)).saudavel()


async def test_entrevista_formato_dois_formatos():
    def h(req):
        return httpx.Response(200, json={"success": True, "data": {"result": {"platforms": {
            "reddit": {"response": "Oi!"}}}}})
    assert await MiroFish("http://mf", transport=httpx.MockTransport(h)).entrevistar("s", 1, "?") == "Oi!"


async def test_envia_idioma_portugues():
    vistos = []

    def h(req):
        vistos.append(req.headers.get("accept-language"))
        return httpx.Response(200, json={"success": True, "data": {}})
    await MiroFish("http://mf", transport=httpx.MockTransport(h)).status_execucao("s")
    assert vistos == ["pt"]
