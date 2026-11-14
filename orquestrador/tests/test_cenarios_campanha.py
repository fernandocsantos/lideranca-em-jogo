import re
import unicodedata

from app import campanha, cenarios, config
from app.modelos import Cenario


def _palavras(c: Cenario) -> int:
    a = c.associacao
    tudo = " ".join([a.nome, a.cidade, a.porte, str(a.associados), a.situacao_financeira, c.texto,
                     *c.restricoes, c.em_jogo])
    return len(tudo.split())


def _norm(t):
    t = unicodedata.normalize("NFKD", t.lower())
    return "".join(ch for ch in t if not unicodedata.combining(ch))


def test_biblioteca_curada_tem_10_validos():
    todos = cenarios.todos()
    assert len([c for c in todos if not c.usa_perfil]) >= 10
    for c in todos:
        assert len(c.narrativa.split()) <= 80, (c.id, "narrativa longa")
        assert 2 <= len(c.demandas) <= 4 and sum(d.custo for d in c.demandas) > c.disponivel, c.id
        assert c.regras and 1 <= len(c.tags) <= 3, c.id
        ids = {a.id for a in c.atores}
        assert all(d.solicitante in ids for d in c.demandas), c.id
        assert 3 <= len(c.atores) <= config.jogo()["simulacao"]["max_agentes"]
        assert len({a.id for a in c.atores}) == len(c.atores)
        assert all(1 <= a.influencia <= 5 and -2 <= a.postura_inicial <= 2 for a in c.atores)
    assert {c.dificuldade for c in todos} == {1, 2, 3}
    assert len({c.tema for c in todos}) >= 10


def test_curados_nao_citam_cidades_reais_bloqueadas():
    for c in cenarios.todos():
        texto = _norm(c.model_dump_json())
        for nome in config.nomes_bloqueados():
            assert not re.search(rf"\b{re.escape(_norm(nome))}\b", texto), (c.id, nome)


def test_selecao_dificuldade_crescente_e_variedade():
    for semente in range(20):
        ids = campanha.selecionar(6, semente, [c for c in cenarios.todos() if not c.usa_perfil])
        difs = [cenarios.obter(i).dificuldade for i in ids]
        assert difs == sorted(difs)
        assert difs[0] == 1 and difs[-1] == 3
        temas = [cenarios.obter(i).tema for i in ids]
        assert len(set(temas)) == len(temas)
        assert len(set(ids)) == 6


def test_material_semente_inclui_atores_e_decisao():
    c = cenarios.obter("cur_05_seguranca_centro")
    m = cenarios.material_semente(c, "Vou propor um plano integrado com a PM.")
    assert "FICTÍCIO" in m and "Capitão Ronaldo Peixoto" in m and "plano integrado" in m
    assert "Decisão" not in cenarios.material_semente(c)


def test_nenhuma_pauta_passa_de_80_palavras():
    from app import perfis
    for c in cenarios.todos():
        for p in [x["id"] for x in perfis.listar()] if c.usa_perfil else [None]:
            cc = cenarios.obter(c.id, p)
            # narrativa + evento; relatos da rede e contexto completo ficam em painéis que abrem com um toque
            n = len(cc.narrativa.split()) + (len(cc.evento.texto.split()) if cc.evento else 0) + 10
            assert n <= 80, (cc.id, p, n)


def test_textos_gerados_sao_limitados():
    from app.sinais import limitar_palavras
    assert limitar_palavras("um dois três", 18) == "um dois três"
    assert limitar_palavras(" ".join(["palavra"] * 30), 18).endswith("…")
    assert len(limitar_palavras(" ".join(["palavra"] * 30), 18).split()) == 18
