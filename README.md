# Liderança em Jogo

Jogo sério (*serious game*) em português do Brasil para a formação de lideranças de **associações comerciais (ACs/ACIs)** — presidentes, diretores, conselheiros e gestores executivos — com foco nas ACIs do interior de São Paulo.

Você assume a presidência de uma associação fictícia, lê um cenário inspirado em problemas reais do comércio, escreve sua decisão em texto livre e vê como associados, diretoria, prefeitura, imprensa, sindicatos e parceiros reagem. As reações são simuladas por agentes de IA no [MiroFish](https://github.com/666ghj/MiroFish). Depois você conversa com os agentes, recebe uma devolutiva pela rubrica de competências e decide se refaz a decisão ou avança na campanha.

> Protótipo para uso local. Licença **AGPL-3.0**, a mesma do MiroFish (veja [LICENSE](LICENSE)). Se você oferecer o jogo como serviço em rede, precisa disponibilizar o código-fonte, incluindo as suas modificações.

## Conteúdo

| Pasta/arquivo | O que é |
|---|---|
| [docs/arquitetura.md](docs/arquitetura.md) | Arquitetura, endpoints do MiroFish usados em cada etapa, regras de conversão, robustez e custo |
| [docker-compose.yml](docker-compose.yml) | Orquestrador + MiroFish + proxy LLM (LiteLLM) |
| `orquestrador/app/` | Backend em Python/FastAPI: cenários, sessões, fila, integração com o MiroFish, contingência, indicadores, devolutiva, custos |
| `orquestrador/frontend/` | SPA sem etapa de build (HTML/CSS/JS), toda em pt-BR, acessível (WCAG AA) |
| `orquestrador/config/` | **Arquivos editáveis**: `rubrica.yaml`, `indicadores.yaml`, `jogo.yaml`, `llm.yaml`, `fontes.yaml`, `moderacao.yaml`, `nomes_reais_bloqueados.txt` |
| `orquestrador/cenarios/curados/` | 10 cenários fictícios revisados (uso offline e caso a coleta de notícias falhe) |
| `orquestrador/cenarios/gerados/` | Cenários gerados de notícias (aguardam aprovação do facilitador) |
| `orquestrador/app/news/pipeline.py` | Pipeline notícias → cenários fictícios |
| `orquestrador/tests/` | Testes automatizados (unitários + ponta a ponta) |

## Instalação (Docker, recomendado)

Pré-requisitos: Docker com Compose, uma chave da **Anthropic** e uma chave do **Zep Cloud** (o plano gratuito atende o protótipo; o MiroFish usa o Zep para o grafo e a memória dos agentes).

```bash
cp .env.example .env
```

Edite o `.env` e preencha `ANTHROPIC_API_KEY`, `ZEP_API_KEY`, `FACILITADOR_CODIGO` e `LITELLM_MASTER_KEY` (veja abaixo como gerar). Depois:

```bash
docker compose up -d --build
```

Abra http://localhost:8000. O painel do facilitador fica em http://localhost:8000/facilitador.

* O MiroFish **não** fica exposto fora da rede do Compose: só o orquestrador fala com ele. A interface própria do MiroFish não é usada.
* As chaves ficam só no servidor. O navegador nunca as recebe.
* Os arquivos de `orquestrador/config/` são montados no container: edite e reinicie (`docker compose restart orquestrador`), sem precisar reconstruir a imagem.

### Por que há um proxy LLM (LiteLLM)

O MiroFish usa o SDK da OpenAI. No teste real, o endpoint compatível da Anthropic recusou o pedido de JSON do MiroFish (`response_format: json_object`), e nenhuma chamada dele funcionou. Por isso o Compose sobe um proxy LiteLLM (`llm-proxy`) entre o MiroFish e a Anthropic: ele traduz o pedido de JSON e descarta parâmetros que os modelos Claude recusam. O proxy também desliga o raciocínio adaptativo do Haiku 5.5, porque o MiroFish fixa `max_tokens=4096` e o raciocínio consumia parte desse limite, cortando as respostas em JSON. O MiroFish só conhece a chave interna `LITELLM_MASTER_KEY`, nunca a chave da Anthropic. Gere essa chave interna com:

```bash
echo "LITELLM_MASTER_KEY=sk-$(openssl rand -hex 32)" >> .env
```

Enquanto o MiroFish não funcionar, o jogo continua no **modo de contingência**, sempre com aviso ao jogador.

## Modo demonstração (sem chaves, sem custo)

Para ensaiar a interface e o fluxo, sem chamar a Anthropic nem o MiroFish (as respostas são fixas e não têm valor pedagógico):

```bash
cd orquestrador && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

```bash
cd orquestrador && LLM_FALSO=true MIROFISH_DESATIVADO=true FACILITADOR_CODIGO=demo .venv/bin/uvicorn app.main:app --port 8000
```

## Desenvolvimento sem Docker

Com o MiroFish rodando em outro lugar:

```bash
cd orquestrador && ANTHROPIC_API_KEY=... MIROFISH_URL=http://localhost:5001 FACILITADOR_CODIGO=... .venv/bin/uvicorn app.main:app --reload
```

## Configuração (o que dá para mudar sem programar)

| Arquivo | Para quê |
|---|---|
| `jogo.yaml` | nº de cenários por campanha (5–8), indicadores iniciais, limites de caracteres, rodadas (padrão 12, teto 20), agentes (≤ 15), simulações por jogador/dia, mensagens de conversa, orçamento mensal (R$ 100), timeouts e cache do MiroFish |
| `indicadores.yaml` | **Regras de conversão** sinais → indicadores: pesos por intensidade, multiplicador por influência do ator, efeito da mudança de postura por tipo de ator, penalidades/bônus por *flag*, limite por rodada e elasticidade |
| `rubrica.yaml` | Rubrica de 7 competências × 4 níveis e regras da devolutiva |
| `llm.yaml` | Modelo e esforço por tarefa, preços por milhão de tokens, câmbio, parâmetros da estimativa de custo do MiroFish |
| `fontes.yaml` | Feeds RSS, janela de recência (90 dias) e palavras-chave por tema |
| `moderacao.yaml` | Termos bloqueados e padrões de manipulação dos agentes |
| `nomes_reais_bloqueados.txt` | Nomes que nunca podem aparecer em cenários gerados |

### Como os indicadores são calculados

O LLM **só extrai sinais** da simulação (indicador, intensidade de −3 a +3, evidência, ator), a postura final de cada ator e *flags* de uma lista fechada. A conta é feita em código, em `app/indicadores.py`, com as regras de `indicadores.yaml`. É determinística (mesma entrada ⇒ mesmo resultado) e auditável: a tela de resultado mostra a tabela "Como calculamos", com cada parcela.

## Notícias → cenários

No painel do facilitador, clique em **"Gerar cenários a partir de notícias recentes"**. Ou rode pela linha de comando:

```bash
docker compose exec orquestrador python -m app.news.pipeline
```

As etapas são: coletar (RSS) → filtrar (últimos 90 dias e temas do comércio) → ficcionalizar (Claude Opus 5.5, com saída estruturada) → validar (em código: nenhum nome próprio da notícia nem da lista de bloqueados pode aparecer) → salvar como **pendente de revisão**. O cenário só entra nas campanhas depois que o facilitador o aprova. A fonte original aparece como "Inspirado em". O texto da notícia é tratado como dado não confiável, e tentativas de *prompt injection* são ignoradas (há teste cobrindo isso).

## Testes

```bash
cd orquestrador && .venv/bin/python -m pytest -q
```

São 37 testes: conversão de indicadores, moderação, seleção de campanha, validade dos 10 cenários curados, pipeline de notícias (incluindo vazamento de nome real e injeção), cliente do MiroFish (novas tentativas e erros) e pipeline de simulação (cache de grafo, reuso recusado, MiroFish fora do ar, falha no meio, excesso de agentes). Inclui dois testes **ponta a ponta** pela API HTTP: um ciclo completo com um MiroFish simulado (cenário → esclarecimento → simulação → resultado → conversa → refazer/comparar → avançar → painel → apagar dados) e um ciclo inteiro em contingência. Nos testes, o MiroFish e o LLM são substituídos por versões simuladas; nada é cobrado.

## Estimativa de custo por partida

Modelos usados (decisão "misto"): **Claude Haiku 5.5** para os agentes do MiroFish (alto volume), para a moderação, os esclarecimentos e a conversa; **Claude Opus 5.5** para a extração de sinais, a devolutiva, a ficcionalização e a contingência. Preços em `llm.yaml` (Opus US$ 4/20 e Haiku US$ 0,10/0,50 por milhão de tokens de entrada/saída), câmbio de R$ 5,50.

| Item (por tentativa) | US$ | R$ |
|---|---|---|
| MiroFish: 12 agentes × 12 rodadas (estimativa) | 0,07 | 0,36 |
| MiroFish: 15 agentes × 20 rodadas (teto) | 0,12 | 0,64 |
| Extração de sinais (Opus) | 0,14 | 0,76 |
| Devolutiva (Opus) | 0,09 | 0,52 |
| Moderação + esclarecimento + ~6 mensagens de conversa (Haiku) | < 0,01 | 0,02 |
| **Tentativa com MiroFish (padrão)** | **≈ 0,30** | **≈ 1,65** |
| Tentativa em contingência (Opus simula) | ≈ 0,40 | ≈ 2,20 |
| Cenário gerado de notícia (Opus) | ≈ 0,11 | ≈ 0,60 |

**Medido no teste real:** tentativa com MiroFish (6 rodadas) **R$ 1,34**; contingência R$ 1,30 a 1,70. Extração de sinais US$ 0,14, devolutiva US$ 0,06 a 0,08, contingência US$ 0,08 a 0,10 (menos que o estimado acima).

**Partida (campanha de 6 cenários, ~1,5 tentativa por cenário) ≈ US$ 2,70 ≈ R$ 15.** Com o orçamento de **R$ 100/mês**, dá para jogar cerca de **6 campanhas completas (~60 simulações)** por mês. O orquestrador bloqueia novas simulações quando o gasto do mês chega ao orçamento.

Atenção: o MiroFish não informa quantos tokens consome. A linha "MiroFish" é uma estimativa (`llm.yaml → mirofish_estimativa`), e o consumo real pode ser 2 a 3 vezes maior. Depois das primeiras partidas reais, compare com o painel da Anthropic e ajuste `tokens_entrada_por_acao`. O consumo das chamadas do próprio orquestrador é medido de verdade, a partir do `usage` de cada resposta.

## Tempo de um ciclo (medido em 14/11/2026, com chaves reais)

| Modo | Tempo medido |
|---|---|
| MiroFish, cenário com grafo em cache, 6 rodadas (43 interações dos agentes) | **8,8 min**: personas ~1,5 min · simulação ~2 min + 90 s de confirmação · relatório ~4 min · sinais e devolutiva ~1 min |
| MiroFish, primeira vez no cenário | +2 min (grafo no Zep) |
| Contingência (MiroFish fora do ar) | 2 a 3,5 min |
| Conversa com agente (entrevista no MiroFish) / com o relatório | 3 a 6 s por mensagem |

Sugestão para o critério de aceite: **X = 15 minutos** com o MiroFish (12 rodadas e primeira vez no cenário ficam por volta de 12 min) e **5 minutos** em contingência. Se o MiroFish passar de 25 min, o jogo cai automaticamente na contingência.

## Privacidade (LGPD)

Não há login: o jogador usa um apelido, e a sessão é um token aleatório guardado no navegador. Não coletamos nome, e-mail nem IP. As decisões ficam no SQLite local, e o botão **"Apagar meus dados"** remove tudo. As entradas passam por moderação (regras locais + Haiku), que barra conteúdo ofensivo, dados pessoais (CPF, e-mail, telefone) e tentativas de manipular os agentes. Os cenários são ficcionais, e os agentes não representam pessoas reais.

## Fora do escopo desta versão

Login e turmas, multijogador em tempo real, aplicativo nativo e integração com sistemas das associações. O painel do facilitador é simples, sem login: protegido por código, ele lista partidas, aprova cenários, compara decisões para o mesmo cenário, exporta CSV e imprime/salva em PDF pelo navegador.
