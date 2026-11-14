# Liderança em Jogo

**Treinamento gamificado que simula cenários de lideranças de associações comerciais usando uma coleção de agentes de IA para compor uma ferramenta preditiva que reduz os riscos de atuações reais.**

Jogo sério em português do Brasil, feito para o desafio CACB do Hackathon Connect 7.0 ("Varejo e soluções do futuro"). Prepara novas lideranças, voluntários e diretores de associações comerciais para decidir **prioridades, orçamento e resultados**.

O jogador cumpre um **mandato** numa associação fictícia. Em cada trimestre, lê a **pauta**, fecha a **Mesa do Orçamento** (o ano anterior não cabe no teto), registra a **Ata da decisão** em 5 passos numerados, com botões, voz ou texto, e vê o resultado na hora. Em segundo plano, agentes de IA no [MiroFish](https://github.com/666ghj/MiroFish) simulam como associados, diretoria, prefeitura e imprensa reagem. O jogo devolve reações previstas, mapa de riscos e sinais de alerta. Relatos mascarados do **Banco de Vivências** entram na pauta e na simulação. No **Modo Ensaio**, a liderança testa uma decisão real antes de tomá-la.

> Protótipo de uso local. Licença **AGPL-3.0**, a mesma do MiroFish (veja [LICENSE](LICENSE)). Se você oferecer o jogo como serviço em rede, precisa disponibilizar o código-fonte com as suas modificações. Usa só informações públicas ou fictícias.

## Como o desafio aparece no jogo

| Pedido do guia | No jogo |
|---|---|
| Decidir prioridades, orçamento e resultados | **Mesa do Orçamento**: −/+ R$ 500 por linha, "ano anterior", status de cada linha ("sem mudança", "corte de R$ X"), total × teto, "Falta cortar R$ X" e prévia instantânea dos indicadores |
| Diretorias voluntárias, com pouco tempo | Cronômetro de reunião, pauta curta com "Ler contexto completo" em painel inferior, um passo por tela |
| Clareza | **Ata Padronizada de Decisão** com 7 seções fixas, em tela, PDF e CSV |
| Aprendizado com a rede | **Banco de Vivências** mascarado (LGPD), relatos na pauta ("O que a rede relata") e personas sintéticas de stakeholders |
| Reduzir o risco da atuação real | Previsão do MiroFish: reações por stakeholder, mapa de riscos 3×3, sinais de alerta e **Modo Ensaio** para decisões reais |
| Replicação | Perfis de AC em configuração (pequena R$ 9 mil, média R$ 30 mil, grande R$ 120 mil) e "Adaptar para outra associação" no painel do facilitador |
| Pouca familiaridade digital | Barra de abas fixa, botões grandes, voz, letra ajustável, alto contraste, sons discretos com botão de mudo, app instalável (PWA) |

## Conteúdo

| Pasta/arquivo | O que é |
|---|---|
| [docs/arquitetura.md](docs/arquitetura.md) | Arquitetura, integração com o MiroFish e regras de cálculo |
| [docs/pitch-testes.md](docs/pitch-testes.md) | Quadro "O que observamos nos testes x o que ainda precisa ser validado" |
| [docs/banco-de-vivencias.md](docs/banco-de-vivencias.md) | **Fluxo de dados do Banco de Vivências e LGPD** (coleta, mascaramento, armazenamento, envio ao MiroFish) |
| [docs/identidade-visual.md](docs/identidade-visual.md) | Paleta CACB (códigos e fontes), contraste, tipografia, ícones e licenças |
| [docker-compose.yml](docker-compose.yml) | Orquestrador + MiroFish + proxy LLM (LiteLLM) |
| `orquestrador/app/` | Backend em Python/FastAPI |
| `orquestrador/frontend/` | PWA sem etapa de build (HTML/CSS/JS): avatares SVG próprios, ícones Lucide, fonte Inter, jsPDF, sons em Web Audio, tudo servido localmente |
| `orquestrador/config/` | **Arquivos editáveis** (veja "Configuração") |
| `orquestrador/cenarios/curados/` | Caso do guia (2 trimestres) e 10 casos fictícios revisados |
| `orquestrador/cenarios/fatos/` | Fatos de trimestre gerados de notícias (aguardam aprovação) |
| `orquestrador/tests/` | 62 testes automatizados, incluindo ponta a ponta e mascaramento |

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
- `/vivencias`: Banco de Vivências (contribuir, ver relatos aprovados, excluir pelo código).
- `/ensaio`: Modo Ensaio.
- `/relatorio`: Relatório de gestão do mandato (PDF, CSV, texto).
- `/facilitador`: painel do facilitador (curadoria, personas, cenários de vivências, bloqueios, turma), com o código do `.env`.
- `/certificado`: certificações de competência da campanha atual.

O app é instalável (PWA): no Chrome do celular, "Adicionar à tela inicial". A casca, as fontes, os ícones e a última versão das telas ficam em cache e abrem sem internet.

* O MiroFish não fica exposto fora da rede do Compose e a interface própria dele não é usada. As chaves ficam só no servidor.
* O proxy LiteLLM é necessário: o endpoint compatível da Anthropic recusa o pedido de JSON do MiroFish. O proxy também desliga o raciocínio adaptativo do Haiku, porque o MiroFish limita as respostas a 4.096 tokens. O MiroFish só conhece a chave interna do proxy.
* Os arquivos de `orquestrador/config/` são montados no container: edite e rode `docker compose restart orquestrador`.

## Publicar para colegas (túnel com senha)

Abre um endereço `https://….trycloudflare.com` que aponta para o jogo rodando na sua máquina, sem conta na Cloudflare e sem instalar nada além do Docker:

```bash
./publicar.sh
```

* Na primeira vez, o script cria uma senha (`ACESSO_SENHA` no `.env`, usuário `hackathon`). Todo o site passa a pedir usuário e senha, inclusive em `localhost`. Compartilhe o endereço e a senha só com os colegas.
* O script se recusa a publicar se o `FACILITADOR_CODIGO` ainda for o do exemplo.
* O HTTPS do túnel é o que libera o microfone (voz) no navegador.
* Limites de custo: 4 simulações por jogador por dia, 60 no site inteiro e R$ 100 por mês (`jogo.yaml`). Defina também um teto mensal no Console da Anthropic.
* O endereço muda quando o túnel reinicia (por exemplo, depois de reiniciar o computador). Para ver o atual:

```bash
./publicar.sh endereco
```

Para tirar do ar (o jogo continua local):

```bash
./publicar.sh parar
```

Para voltar a usar sem senha em casa, apague as linhas `ACESSO_` do `.env` e rode `docker compose up -d orquestrador`.

## Roteiro da demonstração (cerca de 6 minutos)

1. Abra http://localhost:8000, pule as boas-vindas e toque em **"Roteiro da demonstração (2 trimestres)"**. Uma faixa azul indica, em cada tela, o próximo toque. No **Painel**, mostre os 6 indicadores e a lista do mandato; toque em **Jogar**.
2. **Trimestre 1** (caso do guia: digitalização, formação e atendimento somavam R$ 30 mil no ano anterior; a receita cai R$ 6 mil e o teto fica em R$ 24 mil):
   - Na pauta, abra **Ler contexto completo** e **Ver relatos da rede** ("O que a rede relata", vindos do Banco de Vivências). Toque em **Abrir a Mesa do Orçamento**.
   - Na Mesa, mostre "R$ 30.000 de R$ 24.000 · Falta cortar R$ 6.000" e o som de alerta. Toque em **Aplicar**: o total fecha em R$ 24 mil, com o acorde de "orçamento fechado".
   - Toque em **Orçamento fechado: registrar a decisão**. Os 5 passos já vêm marcados: critérios, **quem você envolve antes de decidir** (avatares), justificativa dos cortes, comunicação e meta com responsável e indicador. Toque em **Ver a Ata da decisão** e **Confirmar a decisão**.
   - No resultado: indicadores antes × depois, reações previstas por stakeholder, **mapa de riscos**, sinais de alerta e o aviso fixo "Simulação para apoio à decisão; não é garantia de resultado". Na conversa, pergunte à Dona Cida por que discordou.
3. **Próximo trimestre** → **Trimestre 2**: mostre "Como foi o trimestre passado" e toque em **Ajustar** → **Aplicar** → **Orçamento fechado** → **Ver a Ata** → **Confirmar** → **Concluir o mandato**.
4. **Relatório de gestão:** certificações de competência e consolidado do mandato. Toque em **Baixar relatório (PDF)**: as 7 seções por trimestre, o consolidado, cabeçalho institucional e números de página. Mostre também **Baixar dados (CSV)**.
5. **Vivências:** registre um relato com um nome e um telefone e mostre o texto mascarado antes de confirmar, as 3 confirmações de consentimento e o código de exclusão.
6. **Ensaio:** **Ver ensaio de exemplo** (funciona sem internet) ou **Novo ensaio** com uma decisão real. O resultado fica só no aparelho.
7. Opcional: **Facilitador** (código do `.env`): curadoria com risco de reidentificação, "Gerar personas", "Gerar cenário a partir de vivências", bloqueios de envio e "Adaptar para outra associação".

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
| `vivencias.yaml` | Banco de Vivências: faixas do perfil, temas, tipos e perguntas, textos de consentimento, retenção (24 meses), curadoria (personas com ≥ 3 vivências) e 6 exemplos fictícios aprovados |
| `selos.yaml` | As 6 certificações de competência por comportamento |
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

São 62 testes: alocação e prévia (incluindo "Falta cortar"), perfis, decisão guiada, meta, certificações, **mascaramento** (nome, CPF, telefone, e-mail, empresa e cidade removidos; payload do MiroFish sem nenhum deles; bloqueio registrado sem o dado), Banco de Vivências (consentimento, risco, exclusão por código), Modo Ensaio (mascara e não grava), Ata com 7 seções, notícias (injeção e nomes reais), cliente do MiroFish, pipeline de simulação (caches, MiroFish fora do ar, falha no meio, sem internet) e **dois trimestres ponta a ponta** pela API.

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

- **Jogadores:** só apelido, sem e-mail ou IP. O apelido entra no relatório apenas se a pessoa marcar. "Apagar meus dados" remove a sessão e as vivências ainda não aprovadas dela.
- **Banco de Vivências:** perfil em faixas, mascaramento antes de gravar e antes de qualquer envio, consentimento em 3 partes, retenção de 24 meses, código de exclusão, curadoria e bloqueio automático de envios com dado pessoal. Detalhes em [docs/banco-de-vivencias.md](docs/banco-de-vivencias.md).
- **Modo Ensaio:** o texto é mascarado e simulado sem ser gravado no servidor; o resultado fica só no aparelho.
- **Voz:** usa o reconhecimento do próprio navegador (no Chrome, passa por servidores do Google), e a tela avisa isso. O áudio nunca é gravado.
- **Moderação:** barra conteúdo ofensivo e tentativas de manipular os agentes, sempre depois do mascaramento.

## Fora do escopo

Login e turmas, multijogador em tempo real e app nativo. O painel do facilitador é protegido só por código.
