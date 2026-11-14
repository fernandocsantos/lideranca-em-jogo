# Diagnóstico: rodada 3 (identidade CACB, Banco de Vivências, Ata Padronizada)

**Frase norteadora (subtítulo do produto):** "Treinamento gamificado que simula cenários de lideranças de associações comerciais usando uma coleção de agentes de IA para compor uma ferramenta preditiva que reduz os riscos de atuações reais."

**Cores oficiais** (manual "CACB 14 MAR 23", p. 51): Blue Eyes `#0067BE` (RGB 0/103/190, Pantone 2144 C), Lightning Yellow `#FFB81C` (255/184/28, Pantone 1235 C), Pine Green `#008368` (0/131/104, Pantone 3288 C). Estética do manual: fundo branco ou cinza claro, filete fino com linha de metadados em letras pequenas, azul dominante, sans-serif pesada nos títulos.

## O que muda em cada tela

| Tela | Hoje | Depois |
|---|---|---|
| Estrutura | Página única com cabeçalho e links | PWA instalável: barra superior (título + voltar), abas fixas embaixo (Painel, Ensaio, Vivências, Relatório, Facilitador), painéis inferiores e avisos curtos |
| Início | Formulário de apelido + perfil | **Painel**: blocos dos 6 indicadores + lista do mandato (cenários com progresso, tema, duração estimada, "Jogar") |
| Pauta | Narrativa + cartões | Essencial + "Ler contexto completo" (painel inferior); cartões "O que a rede relata"; "Construído a partir de N vivências" quando for o caso |
| Orçamento | Controles a partir de zero | **Mesa do Orçamento**: linhas que partem do "ano anterior", botões −/+ de R$ 500, indicadores afetados, status ("sem mudança", "corte de R$ X"), total × teto com barra e "Falta cortar R$ X" |
| Decisão | 3 passos | Passos numerados: critérios → **quem você envolve** (avatares) → justificativa dos cortes → meta + responsável + indicador de acompanhamento → **Ata da decisão** |
| Resultado | Barras + devolutiva | + mapa de riscos 3×3, sinais de alerta e o aviso "Simulação para apoio à decisão; não é garantia de resultado" |
| Relatório | Certificado | **Relatório de gestão**: Ata Padronizada (7 seções) por trimestre + consolidado; PDF institucional, CSV e copiar texto |
| Visual | Emojis, avatares caricatos | Ícones de traço (Lucide, licença ISC), fonte Inter (OFL) embutida, avatares de busto em traje de trabalho com indicador de postura, certificações em estilo de credencial |

## O que sai

O Conselheiro sênior (agente, rotas e prompts), a Sala do Conselho (fluxo, `config/conselho.yaml`, tabelas), o selo "Ouviu a experiência", os emojis e qualquer menção a mentor sênior. As contribuições antigas, que tinham nome e entidade em texto aberto, serão **apagadas** na migração, não convertidas.

## Como o Banco de Vivências se liga ao MiroFish

1. A vivência entra pela entrada guiada → **mascaramento local** (regex + reconhecimento de entidades em português com spaCy + lista de cidades) → o contribuidor confere a versão mascarada → só ela é gravada. Nunca o original nem o áudio.
2. Depois da curadoria, as vivências aprovadas alimentam (a) cartões "O que a rede relata" nas pautas do mesmo tema; (b) **personas sintéticas** de stakeholders, cada uma composta de pelo menos 3 vivências e com nome fictício; (c) cenários gerados sob demanda do facilitador, que só entram no mandato depois de aprovados.
3. No MiroFish: as personas e os trechos mascarados entram no material-semente da tentativa. Antes de **todo** envio (ontologia, entrevista, chat) e de toda chamada ao LLM com texto do jogador, um **guarda** procura padrões de dados pessoais. Se encontrar, bloqueia o envio e registra só o motivo (o tipo de padrão, sem o conteúdo). O texto livre do jogador (decisão, chat, ensaio) passa pelo mesmo mascaramento.

## Riscos de LGPD identificados

1. **Mascaramento imperfeito:** o reconhecimento de entidades erra; por isso o contribuidor confere antes, há curadoria humana e o guarda roda antes de cada envio.
2. **Reidentificação por combinação:** perfil + história em cidade pequena. Mitigações: perfil só em faixas amplas, marcação de risco (casos "únicos demais") que bloqueia a aprovação, e personas só com 3 ou mais vivências.
3. **Voz:** o reconhecimento do navegador envia o áudio ao Google (Chrome). Não guardamos áudio, mas é preciso avisar e oferecer o texto.
4. **Original em trânsito:** o texto original passa pela memória do servidor local durante o mascaramento (não é gravado nem logado).
5. **Transferência internacional:** os textos mascarados vão à Anthropic (EUA); isso precisa constar no consentimento.
6. **Armazenamento e acesso:** SQLite sem criptografia e painel do facilitador protegido só por código. Mitigações: retenção definida, código de exclusão para o titular e senha de acesso no túnel.
7. **Ensaio:** decisões reais são sensíveis; por padrão ficam só no dispositivo e o servidor processa sem gravar.

## Plano (ordem pedida) e horas estimadas

| Etapa | Conteúdo | Horas |
|---|---|---|
| P1 | Paleta e variáveis CSS com AA, Inter embutida, ícones Lucide, avatares profissionais, PWA (manifest + service worker), abas, painel, painéis inferiores, Mesa do Orçamento com ano anterior, vocabulário executivo, remoção dos emojis | 9 |
| P3 | Remoção do conselheiro; Banco de Vivências (perfil, tipos, entrada guiada, mascaramento, consentimento, código de exclusão, curadoria com risco), 6 exemplos fictícios, guarda antes do MiroFish e do LLM, personas sintéticas, geração de cenário com aprovação, novas certificações | 10 |
| P4 | Ata Padronizada (7 seções) + consolidado; riscos com probabilidade × impacto, sinais de alerta; PDF institucional (jsPDF, MIT, embutido), CSV, copiar texto, offline | 7 |
| P2 | Sons sintetizados (Web Audio) nos momentos-chave, botão de som com volume salvo | 1,5 |
| P5 | Modo Ensaio: formulário guiado, mascaramento, simulação sem gravar (contingência), resultado como Ata; exemplo em cache | 4 |
| Final | Testes (incluindo o de mascaramento e o do payload do MiroFish), README, roteiro | 2,5 |
| **Total** | | **~34 h** |

**Limite do modo offline:** a interface, o último relatório e os rascunhos funcionam sem rede (service worker + armazenamento local). Jogar um trimestre novo precisa do servidor do jogo, mesmo sem o MiroFish; nesse caso, o cache da demonstração e a contingência continuam valendo.
