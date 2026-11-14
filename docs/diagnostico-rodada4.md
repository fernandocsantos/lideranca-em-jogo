# Diagnóstico da rodada 4: "Legado", alinhado ao roteiro do pitch

Base: versão da rodada 3 (Banco de Vivências, Ata Padronizada, visual CACB, sons, Modo Ensaio). Integração com o MiroFish, fila, caches e contingência ficam como estão. A simulação ganha só material-semente novo: relato e interpretação, consulta, horas, justificativas, metas, expectativa e hipóteses.

## O que muda por tela

| Tela | Hoje | Depois |
|---|---|---|
| Abertura | 4 telas, frase longa | 3 telas (o que é, como funciona, o que ganha), marquee só aqui (estática com `prefers-reduced-motion`), slogan, selo "Demonstração com dados fictícios" |
| Perfil | Apelido + perfil de AC + roteiro | Apelido, papel, segmento, porte e avatar **ou "Entrar como Vanessa (demonstração)"**; perfil fica no aparelho |
| Painel | Indicadores + lista do mandato | Associação (2 linhas), indicadores, "Seu Mandato" com trilha numerada ("1. O corte de R$ 6.000"), status, Jogar, Recomeçar do zero, Ver plano; acesso destacado ao Banco |
| Missão | Pauta → Mesa → Decisão → Ata → Resultado | **Barra de 5 etapas**: Pauta (fala do Otávio, R$ 30 mil → R$ 24 mil, horas) → **Relatos** (Helena, interpretação, "Consultar os associados") → **Mesa de decisões** (R$ e horas, alternativa online, justificativa por corte, alternativas A/B/C e comparação) → **Ata** (justificativa, metas, expectativa, indicadores sugeridos, hipóteses) → **Resultado** |
| Resultado | Indicadores, previsão, devolutiva, conversa | **Carimbo** SUCESSO / PARCIAL / FRACASSO com motivo, Prioridades, Orçamento planejado × executado, Resultados, "O que mais pesou" e "O que menos pesou", até 4 balões, riscos, feedback do relato, **Desempenho acadêmico A–D**, conversa, "Experimentar outro caminho", revisão humana |
| Relatório | Ata 7 seções | **"Plano de decisão — Legado"**: resumo em tópicos, 8 seções por missão, desempenho consolidado, PDF, CSV, Copiar texto |
| Fim da jornada | Relatório | Carimbo geral, certificações, slogan, **"Deixe seu legado"** |
| Vivências | Fluxo guiado | Selo fixo "Tudo o que você escrever será anonimizado…", prévia lado a lado original × anonimizado |
| Facilitador | Código | **PIN**, revisão humana das simulações, CSV da checagem antes × depois |
| Ensaio | Modo Ensaio | **Modo Reunião** (fonte maior) |
| Sobre | não existe | CACB: ~2 milhões de empreendedores, +2.300 associações (jun/2026), "Esse conhecimento merece atravessar mandatos." |

**Transversal:** componente `Ator` ("Nome (função)") em telas, chat, PDF e textos de IA, com pós-processamento e teste automatizado; Recomeçar, Desfazer e Reiniciar com diálogo próprio; cartão "Recapitulando"; 9 certificações; carimbos com som; linguagem visual do brief em cores CACB.

## Plano (horas estimadas, na ordem pedida)

| # | Etapa | h |
|---|---|---|
| P1 | Cenário 1 do pitch: Vanessa, Otávio, Helena; R$ 30 mil → R$ 24 mil; pedidos de 18/14/8 mil; 120 h de equipe (60/40/50 h); alternativa online | 3 |
| P2 | Fluxo de 5 telas; relatos como exercício; Mesa com horas, alternativas A/B/C e corte justificado; Ata nova | 7 |
| P3 | Hipóteses, carimbo determinístico, mais/menos pesou, desempenho A–D, revisão humana, outro caminho, modo offline | 5 |
| P4 | `Ator` + pós-processamento + teste | 2 |
| P6 | Plano de decisão (PDF/CSV/texto) | 3 |
| P5 | Recomeçar, Desfazer, Reiniciar, Recapitulando | 2 |
| — | Identidade "Legado" e tela Sobre | 1 |
| P11 + P10 | Abertura, perfil, painel; linguagem visual | 4 |
| P8 + P9 + P12 | Deixe seu legado; ajustes no Banco e PIN; certificações e carimbos | 3 |
| P7 + P13 | Checagem antes e depois; Modo Reunião | 2 |
| — | README, roteiro, tabela pitch → app, testes | 2 |
| | **Total** | **≈ 34 h** |

## Riscos e decisões

* **Contas do cenário 1:** o pitch diz que o orçamento caiu de R$ 30 mil para R$ 24 mil, e os pedidos somam R$ 40 mil (18 + 14 + 8). A Mesa começa nos pedidos e mostra "Falta cortar R$ 16.000". Horas: 120 h, menos 10 h se consultar os associados, contra 150 h pedidas (60 + 40 + 50); as horas caem na proporção da verba. A formação online e noturna custa R$ 8 mil e 20 h.
* **Fala do pitch "Na evolução proposta…":** no app, a simulação por agentes já é central (pedido da rodada). A narração é de vocês; recomendo ajustá-la para o presente.
* **Cache da demo:** os prompts e o material-semente mudam. Refaça o cache com tudo ligado antes de apresentar; sem isso, o roteiro roda no modo offline (cálculo por regras), sinalizado na tela.
* **Brief "Depo Budget":** não veio em anexo. Uso a descrição do prompt (contornos 2–3 px, sombra sólida, etiquetas mono em caixa alta etc.) sem copiar nada do Depo.
* **Cortes, se faltar tempo:** layout de projeção do Modo Reunião → checagem P7 → grade e marquee → 3ª alternativa.
