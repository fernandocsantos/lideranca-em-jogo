# Arquitetura e integração com o MiroFish

**Projeto:** Liderança em Jogo — "Formar lideranças para decidir e acompanhar resultados" (desafio CACB, Hackathon Connect 7.0)
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
| Extração de sinais e riscos, devolutiva pedagógica, ficcionalização de notícias, personas e cenários do Banco de Vivências, simulação de contingência e Modo Ensaio | `claude-opus-5-5` | Poucas chamadas, exigem julgamento |
| Moderação, conversa com agentes (persona) | `claude-haiku-5-5` | Respostas curtas, alto volume |

Tudo em `orquestrador/config/llm.yaml`.

## 2. Ciclo do trimestre e componentes

| Etapa | O que acontece | Módulo |
|---|---|---|
| Onboarding | 4 telas puláveis, só na primeira vez | `frontend/app.js` |
| 1. Pauta | Narrativa de até 80 palavras, evento do período, tags, regras com ícone, fileira de avatares, "Notícia do trimestre", "Ler contexto completo" e "O que a rede relata" (painéis inferiores). No 2º trimestre: meta do trimestre anterior + Manter/Ajustar/Rever | `cenarios.py`, `perfis.py`, `fatos.py`, `vivencias.py` |
| 2. Mesa do Orçamento | −/+ R$ 500 por linha a partir do ano anterior, status da linha, total × teto, "Falta cortar"; prévia instantânea em código (`POST /previa`) com postura de quem pediu e tendência dos indicadores | `alocacao.py` |
| 3. Ata da decisão | 5 passos numerados (critérios, envolvidos, justificativa dos cortes, comunicação, meta com responsável e indicador), com botões, voz e texto; mascaramento e depois moderação local | `frontend/app.js`, `mascaramento.py`, `moderacao.py` |
| 4. Resultado | **Resultado base imediato** (alocação → indicadores, meta prevista); devolutiva em ~20 s (Opus, sem esperar a simulação); a simulação do MiroFish roda na fila e, ao terminar, ajusta os indicadores (±10) e gera os momentos-chave | `simulacao.py`, `indicadores.py`, `devolutiva.py`, `fila.py` |
| Conversa | Entrevista no MiroFish (com a decisão como contexto) ou persona com memória da simulação; 3 perguntas sugeridas por interlocutor | `conversa.py` |
| Previsão e riscos | Reações por stakeholder, riscos com probabilidade × impacto (mapa 3×3), sinais de alerta e o que mudaria a previsão, extraídos da simulação | `sinais.py` |
| Relatório de gestão | Ata Padronizada (7 seções) por trimestre + consolidado do mandato; PDF (jsPDF) e CSV gerados no navegador, offline | `relatorio.py`, `frontend/relatorio.js` |
| Certificações | 6 certificações de competência por comportamento, calculadas no servidor | `selos.py` |
| Banco de Vivências | Coleta guiada, mascaramento, consentimento, curadoria, personas sintéticas e cenários | `vivencias.py`, `mascaramento.py`, `frontend/vivencias.js` |
| Modo Ensaio | Decisão real mascarada → simulação com personas do Banco → Ata com mapa de riscos, sem gravar no servidor | `ensaio.py`, `frontend/ensaio.js` |

**Como o Banco chega ao MiroFish:** cada vivência nova exigiria reconstruir o grafo e as personas (minutos e custo). Por isso, os trechos mascarados entram no **material-semente de cada tentativa**, e a guarda de envio verifica o texto antes de cada chamada. Fluxo completo em [banco-de-vivencias.md](banco-de-vivencias.md).

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
| Relatório (opcional) | `POST /api/report/generate` + `POST /api/report/generate/status` + `GET /api/report/by-simulation/<id>` | Desligado por padrão (`gerar_relatorio: false`): leva ~4 min. Os sinais saem direto dos posts e comentários (`/posts`, `/comments`). |
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

* `max_rounds` (padrão 4 + 8 rodadas noturnas sem custo, teto 20) no `/start`;
* ≤ 15 agentes: o material-semente lista exatamente os atores do cenário, `entity_types` filtra os tipos e o orquestrador recusa iniciar se `profiles.count` > limite;
* Só a plataforma Reddit;
* Variáveis do MiroFish: `OASIS_DEFAULT_MAX_ROUNDS=20`, `REPORT_AGENT_MAX_TOOL_CALLS=3`, `REPORT_AGENT_MAX_REFLECTION_ROUNDS=1`.

### LLM do MiroFish

O MiroFish usa o SDK da OpenAI com `LLM_BASE_URL`. Ele aponta para um proxy **LiteLLM** (`llm-proxy:4000`), que repassa à Anthropic com `claude-haiku-5-5`. O proxy é necessário: no teste real de 14/11/2026, o endpoint compatível da Anthropic (`/v1/`) recusou `response_format: {"type": "json_object"}` ("Input should be 'json_schema'"), que o MiroFish usa para gerar ontologia, perfis e configuração. O LiteLLM traduz esse pedido e descarta parâmetros recusados (`drop_params`). O MiroFish recebe só a chave interna do proxy (`LITELLM_MASTER_KEY`); a chave da Anthropic fica no proxy e no orquestrador.

## 4. Cálculo dos indicadores (determinístico e auditável)

1. **Base, só com a alocação** (`alocacao.calcular`, regras em `indicadores.yaml → alocacao`):
   - cada demanda tem `efeitos` (financiada) e `efeitos_adiar` (não financiada), multiplicados pela utilidade da verba (fração financiada; abaixo de `minimo_util`, o benefício cai à metade);
   - saldo guardado → saúde financeira (1 ponto por 10% do disponível);
   - decisão guiada → `bonus_decisao` (comunicação, meta mensurável, revisão programada);
   - postura prevista de quem pediu: financiada → +1; adiada → −2 níveis (−2 direto se a influência for ≥ 4).
2. **Ajuste pela simulação:** o LLM extrai sinais (intensidade −3..+3, postura final, marcações de uma lista fechada); o código converte os sinais com as regras antigas e **limita o ajuste a ±10 por indicador** (`ajuste_llm_max`).
3. **Consolidação:** base + ajuste, limitado a ±20 por trimestre, com elasticidade perto de 0 e de 100.
4. **Meta do jogador** (`alocacao.progresso_meta`): previsto = quantidade × utilidade da verba da demanda ligada à meta × fator de engajamento.
5. Cada parcela vai para a `auditoria` ("Como calculamos" na tela).

## 4a. Material-semente enviado ao MiroFish

Documento `.md` (`cenarios.material_semente`): contexto da AC (do perfil), situação, pedidos que disputam o orçamento, **regras que a decisão e a simulação devem respeitar**, pessoas (persona, interesses, influência, postura) e, na tentativa, a **tabela da alocação** (demanda | quem pediu | custo | valor aprovado | situação), o resumo da decisão e as **experiências da rede**. O requisito de simulação repete a alocação e lembra que quem foi adiado cobra explicações. O grafo do cenário (sem decisão) fica em cache; a decisão vai no projeto de cada tentativa.

## 5. Notícias → fato do trimestre

`app/news/pipeline.py`: coletar (RSS, 90 dias) → filtrar por tema → **fato de até 2 frases** (Opus, saída estruturada: título curto, texto, recorte temático, efeito típico no caixa) → validar em código (nenhum nome próprio da notícia nem da lista de bloqueados; no máximo 2 frases) → `cenarios/fatos/` em revisão. Aprovado, aparece como "Notícia do trimestre" (o mais recente no 1º trimestre, o seguinte no 2º) e entra no material-semente. O orçamento e as demandas vêm do perfil da AC. O texto da notícia vai delimitado como dado não confiável, e o jogador vê veículo, data, link e recorte, nunca o título original.

## 5a. Banco de Vivências e certificações

* Vivências (tabela `vivencias`): perfil em faixas, tipo, tema, respostas **mascaradas**, risco de reidentificação, status e hash do código de exclusão. Há 6 exemplos fictícios aprovados em `config/vivencias.yaml`. Detalhes e LGPD em [banco-de-vivencias.md](banco-de-vivencias.md).
* Certificações (`config/selos.yaml`): calculadas a partir do que ficou gravado (escolhas da Ata, relatos da rede abertos, conversas com atores de postura ≤ −1, vivências da sessão). Cada uma é avisada uma única vez.

## 6. Robustez, cache e demonstração

* **Timeouts, novas tentativas e fila:** como antes. A simulação roda em segundo plano (4 rodadas, sem o Report Agent de 4 min, fim detectado por 45 s sem atividade nova).
* **Contingência:** MiroFish fora do ar ou estourando o prazo → simulação simplificada pelo Opus, com aviso na tela.
* **Cache de simulação** (`sim_cache`): pauta + perfil + divisão do orçamento + continuidade + fato. A mesma escolha reaproveita a simulação, mesmo com o MiroFish parado.
* **Cache de respostas do LLM** (`llm_cache`): mesmo prompt, mesma resposta. Deixa o roteiro reprodutível e sem custo novo.
* **Sem internet:** o LLM cai nas respostas fixas do modo demonstração, marcadas no texto.
* **Roteiro da demonstração** (`jogo.yaml → roteiro_demo`): escolhas fixas de 2 trimestres. Testado com o MiroFish desligado: roteiro completo em 23 s de cliques automatizados.

## 7. Custo

* Cada chamada à Anthropic registra `input_tokens`, `output_tokens` e custo estimado (tabela de preços em `llm.yaml`) na tabela `uso_tokens`, por partida.
* O MiroFish não expõe consumo; o orquestrador estima o custo dele por `agentes × rodadas × tokens_medios_por_acao` (configurável) e soma à partida — marcado como "estimado".
* Limites: simulações por jogador/dia (`limites.simulacoes_por_dia`), orçamento mensal (`limites.orcamento_mensal_brl`) — ao atingir, novas simulações são recusadas com mensagem clara até o mês seguinte (a contingência também usa o Opus, então não é uma saída mais barata).

## 8. Privacidade (LGPD) e ética

* Sem login nesta versão: o jogador escolhe um **apelido**; a sessão é um token aleatório guardado no navegador. Não coletamos e-mail, nome ou IP no banco.
* Texto das decisões fica no SQLite local; botão "Apagar meus dados" remove a sessão inteira.
* Agentes nunca representam pessoas reais: os cenários são ficcionais e o validador bloqueia nomes vindos das notícias.

## 9. Fora de escopo

Login e turmas (decisão do projeto), multijogador em tempo real, app nativo, integração com sistemas das ACs. O **painel do facilitador** da v1 é simples e sem login (protegido por um código no `.env`): lista partidas, compara decisões para o mesmo cenário e exporta CSV; o relatório sai em PDF e CSV gerados no navegador.
