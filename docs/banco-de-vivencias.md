# Banco de Vivências: fluxo de dados e LGPD

O Banco de Vivências recebe relatos da rede: lideranças, equipes, associados, parceiros e poder público. Eles alimentam os cenários, as personas sintéticas de stakeholders e a simulação no MiroFish. A regra central: **só o texto mascarado é guardado, e só ele (ou material sintético derivado dele) sai do servidor**.

## 1. O que é coletado

| Dado | Como | Observação |
|---|---|---|
| Perfil em faixas amplas | Botões: papel (incluindo stakeholders), segmento, porte, região ampla, faixa de tempo na rede | Sem nome, CPF, CNPJ, telefone, e-mail, entidade ou cidade exata |
| Apelido (opcional) | Campo de texto | **Fica só no aparelho** (`localStorage`); nunca vai ao servidor |
| Tipo e tema | Botões | Devolutiva, relato de decisão, situação-problema ou percepção de stakeholder |
| Respostas | Uma pergunta por tela, por botões, voz ou texto | A voz é transcrita pelo próprio navegador (no Chrome, passa pelo Google). **O áudio não é gravado** |

## 2. Mascaramento (antes de gravar e antes de qualquer envio)

`orquestrador/app/mascaramento.py`, roda **no servidor do jogo**, sem chamar IA:

1. **Regex:** e-mail, URL, CPF, CNPJ, telefone, CEP, placa, data exata e endereço.
2. **NER em português** (spaCy `pt_core_news_sm`): pessoas, organizações e lugares, com regras contra falsos positivos.
3. **Heurísticas:** sufixos e prefixos de empresa (Ltda, ME, Padaria, Supermercado…) e lista de cidades bloqueadas.
4. **Substituição:** marcadores como `[Pessoa 1]`, `[Empresa 1]`, `[CPF]`, `[telefone]`; lugares viram região ("uma cidade do interior"); valores em reais viram faixas ("entre R$ 10 mil e R$ 50 mil").

Quem contribui **vê o texto mascarado e a lista do que foi trocado**, e pode editar antes de confirmar. Ao gravar, o servidor mascara de novo, porque não confia no que veio do navegador.

## 3. Consentimento e armazenamento

* Três confirmações separadas: **finalidade**, **retenção** (24 meses, `config/vivencias.yaml`) e **compartilhamento** (o texto mascarado pode ser processado pela Anthropic, nos EUA, e pelo simulador). A base legal (consentimento, LGPD art. 7º, I) aparece na tela. O servidor recusa o envio sem as três.
* Tabela `vivencias`: perfil em faixas, tipo, tema, respostas **mascaradas**, nível de risco, status e o **hash** do código de exclusão. O original não é gravado em lugar nenhum.
* **Código de exclusão** (`XXXX-XXXX-XXXX`): mostrado uma única vez. Quem contribuiu apaga a vivência em `/vivencias` → "Excluir uma contribuição", sem identificação.
* Vencidos os 24 meses, a vivência é apagada automaticamente quando o servidor inicia. "Apagar meus dados" remove as vivências ainda não aprovadas da sessão e desliga as aprovadas dela.

## 4. Curadoria

* Toda vivência entra **em revisão**. O facilitador aprova ou rejeita no painel.
* **Risco de reidentificação** calculado em código: caso "único demais" (o primeiro, o único…), muitas pessoas citadas, números exatos que sobraram ou dado pessoal restante. Com **risco alto, o botão de aprovar fica bloqueado** (também no servidor).

## 5. Usos

| Uso | Entrada | Saída |
|---|---|---|
| "O que a rede relata" na pauta | Até 3 vivências aprovadas do tema | Trechos mascarados com o perfil em faixas |
| Material-semente do MiroFish | Os mesmos trechos | Contexto da simulação, marcado como dado, nunca como instrução |
| Personas sintéticas | **3 ou mais** vivências aprovadas do mesmo grupo de papel | Persona com nome fictício que combina várias vivências (Claude Opus) |
| "Gerar cenário a partir de vivências" | Vivências aprovadas | Cenário **pendente de revisão**, com "Construído a partir de N vivências da rede" |
| Modo Ensaio | Decisão real do jogador, mascarada | Simulação com as personas do grupo; **nada fica no servidor** |

## 6. Guarda antes de cada envio

`mascaramento.guarda(texto, destino)` roda antes de **toda** chamada ao MiroFish (ontologia e material-semente, entrevista, conversa com o relatório) e antes das chamadas ao Claude com material do Banco (personas, cenários e ensaio). Se encontrar CPF, CNPJ, e-mail, telefone, CEP, placa ou cidade real:

* o envio é **bloqueado** (`EnvioBloqueado`);
* a tabela `bloqueios_envio` grava **só o destino e os tipos encontrados** (ex.: "MiroFish: cpf, telefone"), nunca o trecho;
* o facilitador vê os bloqueios no painel.

## 7. Resumo para o pitch

> Coletamos o relato em faixas, mascaramos no nosso servidor antes de gravar, mostramos o resultado a quem contribuiu e guardamos só a versão mascarada, com consentimento, prazo de 24 meses e código de exclusão. Um facilitador revisa cada relato, e o sistema impede aprovar o que tem risco alto de reidentificação. O MiroFish e o Claude só recebem texto mascarado ou personas sintéticas feitas de 3 ou mais relatos, e uma verificação automática bloqueia qualquer envio que ainda tenha dado pessoal.

Testes automáticos: `orquestrador/tests/test_vivencias.py` (nome, CPF, telefone, e-mail, empresa e cidade removidos; o payload do MiroFish não contém nenhum deles; o bloqueio é registrado sem o dado).
