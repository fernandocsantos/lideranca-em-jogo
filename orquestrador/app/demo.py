"""LLM de demonstração (determinístico, sem custo). Usado nos testes e com LLM_FALSO=true.

Serve para ensaiar a interface e o fluxo sem chave da Anthropic. Não tem valor pedagógico real.
"""
from __future__ import annotations

import json
import re
import unicodedata

from .llm import LLMFalso


def _tag(texto: str, tag: str) -> str:
    m = re.search(rf"<{tag}>\n?(.*?)\n?</{tag}>", texto, re.S)
    return m.group(1) if m else ""


def _norm(t: str) -> str:
    t = unicodedata.normalize("NFKD", t.lower())
    return "".join(c for c in t if not unicodedata.combining(c))


REGRAS = [  # (palavras na decisão, indicador, intensidade, flag)
    (("assembleia", "consulta", "pesquisa", "ouvir", "escuta", "reuniao com associados"), "engajamento", 2,
     "consulta_aos_associados"),
    (("imprensa", "nota publica", "comunicado", "transparencia", "prestacao de contas"), "reputacao", 2,
     "transparencia_ativa"),
    (("prefeitura", "prefeito", "camara", "vereador", "secretaria"), "capital_politico", 2, None),
    (("convenio", "parceria", "termo de cooperacao", "sebrae", "banco"), "capital_politico", 1,
     "parceria_formalizada"),
    (("conselho", "diretoria", "estatuto"), "coesao", 1, None),
    (("lgpd", "consentimento"), "conformidade", 2, None),
    (("orcamento", "custo", "reserva", "caixa"), "saude_financeira", 1, None),
    (("gratuito", "isencao", "desconto", "subsidio"), "saude_financeira", -2, None),
    (("sem consultar", "imediatamente", "por conta propria"), "coesao", -2, None),
    (("vender os dados", "lista de clientes", "compartilhar cadastro"), "conformidade", -3, "risco_lgpd"),
]


def _sinais(usuario: str) -> dict:
    atores = json.loads(_tag(usuario, "atores") or "[]")
    decisao = _norm(_tag(usuario, "decisao_do_jogador"))
    sinais, flags = [], []
    for palavras, ind, intens, flag in REGRAS:
        if any(p in decisao for p in palavras):
            sinais.append({"indicador": ind, "intensidade": intens, "ator_id": None,
                           "evidencia": f"A decisão menciona {palavras[0]} e os agentes reagiram a isso."})
            if flag:
                flags.append(flag)
    if not sinais:
        sinais.append({"indicador": "engajamento", "intensidade": -1, "ator_id": None,
                       "evidencia": "Associados acharam a decisão vaga."})
    tamanho = len(decisao)
    reacoes = []
    for i, a in enumerate(atores):
        ajuste = 1 if (tamanho > 400 and i % 2 == 0) else (-1 if i % 3 == 0 else 0)
        pf = max(-2, min(2, a["postura_inicial"] + ajuste))
        reacoes.append({"ator_id": a["id"], "postura_final": pf,
                        "reacao": f"{a['nome']} acompanhou a decisão {'com simpatia' if ajuste > 0 else 'com cautela'}.",
                        "citacao": "Vamos ver se isso sai do papel."})
    momentos = [{"ator_id": a["id"], "fala": f"Vi a decisão da diretoria. {('Gostei do que foi priorizado.' if i % 2 == 0 else 'Quero saber quando chega a minha vez.')}"}
                for i, a in enumerate(atores[:4])]
    return {"resumo_narrativo": "Simulação de demonstração: a decisão circulou entre associados, imprensa e "
                                "poder público. Houve apoio de parte da base e cobranças por detalhes de "
                                "execução, custo e prazo. (Texto gerado pelo modo demonstração.)",
            "momentos": momentos, "sinais": sinais, "reacoes": reacoes, "flags": flags}


def _devolutiva(usuario: str) -> dict:
    d = _norm(_tag(usuario, "decisao_do_jogador"))
    def nv(*p): return 3 if any(x in d for x in p) else 2
    comps = [("visao_estrategica", nv("longo prazo", "plano", "meta")),
             ("escuta_representatividade", nv("assembleia", "consulta", "pesquisa", "ouvir")),
             ("negociacao_articulacao", nv("prefeitura", "camara", "parceria", "negociar")),
             ("comunicacao", nv("imprensa", "comunicado", "nota", "whatsapp")),
             ("gestao_recursos", nv("orcamento", "custo", "reserva")),
             ("etica_governanca", nv("estatuto", "conselho", "transparencia", "lgpd")),
             ("gestao_crise", nv("comite", "prazo", "imediat", "monitorar"))]
    return {"competencias": [{"competencia": c, "nivel": n, "evidencia": "Avaliação do modo demonstração."}
                             for c, n in comps],
            "pontos_fortes": ["A decisão tem uma direção clara."],
            "riscos_ignorados": ["Custo e prazo de execução pouco detalhados."],
            "atores_nao_considerados": [],
            "trade_offs": ["Rapidez na resposta × legitimidade de ouvir a base antes."],
            "perguntas_reflexivas": ["Quem perde com essa decisão e como você vai conversar com essas pessoas?",
                                     "Que sinal mostraria, em 30 dias, que você precisa mudar de rota?"]}


def _contingencia(usuario: str) -> dict:
    atores = json.loads(_tag(usuario, "atores") or "[]")
    acoes = []
    for r in range(1, 4):
        for a in atores[:3]:
            acoes.append({"rodada": r, "ator_id": a["id"], "acao": "comenta no grupo de associados",
                          "conteudo": f"Sobre a decisão da diretoria: {a['interesses'][0] if a['interesses'] else 'quero entender melhor'}."})
    return {"acoes": acoes, "relatorio": "Relatório de demonstração: reações mistas, com apoio condicionado a detalhes."}


def _esclarecimento(usuario: str) -> dict:
    d = _tag(usuario, "decisao")
    ja = _tag(usuario, "esclarecimentos_ja_dados")
    if len(d) >= 160 or "(nenhum)" not in ja:
        return {"simulavel": True, "perguntas": []}
    return {"simulavel": False, "perguntas": ["Quem será envolvido diretamente na execução dessa decisão?"]}


def _conversa(msgs, system=""):
    if "Conselheiro sênior" in system:
        m = re.search(r"caso: (.*?) \|", system)
        caso = m.group(1) if m else "escolher pouco e fazer bem feito"
        return (f"Um dirigente da rede conta: \"{caso}\" Antes de decidir, pergunte-se: quem fica de fora e "
                "como você vai explicar a essa pessoa quando chega a vez dela? (resposta do modo demonstração)")
    return ("Olha, do meu ponto de vista, a decisão tem méritos, mas ainda quero ver "
            "como vai funcionar na prática. (resposta do modo demonstração)")


def llm_demo() -> LLMFalso:
    return LLMFalso({
        "moderacao": lambda u: {"permitido": True, "categoria": "ok", "motivo": ""},
        "esclarecimento": _esclarecimento,
        "sinais": _sinais,
        "devolutiva": _devolutiva,
        "contingencia": _contingencia,
        "conversa": _conversa,
    })
