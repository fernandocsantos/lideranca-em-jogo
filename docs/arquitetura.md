# Arquitetura e integração com o MiroFish

**Projeto:** Liderança em Jogo — jogo sério para lideranças de associações comerciais (protótipo)
**Público prioritário:** ACIs do interior de São Paulo · **Hospedagem:** local · **LLM:** Anthropic (Claude)
**Licença:** AGPL-3.0 (mesma do MiroFish)

## 1. Visão geral

```
┌──────────────┐  HTTP/JSON   ┌──────────────────────────────┐  HTTP/JSON  ┌──────────────────┐
│  Navegador   │ ───────────▶ │  Orquestrador (FastAPI)      │ ──────────▶ │  MiroFish        │
│  SPA pt-BR   │ ◀─────────── │  porta 8000                  │ ◀────────── │  backend :5001   │
│  (sem chaves)│   polling    │  · cenários e campanha       │             │  (Docker)        │
└──────────────┘              │  · moderação / esclarecimento│             └────────┬─────────┘
                              │  · fila de simulações        │                      │
                              │  · extração de sinais (LLM)  │          Zep Cloud (grafo/memória)
                              │  · conversão determinística  │          Anthropic (agentes OASIS,
                              │    → indicadores             │           via endpoint compatível
                              │  · devolutiva (rubrica)      │           com OpenAI)
                              │  · contingência (LLM direto) │
                              │  · custos e limites          │
                              │  SQLite  ·  config/*.yaml    │──────────▶ Anthropic API (SDK oficial)
                              └──────────────────────────────┘
```

* O **frontend** é uma SPA sem etapa de build (HTML + JS + CSS), servida pelo próprio orquestrador. Não usa a interface do MiroFish.
* O **orquestrador** é o único componente que fala com o MiroFish e com a Anthropic. Chaves ficam no `.env` do servidor.
* O **MiroFish** roda como serviço separado (imagem oficial `ghcr.io/666ghj/mirofish`), sem portas expostas ao público — só a rede interna do Compose.

### Modelos (decisão do projeto: "misto")

| Uso | Modelo | Motivo |
|---|---|---|
| Agentes do MiroFish (OASIS, perfis, relatório) | `claude-haiku-5-5` | Alto volume de chamadas; cabe no orçamento de R$ 100/mês |
| Extração de sinais, devolutiva pedagógica, ficcionalização de notícias, simulação de contingência | `claude-opus-5-5` | Poucas chamadas, exigem julgamento |
| Moderação, perguntas de esclarecimento, conversa com agentes (contingência) | `claude-haiku-5-5` | Classificação simples / respostas curtas |

Tudo em `orquestrador/config/llm.yaml`.

## 2. Ciclo de jogo e componentes

| Etapa | O que acontece | Módulo |
|---|---|---|
| 1. Cenário | Campanha escolhe o próximo cenário (dificuldade crescente, sem repetir tema) | `app/campanha.py`, `app/cenarios.py` |
| 2. Decisão | Moderação (regras locais + LLM) → avaliação de clareza → até 2 perguntas de esclarecimento | `app/moderacao.py`, `app/esclarecimento.py` |
| 3. Simulação | Job entra na fila; worker executa o pipeline MiroFish (ou contingência) e publica progresso | `app/fila.py`, `app/simulacao.py`, `app/mirofish_client.py`, `app/contingencia.py` |
| 4. Resultado | LLM extrai **sinais** estruturados do relatório/ações; **código** converte em variação de indicadores; LLM gera devolutiva pela rubrica | `app/sinais.py`, `app/indicadores.py`, `app/devolutiva.py` |
| 5. Conversa | Entrevista com agente (MiroFish `/interview`) ou com o Report Agent (`/report/chat`); na contingência, persona via LLM com a memória da simulação | `app/conversa.py` |
| 6. Continuação | Refazer (nova tentativa a partir do mesmo estado de indicadores) ou avançar (consolida a tentativa escolhida) | `app/campanha.py` |

## 3. Integração com o MiroFish — endpoints usados

Estudo feito sobre o repositório `666ghj/MiroFish` (branch principal, nov/2026). Todos os endpoints respondem `{"success": bool, "data": {...}, "error": "..."}`. Enviamos `Accept-Language: pt` para que mensagens e a instrução de idioma dos LLMs internos saiam em português.

| Etapa do jogo | Endpoint MiroFish | Uso |
|---|---|---|
| Construção do grafo (1/3) | `POST /api/graph/ontology/generate` (multipart: `files`, `simulation_requirement`, `project_name`, `additional_context`) | Envia o **material-semente** (`.md`: cenário + perfis dos atores + decisão do jogador) e o requisito de simulação. Retorna `project_id` e a ontologia. |
| Construção do grafo (2/3) | `POST /api/graph/build` (`project_id`, `chunk_size`, `chunk_overlap`) | Dispara a construção do grafo no Zep. Retorna `task_id`. |
| Construção do grafo (3/3) | `GET /api/graph/task/<task_id>` | Polling: `status` ∈ `pending/processing/completed/failed`, `progress`, `message`, `result.graph_id`. |
| Criação de personas | `POST /api/simulation/create` (`project_id`, `graph_id`, `enable_twitter`, `enable_reddit`) | Cria a simulação (usamos só a plataforma Reddit — fórum se parece mais com um grupo de associados e custa metade). |
| Criação de personas | `GET /api/simulation/entities/<graph_id>` + `POST /api/simulation/prepare` (`simulation_id`, `entity_types`, `use_llm_for_profiles`, `parallel_profile_count`) + `POST /api/simulation/prepare/status` | Lista os tipos de entidade do grafo e gera perfis OASIS só dos tipos específicos (sem `Person`/`Organization`), para manter ≤ 15 agentes. |
| Criação de personas | `GET /api/simulation/<id>/profiles?platform=reddit` | Lê os perfis gerados (`user_id`, `username`, `bio`, `persona`) e faz o *match* com os atores do cenário. |
| Simulação | `POST /api/simulation/start` (`simulation_id`, `platform: "reddit"`, `max_rounds`, `enable_graph_memory_update: false`) | Executa com limite de rodadas (padrão 12, teto 20). A gravação da memória no grafo fica desligada (ver achados do teste real). |
| Progresso | `GET /api/simulation/<id>/run-status` | `current_round`, `total_rounds`, `progress_percent`, `runner_status`. |
| Reações parciais | `GET /api/simulation/<id>/actions?limit=20&platform=reddit` | Últimas ações (posts/comentários) para mostrar na tela de espera. |
| Relatório | `POST /api/report/generate` + `POST /api/report/generate/status` + `GET /api/report/by-simulation/<id>` | Relatório do Report Agent (`markdown_content`) — insumo da extração de sinais. |
| Chat com agentes | `POST /api/simulation/interview` (`simulation_id`, `agent_id`, `prompt`, `platform`, `timeout`) | "Entrevista" um agente com memória da simulação. Exige ambiente vivo (`POST /api/simulation/env-status`). |
| Chat com relatório | `POST /api/report/chat` (`simulation_id`, `message`, `chat_history`) | Conversa com o Report Agent (usa ferramentas de busca no grafo). |
| Limpeza | `POST /api/simulation/close-env` | Fecha o ambiente após o tempo de conversa (config `mirofish.manter_ambiente_min`). |

### Cache de grafos

O grafo é o passo mais caro (ingestão no Zep + extração de entidades). Como cenário e atores são fixos, o orquestrador constrói **um grafo por cenário** (material-semente sem a decisão) e o guarda em `grafos_cache` (chave = SHA-256 do material). Para cada tentativa:

1. Chama `ontology/generate` com o material-semente **+ decisão** (gera um projeto novo com o `simulation_requirement` que contém a decisão — o MiroFish lê o requisito do projeto);
2. Chama `simulation/create` passando o `graph_id` em cache;
3. Se o MiroFish recusar o grafo de outro projeto, cai no caminho completo (`build`) e registra no log.

Desligável em `jogo.yaml → mirofish.reutilizar_grafo`.

### Achados do teste real (14/11/2026)

* **Agentes demais:** o Zep extrai do texto menções genéricas ("diretoria", "lojistas", "clube", "vice-presidente") como entidades separadas, e um cenário de 10 atores virou 30 agentes. O MiroFish ignora instruções para limitar a ontologia. Solução: antes do `/prepare`, o orquestrador lê `GET /api/simulation/entities/<graph_id>` e passa em `entity_types` só os tipos específicos, descartando os genéricos `Person` e `Organization` (configurável em `jogo.yaml → mirofish.tipos_genericos_excluidos`). Se ainda passar de 15, as rodadas são reduzidas proporcionalmente.
* **Simulação "travada" (na verdade, vazia):** o MiroFish conta as rodadas a partir da 0h simulada (1 rodada = 1 hora), e os agentes gerados só ficam ativos a partir das ~8h. Com poucas rodadas, ninguém agia: o laço terminava na hora e o processo entrava em "aguardando comandos" sem marcar `completed`, parecendo travado. Correção: o orquestrador pede `rodadas + 8` (`jogo.yaml → mirofish.rodadas_noturnas`); as rodadas noturnas não têm agentes ativos, então não chamam o LLM e passam instantaneamente. Também considera a simulação concluída quando `env-status` indica ambiente vivo. A gravação de memória no Zep (`enable_graph_memory_update`) ficou desligada por precaução (`memoria_no_grafo: false`); a entrevista usa a memória do próprio agente no ambiente vivo.
* **Idioma:** a imagem publicada do MiroFish gera perfis em chinês nas tarefas de fundo, ignorando `Accept-Language`. O material-semente e o requisito de simulação passaram a exigir português do Brasil explicitamente.
* **JSON cortado:** o MiroFish fixa `max_tokens=4096`, e o raciocínio adaptativo do Haiku 5.5 (ligado por padrão) consumia parte disso. O proxy desliga o raciocínio (`thinking: {type: disabled}` em `mirofish/litellm.yaml`).
* **Fim da simulação:** nesta versão do MiroFish, `run-status` e `actions` ficam zerados e o "ambiente vivo" aparece durante a execução. O orquestrador acompanha a atividade real (`/posts` + `/comments`) e considera a simulação concluída quando ela fica parada por `estabilidade_s` (90 s). As ações mostradas ao jogador e usadas na extração vêm daí.
* **Entrevista:** o agente do MiroFish não "sabe" qual foi a decisão; a pergunta enviada inclui a decisão como contexto (`conversa.pergunta_entrevista`).

### Limites de custo aplicados ao MiroFish

* `max_rounds` (padrão 20, teto 20) no `/start`;
* ≤ 15 agentes: o material-semente lista exatamente os atores do cenário, `entity_types` filtra os tipos e o orquestrador recusa iniciar se `profiles.count` > limite;
* Só a plataforma Reddit;
* Variáveis do MiroFish: `OASIS_DEFAULT_MAX_ROUNDS=20`, `REPORT_AGENT_MAX_TOOL_CALLS=3`, `REPORT_AGENT_MAX_REFLECTION_ROUNDS=1`.

### LLM do MiroFish

O MiroFish usa o SDK da OpenAI com `LLM_BASE_URL`. Ele aponta para um proxy **LiteLLM** (`llm-proxy:4000`), que repassa à Anthropic com `claude-haiku-5-5`. O proxy é necessário: no teste real de 14/11/2026, o endpoint compatível da Anthropic (`/v1/`) recusou `response_format: {"type": "json_object"}` ("Input should be 'json_schema'"), que o MiroFish usa para gerar ontologia, perfis e configuração. O LiteLLM traduz esse pedido e descarta parâmetros recusados (`drop_params`). O MiroFish recebe só a chave interna do proxy (`LITELLM_MASTER_KEY`); a chave da Anthropic fica no proxy e no orquestrador.

## 4. Conversão resultado → indicadores (determinística e auditável)

1. **LLM extrai sinais** (Opus 5.5, saída estruturada em JSON Schema): para cada indicador, uma lista de sinais `{indicador, intensidade ∈ {-3..+3}, evidencia, ator_id}`; para cada ator, `postura_final ∈ {-2..+2}`; e *flags* de uma lista fechada (ex.: `violacao_estatuto`, `risco_lgpd`, `decisao_sem_quorum`).
2. **Código converte** (`app/indicadores.py`), com pesos em `config/indicadores.yaml`:
   * cada sinal vale `peso_intensidade[intensidade] × multiplicador_influencia[ator]`;
   * a mudança de postura de cada ator vira contribuição nos indicadores mapeados ao seu tipo (ex.: associados → engajamento; prefeitura/câmara → capital político; imprensa → reputação);
   * *flags* aplicam penalidades fixas;
   * soma por indicador limitada a `±delta_maximo` por rodada; elasticidade perto dos extremos (`ganho × (100−v)/50`, `perda × v/50`, limitadas a [0,5; 1,5]); resultado final limitado a 0–100;
   * cada passo é registrado em `auditoria` (salvo no banco e visível no resultado em "Como calculamos").
3. Mesma entrada ⇒ mesma saída (testado em `tests/test_indicadores.py`).

## 5. Geração de cenários a partir de notícias

`app/news/pipeline.py`: **coletar** (RSS de `config/fontes.yaml`, últimos 90 dias) → **filtrar** (palavras-chave por tema, pontuação mínima) → **resumir e ficcionalizar** (Opus 5.5, saída estruturada) → **validar** (código: nenhum nome próprio detectado na notícia pode aparecer no cenário; checagem de nomes de cidades reais da lista `config/nomes_reais_bloqueados.txt`) → salvar em `cenarios/gerados/` com `status: "pendente_revisao"` e a referência "inspirado em" (título, veículo, data, URL).

**Proteção contra prompt injection:** o texto da notícia vai dentro de uma tag `<noticia>` declarada como dado não confiável; o prompt de sistema proíbe seguir instruções dali; a saída é forçada a um schema; o validador rejeita saídas fora do formato. A notícia nunca chega aos agentes do MiroFish — só o cenário ficcionalizado.

Biblioteca curada: `cenarios/curados/` (10 cenários revisados, usados offline e quando a coleta falha).

## 6. Robustez

* **Timeouts e novas tentativas:** cliente MiroFish com `httpx` (timeout por chamada, 3 tentativas com *backoff* exponencial em erros de rede/5xx); SDK Anthropic com `max_retries=3`.
* **Fila:** `asyncio.Queue` com `jogo.yaml → fila.workers` (padrão 1 — o MiroFish não aguenta várias simulações em paralelo numa máquina comum). A posição na fila aparece para o jogador.
* **Contingência:** se o *health check* do MiroFish falhar, se qualquer etapa estourar o tempo total (`mirofish.timeout_total_min`) ou se `MIROFISH_DESATIVADO=true`, a tentativa roda em `contingencia.py` (uma chamada ao Opus 5.5 que simula as reações dos atores, com a mesma estrutura de saída). O jogador vê um aviso explícito: "Modo de contingência — simulação simplificada".
* **Moderação:** regras locais (lista de termos, padrões de *prompt injection* como "ignore as instruções") antes de qualquer LLM; depois classificação com Haiku 5.5.

## 7. Custo

* Cada chamada à Anthropic registra `input_tokens`, `output_tokens` e custo estimado (tabela de preços em `llm.yaml`) na tabela `uso_tokens`, por partida.
* O MiroFish não expõe consumo; o orquestrador estima o custo dele por `agentes × rodadas × tokens_medios_por_acao` (configurável) e soma à partida — marcado como "estimado".
* Limites: simulações por jogador/dia (`limites.simulacoes_por_dia`), orçamento mensal (`limites.orcamento_mensal_brl`) — ao atingir, novas simulações são recusadas com mensagem clara até o mês seguinte (a contingência também usa o Opus, então não é uma saída mais barata).

## 8. Privacidade (LGPD) e ética

* Sem login nesta versão: o jogador escolhe um **apelido**; a sessão é um token aleatório guardado no navegador. Não coletamos e-mail, nome ou IP no banco.
* Texto das decisões fica no SQLite local; botão "Apagar meus dados" remove a sessão inteira.
* Agentes nunca representam pessoas reais: os cenários são ficcionais e o validador bloqueia nomes vindos das notícias.

## 9. Fora de escopo (v1)

Login e turmas (decisão do projeto), multijogador em tempo real, app nativo, integração com sistemas das ACs. O **painel do facilitador** da v1 é simples e sem login (protegido por um código no `.env`): lista partidas, compara decisões para o mesmo cenário e exporta CSV; o relatório para PDF usa a impressão do navegador.
