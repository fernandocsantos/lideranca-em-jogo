"""P4: nenhum nome aparece sem a função ("Nome (função)") — telas, textos gerados, chat e relatório."""
import re
from pathlib import Path

from fastapi.testclient import TestClient

from app import cenarios, funcoes, relatorio
from app.main import app

from .mirofish_falso import MiroFishFalso
from .test_e2e import _esperar_completo, _instalar_mirofish

FRONT = Path(__file__).resolve().parent.parent / "frontend"
TECNICAS = {"id", "ator_id", "tipo", "nome", "indicador", "probabilidade", "impacto", "papel", "fonte", "autor",
            "rodada", "acoes", "relatorio", "categoria", "status", "modo", "fase", "funcao"}


def _textos(d, chave=""):
    if isinstance(d, str):
        yield chave, d
    elif isinstance(d, list):
        for x in d:
            yield from _textos(x, chave)
    elif isinstance(d, dict):
        for k, v in d.items():
            if k not in TECNICAS:
                yield from _textos(v, k)


def test_com_funcao_na_primeira_mencao():
    c = cenarios.obter("guia_t1_orcamento", "media")
    gente = funcoes.pessoas(c)
    t = funcoes.com_funcao("Otávio aprovou. Depois Otávio saiu. Dona Cida Moraes reclamou e Helena comentou.", gente)
    assert t.startswith("Otávio (presidente da associação) aprovou. Depois Otávio saiu.")
    assert "Dona Cida Moraes (lojista há 30 anos, ex-diretora)" in t and "Helena (ex-diretora de capacitação" in t
    assert funcoes.com_funcao(t, gente) == t  # idempotente
    assert funcoes.com_funcao("Vanessa decidiu.", gente) == "Vanessa (lojista, diretora em 1º mandato) decidiu."
    assert funcoes.sem_funcao("Rafael Tanaka gostou.", gente) == ["Rafael Tanaka"]


def test_nenhum_nome_sem_funcao_no_resultado_chat_e_relatorio():
    with TestClient(app) as cli:
        _instalar_mirofish(MiroFishFalso(saudavel=False))
        s = cli.post("/api/sessoes", json={"apelido": "Vanessa"}).json()
        h = {"X-Sessao": s["token"]}
        camp = cli.post("/api/campanhas", headers=h, json={"perfil": "media"}).json()
        c = cenarios.obter("guia_t1_orcamento", "media")
        gente = funcoes.pessoas(c)
        # o cenário mostrado ao jogador sempre traz a função de cada ator
        assert all(a["funcao"] for a in camp["cenario"]["atores"])
        r = cli.post(f"/api/campanhas/{camp['id']}/tentativas", headers=h, json={
            "decisao": "Prioridade: digitalização e atendimento; ouvimos Rafael Tanaka e Otávio antes de decidir.",
            "alocacao": {"digitalizacao": 12000, "atendimento": 8000}, "escolhas": {"consultou_associados": True}}).json()
        t = _esperar_completo(cli, r["tentativa_id"], h)
        falhas = [(k, txt[:80], funcoes.sem_funcao(txt, gente)) for k, txt in _textos(t["resultado"]) if funcoes.sem_funcao(txt, gente)]
        falhas += [(k, txt[:80], funcoes.sem_funcao(txt, gente)) for k, txt in _textos(t["devolutiva"] or {}) if funcoes.sem_funcao(txt, gente)]
        resp = cli.post(f"/api/tentativas/{t['id']}/conversa", headers=h,
                        json={"interlocutor": "presidente", "mensagem": "O que achou?"}).json()["resposta"]
        falhas += [("conversa", resp[:80], funcoes.sem_funcao(resp, gente))] if funcoes.sem_funcao(resp, gente) else []
        cli.post(f"/api/campanhas/{camp['id']}/avancar", headers=h, json={"tentativa_id": t["id"]})
        rel = cli.get(f"/api/campanhas/{camp['id']}/relatorio", headers=h).json()
        falhas += [(k, txt[:80], funcoes.sem_funcao(txt, gente)) for k, txt in _textos(rel) if funcoes.sem_funcao(txt, gente)]
        assert not falhas, falhas


def test_frontend_so_mostra_pessoas_pelo_componente_ator():
    """Nas telas, ator.nome só pode aparecer dentro de Ator(), nomeFuncao() ou do avatar."""
    permitidos = ("nomeFuncao", "Ator(", "AVATAR.criar", "function Ator", "ator-nome", "nome: ")
    ruins = []
    for arq in ("app.js", "missao.js"):
        for n, linha in enumerate((FRONT / arq).read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"\b(a|r|m|ator\([^)]*\)|m\.a|fala)\??\.nome\b", linha) and not any(p in linha for p in permitidos):
                ruins.append(f"{arq}:{n}: {linha.strip()[:100]}")
    assert not ruins, ruins
