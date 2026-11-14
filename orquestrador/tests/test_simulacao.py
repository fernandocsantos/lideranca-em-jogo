import httpx

from app import cenarios, config, db, mirofish_client, simulacao
from app.mirofish_client import MiroFish

from .mirofish_falso import MiroFishFalso


def _tentativa(cenario_id="cur_01_natal_iluminado", rodadas=10):
    ini = config.jogo()["campanha"]["indicadores_iniciais"]
    t = {"id": db.novo_id("tent"), "campanha_id": "camp_x", "sessao_id": "ses_x", "cenario_id": cenario_id,
         "indice": 0, "decisao": "Vou convocar o conselho em reunião extraordinária, propor cotas menores de "
                                 "patrocínio e levar a campanha aos bairros em parceria com a prefeitura.",
         "esclarecimentos": [], "status": "na_fila", "rodadas": rodadas, "indicadores_antes": ini,
         "criado_em": db.agora(), "atualizado_em": db.agora()}
    db.inserir("tentativas", t)
    return t["id"]


def _mf(falso):
    return MiroFish("http://mf", transport=httpx.MockTransport(falso))


async def test_pipeline_mirofish_completo():
    c = cenarios.obter("cur_01_natal_iluminado")
    falso = MiroFishFalso([a.model_dump() for a in c.atores])
    tid = _tentativa()
    await simulacao.processar(tid, _mf(falso))
    t = db.um("SELECT * FROM tentativas WHERE id=?", (tid,))
    assert t["status"] == "concluida", t["erro"]
    assert t["modo"] == "mirofish" and not t["aviso"]
    assert falso.rodadas_pedidas == 10 + 8  # 8 rodadas noturnas vazias
    assert falso.entity_types_pedidos == ["BusinessOwner", "MediaOutlet"]  # sem Person/Organization
    assert falso.memoria_pedida is False
    assert "## Resumo da decisão" in falso.ultimo_material
    assert "português do Brasil" in falso.ultimo_material
    assert t["mirofish"]["grafo_reutilizado"] is True
    assert len(t["mirofish"]["mapa_agentes"]) == len(c.atores)  # todos os atores casados com agentes
    r = t["resultado"]
    assert set(r["indicadores"]["depois"]) == set(config.INDICADORES)
    assert len(r["reacoes"]) == len(c.atores)
    assert len(t["devolutiva"]["competencias"]) == 7
    assert t["mirofish"]["interacoes"] >= 3 and any("comenta a decisão" in a["texto"] for a in r["acoes"])
    assert {a["autor"] for a in r["acoes"]} <= {a.nome for a in c.atores}
    custo = db.um("SELECT COUNT(*) n FROM uso_tokens WHERE tentativa_id=? AND tarefa='mirofish_simulacao'", (tid,))
    assert custo["n"] == 1


async def test_cache_de_grafo_reutiliza_na_segunda_tentativa():
    c = cenarios.obter("cur_01_natal_iluminado")
    falso = MiroFishFalso([a.model_dump() for a in c.atores])
    await simulacao.processar(_tentativa(), _mf(falso))
    builds_1 = falso.chamadas.count("POST /api/graph/build")
    falso.polls_execucao = 0
    await simulacao.processar(_tentativa(), _mf(falso))
    assert builds_1 == 1 and falso.chamadas.count("POST /api/graph/build") == 1


async def test_reuso_recusado_cai_no_caminho_completo():
    c = cenarios.obter("cur_01_natal_iluminado")
    falso = MiroFishFalso([a.model_dump() for a in c.atores], rejeitar_grafo_alheio=True)
    tid = _tentativa()
    await simulacao.processar(tid, _mf(falso))
    t = db.um("SELECT * FROM tentativas WHERE id=?", (tid,))
    assert t["status"] == "concluida" and t["modo"] == "mirofish"
    assert t["mirofish"]["grafo_reutilizado"] is False


async def test_contingencia_quando_mirofish_fora_do_ar():
    tid = _tentativa()
    await simulacao.processar(tid, _mf(MiroFishFalso(saudavel=False)))
    t = db.um("SELECT * FROM tentativas WHERE id=?", (tid,))
    assert t["status"] == "concluida"
    assert t["modo"] == "contingencia" and "contingência" in t["aviso"]
    assert t["devolutiva"]["perguntas_reflexivas"]


async def test_contingencia_quando_mirofish_falha_no_meio():
    c = cenarios.obter("cur_01_natal_iluminado")
    tid = _tentativa()
    await simulacao.processar(tid, _mf(MiroFishFalso([a.model_dump() for a in c.atores], falhar_em="/start")))
    t = db.um("SELECT * FROM tentativas WHERE id=?", (tid,))
    assert t["status"] == "concluida" and t["modo"] == "contingencia"
    assert "Motivo técnico" in t["aviso"]


async def test_muitos_agentes_reduz_rodadas():
    c = cenarios.obter("cur_01_natal_iluminado")
    muitos = [a.model_dump() for a in c.atores] * 3  # 30 agentes > 15
    falso = MiroFishFalso(muitos)
    tid = _tentativa(rodadas=20)
    await simulacao.processar(tid, _mf(falso))
    assert falso.rodadas_pedidas == 10 + 8  # 20 × 15 / 30, mais as noturnas


def test_casar_perfis_por_nome():
    c = cenarios.obter("cur_05_seguranca_centro")
    perfis = [{"user_id": 7, "name": "Capitão Ronaldo Peixoto", "username": "cap_peixoto"},
              {"user_id": 3, "name": "Cristina Alves", "username": "cris"}]
    m = simulacao.casar_perfis(c, perfis)
    assert m["pm"] == 7 and m["lojista_vitrine"] == 3


async def test_cache_de_simulacao_reaproveita_mesma_alocacao(monkeypatch):
    monkeypatch.setitem(config.jogo()["simulacao"], "cache_simulacoes", True)
    c = cenarios.obter("cur_01_natal_iluminado")
    falso = MiroFishFalso([a.model_dump() for a in c.atores])
    tid1 = _tentativa()
    db.atualizar("tentativas", tid1, {"alocacao": {"decoracao_centro": 70000}})
    await simulacao.processar(tid1, _mf(falso))
    n = len(falso.chamadas)
    tid2 = _tentativa()
    db.atualizar("tentativas", tid2, {"alocacao": {"decoracao_centro": 70000}})
    await simulacao.processar(tid2, _mf(falso))
    t2 = db.um("SELECT * FROM tentativas WHERE id=?", (tid2,))
    assert t2["status"] == "concluida" and "reaproveitadas" in t2["aviso"]
    assert len(falso.chamadas) == n  # nenhuma chamada nova ao MiroFish


async def test_sem_internet_usa_respostas_de_demonstracao(monkeypatch):
    import anthropic
    import httpx as hx
    from app import llm as llm_mod
    from app.modelos import AvaliacaoClareza

    class Quebrado(llm_mod.LLM):
        def __init__(self):
            pass

        async def _chamar(self, *a, **k):
            raise llm_mod.SemConexaoLLM("sem rede")

    r = await Quebrado().estruturado("esclarecimento", "s", "<decisao>\ncurta\n</decisao>\n<esclarecimentos_ja_dados>\n(nenhum)\n</esclarecimentos_ja_dados>",
                                     AvaliacaoClareza, llm_mod.Ctx())
    assert isinstance(r, AvaliacaoClareza)
    t = await Quebrado().texto("conversa", "Conselheiro sênior caso: escolher pouco |", [{"role": "user", "content": "oi"}], llm_mod.Ctx())
    assert "modo demonstração" in t
