# Liderança em Jogo

**Formar lideranças para decidir e acompanhar resultados.** Jogo sério em português do Brasil, feito para o desafio CACB do Hackathon Connect 7.0 ("Varejo e soluções do futuro"). Ele prepara novas lideranças, voluntários e diretores de associações comerciais para decidir **prioridades, orçamento e resultados**.

O jogador preside uma associação fictícia por dois trimestres. Em cada um, lê uma pauta curta, **divide o orçamento** entre pedidos que não cabem juntos, registra a decisão com botões, voz ou texto, e vê o resultado na hora. Em segundo plano, agentes de IA no [MiroFish](https://github.com/666ghj/MiroFish) simulam como associados, diretoria, prefeitura e imprensa reagem. Depois o jogador conversa com essas pessoas, consulta um **conselheiro sênior** que cita experiências reais de dirigentes da rede e acompanha a meta que ele mesmo definiu.

> Protótipo de uso local. Licença **AGPL-3.0**, a mesma do MiroFish (veja [LICENSE](LICENSE)). Se você oferecer o jogo como serviço em rede, precisa disponibilizar o código-fonte com as suas modificações. Usa só informações públicas ou fictícias.

## Como o desafio aparece no jogo

| Pedido do guia | No jogo |
|---|---|
| Decidir prioridades, orçamento e resultados | Orçamento como mecânica central: controles deslizantes, botões "Financiar tudo", "Metade" e "Adiar", saldo em tempo real e prévia instantânea |
| Diretorias voluntárias, com pouco tempo | Cronômetro de reunião (10 min), pauta com até 80 palavras, um passo por tela |
| Clareza | "Resumo da decisão" de 5 linhas: prioridade, motivo, **limites que pesaram**, comunicação e meta |
| Aprendizado com os seniores | Sala do Conselho (relatos por voz), cartão "Experiência da rede" e Conselheiro sênior |
| Replicação | Perfis de AC em configuração: pequena (sem funcionários, R$ 9 mil), média (caso do guia, R$ 30 mil) e grande (R$ 120 mil) |
| Pouca familiaridade digital | Botões grandes, voz, letra ajustável, alto contraste, onboarding de 4 telas, sem jargão |

## Conteúdo

| Pasta/arquivo | O que é |
|---|---|
| [docs/arquitetura.md](docs/arquitetura.md) | Arquitetura, integração com o MiroFish e regras de cálculo |
| [docs/pitch-testes.md](docs/pitch-testes.md) | Quadro "O que observamos nos testes x o que ainda precisa ser validado" |
| [docker-compose.yml](docker-compose.yml) | Orquestrador + MiroFish + proxy LLM (LiteLLM) |
| `orquestrador/app/` | Backend em Python/FastAPI |
| `orquestrador/frontend/` | SPA sem etapa de build (HTML/CSS/JS), com avatares SVG próprios |
| `orquestrador/config/` | **Arquivos editáveis** (veja "Configuração") |
| `orquestrador/cenarios/curados/` | Caso do guia (2 trimestres) e 10 casos fictícios revisados |
| `orquestrador/cenarios/fatos/` | Fatos de trimestre gerados de notícias (aguardam aprovação) |
| `orquestrador/tests/` | 53 testes automatizados, incluindo ponta a ponta |

## Instalação (Docker)

Pré-requisitos: Docker com Compose, uma chave da **Anthropic** e uma chave do **Zep Cloud**. O plano gratuito do Zep atende o protótipo; o MiroFish usa o Zep para o grafo e a memória dos agentes.

```bash
cp .env.example .env
```

Edite o `.env` e preencha `ANTHROPIC_API_KEY`, `ZEP_API_KEY` e `FACILITADOR_CODIGO`. Gere a chave interna do proxy:

```bash
echo "LITELLM_MASTER_KEY=sk-$(openssl rand -hex 32)" >> .env
```

```bash
docker compose up -d --build
```

Abra http://localhost:8000. Endereços:
- `/conselho`: Sala do Conselho, para os seniores registrarem experiências.
- `/facilitador`: painel do facilitador, com o código do `.env`.
- `/certificado`: certificado da campanha atual.

* O MiroFish não fica exposto fora da rede do Compose e a interface própria dele não é usada. As chaves ficam só no servidor.
* O proxy LiteLLM é necessário: o endpoint compatível da Anthropic recusa o pedido de JSON do MiroFish. O proxy também desliga o raciocínio adaptativo do Haiku, porque o MiroFish limita as respostas a 4.096 tokens. O MiroFish só conhece a chave interna do proxy.
* Os arquivos de `orquestrador/config/` são montados no container: edite e rode `docker compose restart orquestrador`.

## Roteiro da demonstração (cerca de 5 minutos)

1. Abra http://localhost:8000 e toque em **"▶ Roteiro da demonstração (2 trimestres)"**. Uma faixa verde indica, em cada tela, o próximo toque.
2. **Trimestre 1** (caso do guia: R$ 30 mil; digitalização R$ 18 mil, formação R$ 14 mil, atendimento R$ 8 mil; a receita cai R$ 6 mil):
   - Na pauta, toque em **🦉 Consultar o conselheiro** e depois em **Perguntar**. Ele cita a experiência da rede e não dá a resposta pronta. Feche.
   - Em **Ir para o orçamento**, toque em **Aplicar a divisão do roteiro**: atendimento R$ 8 mil e digitalização R$ 16 mil. Mostre a Dona Cida ficando insatisfeita e as setas nos indicadores.
   - Em **Registrar a decisão**, toque em **Próximo** três vezes: os botões já vêm marcados. Mostre o **Resumo da decisão** e toque em **Confirmar**.
   - Mostre o resultado imediato, a meta prevista, os momentos-chave e a devolutiva. Na conversa, toque em **Perguntar**: a Dona Cida explica por que discordou.
3. Toque em **Ir para o próximo trimestre**. **Trimestre 2**: mostre "Como foi o trimestre passado" (meta prevista x alvo) e toque em **Ajustar** → **Aplicar a divisão do roteiro** → **Registrar** → **Próximo** ×3 → **Confirmar** → **Perguntar** (Seu Jorge) → **Concluir**.
4. Toque em **🏅 Ver meu certificado**: 5 selos e os resumos de decisão. **Imprimir / salvar em PDF**.
5. Opcional: mostre a **Sala do Conselho** (`/conselho`), com uma pergunta por tela e o botão de microfone, e o **painel do facilitador**, com a moderação.

**Cache e contingência:** a primeira execução do roteiro grava as simulações e as respostas. Nas seguintes, o jogo reaproveita o cache e roda **mesmo com o MiroFish desligado**, sinalizando o modo simplificado na tela. Testado: roteiro completo em 23 s de cliques automatizados com o MiroFish parado. Sem internet, as respostas vêm do modo demonstração e o texto avisa isso.

Para preparar o cache antes da apresentação, jogue o roteiro uma vez com tudo ligado (cerca de 10 minutos, porque as simulações reais rodam em segundo plano). Para testar a contingência:

```bash
docker compose stop mirofish
```

E para religar:

```bash
docker compose start mirofish
```

## Modo demonstração sem chaves

Respostas fixas, sem chamar a Anthropic nem o MiroFish. Serve para ensaiar a interface e não tem valor pedagógico:

```bash
cd orquestrador && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

```bash
cd orquestrador && LLM_FALSO=true MIROFISH_DESATIVADO=true FACILITADOR_CODIGO=demo .venv/bin/uvicorn app.main:app --port 8010
```

## Configuração (sem programar)

| Arquivo | Para quê |
|---|---|
| `jogo.yaml` | Modo da campanha (demonstração com 2 trimestres ou completa), perfil padrão, minutos de reunião, rodadas (4 por padrão, teto 20), agentes (≤ 15), limites diários, orçamento mensal (R$ 100), parâmetros do MiroFish, **roteiro da demonstração** |
| `perfis/*.yaml` | **Replicação**: associação, equipe, orçamento por trimestre e personagens de cada perfil de AC. Para outra AC, copie um arquivo e mude os valores; custos e textos se ajustam sozinhos |
| `indicadores.yaml` | Regras de cálculo: efeito de cada pedido financiado ou adiado, saldo guardado, pontos da decisão guiada, faixa de ajuste da simulação (±10), limites |
| `rubrica.yaml` | Rubrica de 7 competências × 4 níveis |
| `conselho.yaml` | Temas e perguntas da Sala do Conselho, mapa tema do cenário → temas da rede, 2 exemplos fictícios |
| `selos.yaml` | Os 6 selos por comportamento |
| `llm.yaml` | Modelo e esforço por tarefa, preços, câmbio, cache de respostas, modo sem internet |
| `fontes.yaml` | Feeds RSS e palavras-chave por tema (notícias → fato do trimestre) |
| `moderacao.yaml` | Termos bloqueados e padrões de manipulação |

### Como o resultado é calculado

1. **Na hora, sem IA:** cada pedido tem um efeito por indicador quando financiado e outro quando adiado. Financiar pela metade rende metade; abaixo do mínimo útil, rende menos ainda. O dinheiro guardado melhora a saúde financeira, e motivo, comunicação e meta somam pontos. Quem pediu muda de expressão conforme a verba. É a mesma conta da prévia.
2. **Depois, com os agentes:** o Claude Opus extrai sinais da simulação, e o código transforma esses sinais em um ajuste **limitado a ±10 pontos por indicador**.
3. Tudo aparece em "Como calculamos". Mesma entrada, mesmo resultado.

## Notícias → fato do trimestre

No painel do facilitador, toque em **"Gerar fatos a partir de notícias recentes"**. O pipeline coleta feeds RSS (últimos 90 dias), filtra por tema e escreve um **fato de até 2 frases** com fonte, data e recorte temático. O código valida o resultado (nenhum nome real, no máximo 2 frases), e o fato fica em revisão. Depois de aprovado, vira a "Notícia do trimestre" e entra na simulação. O orçamento e os pedidos continuam vindo do perfil da AC. O texto da notícia é tratado como dado, nunca como instrução, e o jogador não vê o título original da notícia.

## Testes

```bash
cd orquestrador && .venv/bin/python -m pytest -q
```

São 53 testes: alocação e prévia, perfis, limite de 80 palavras por pauta, decisão guiada, meta, selos, Sala do Conselho e conselheiro, notícias (injeção e nomes reais), cliente do MiroFish, pipeline de simulação (cache de grafo, cache de simulação, MiroFish fora do ar, falha no meio, excesso de agentes, sem internet) e **dois trimestres ponta a ponta** pela API, com o MiroFish simulado.

## Custo e tempo (medidos com chaves reais em 14/11/2026)

| Medida | Valor |
|---|---|
| Trimestre com MiroFish (Haiku nos agentes; Opus em sinais e devolutiva) | **US$ 0,19 a 0,21 ≈ R$ 1,10** |
| Replay do roteiro (cache) | ≈ R$ 0,00 |
| Simulação do MiroFish em segundo plano | 3,7 min (grafo em cache) a 5 min (grafo novo), 4 rodadas, 20 a 23 agentes, 38 interações |
| Resultado e prévia para o jogador | Na hora; devolutiva em cerca de 20 s |
| Conversa (entrevista no MiroFish ou persona) | 3 a 12 s por mensagem |

Com R$ 100 por mês, cabem cerca de **45 campanhas de 2 trimestres** (~R$ 2,20 cada). O consumo do MiroFish ainda é estimado (ele não informa os tokens); compare com o painel da Anthropic.

## Privacidade (LGPD)

- **Jogadores:** só apelido, sem e-mail ou IP. O botão "Apagar meus dados" remove a sessão e as contribuições ligadas a ela.
- **Seniores:** escolhem entre nome e anonimato, avatar em vez de foto, e dão consentimento explícito. A contribuição fica em revisão até um facilitador aprovar.
- **Voz:** usa o reconhecimento do próprio navegador (no Chrome, passa por servidores do Google), e a tela avisa isso.
- **Moderação:** barra conteúdo ofensivo, dados pessoais e tentativas de manipular os agentes.

## Fora do escopo

Login e turmas, multijogador em tempo real e app nativo. O painel do facilitador é protegido só por código.
