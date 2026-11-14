# Continuar o desenvolvimento (passagem de contexto)

Leia este arquivo e o [README](../README.md) antes de começar. Estado em **14/11/2026**.

## 1. Estado atual

* **Branch:** `feat/rodada3-cacb`, ainda **não mesclado** no `main`. O `main` tem a rodada 2 (versão CACB) e a publicação por túnel.
* **Rodada 3 (pedido do desafio CACB), um commit por etapa:**

| Etapa | Commit | O que entregou |
|---|---|---|
| P1 | `eb9e449`, `fc07385` | Identidade CACB (paleta em variáveis CSS, Inter, Lucide, avatares de busto), PWA, barra de abas, Painel, Mesa do Orçamento |
| P3 | `997e226` | Fim do conselheiro sênior; Banco de Vivências com mascaramento e LGPD |
| P4 | `c59c013` | Ata Padronizada (7 seções), PDF institucional e CSV |
| P2 | `da27d7c` | Efeitos sonoros com mudo e volume salvos |
| P5 | `512bd33` | Modo Ensaio: decisão real mascarada, resultado só no aparelho, exemplo offline |
| — | `f1f762b`, `da044c6` | Roteiro da demo com as novas etapas da Ata; documentação |
| — | (este commit) | Correção do Zep (PascalCase), `.gitattributes`, este arquivo |

* **Testes:** 62 passando (`cd orquestrador && .venv/bin/python -m pytest -q`).
* **Documentos:** [arquitetura](arquitetura.md), [Banco de Vivências e LGPD](banco-de-vivencias.md), [identidade visual](identidade-visual.md), [diagnóstico da rodada 3](diagnostico-rodada3.md), [testes para o pitch](pitch-testes.md).

## 2. Pendências (em ordem de prioridade)

1. **Refazer o cache da demo** com as chaves reais: jogue o roteiro uma vez com tudo ligado. Os prompts mudaram na rodada 3, então o cache antigo não serve.
2. **Testar o PWA no Chrome de verdade** (computador e celular): instalar e abrir sem internet. No navegador embutido do app do Claude o service worker não registra; não foi possível confirmar.
3. **MiroFish ao vivo no Modo Ensaio.** Hoje o ensaio usa simulação direta pelo Claude Opus (`orquestrador/app/ensaio.py`), com aviso na tela. Próximo passo: usar o mesmo pipeline de `simulacao.py`, com as personas do Banco no material-semente.
4. **Merge** de `feat/rodada3-cacb` no `main` e republicação do túnel. **Só com pedido explícito do Fernando.**
5. Validação com pessoas reais (ver [pitch-testes.md](pitch-testes.md)): tempo por trimestre, clareza da Ata e voz com pessoas idosas.

## 3. Problemas conhecidos

* **Zep exige PascalCase (desde 13/11/2026).** O agente de ontologia do MiroFish às vezes gera "Vice_President", e o Zep recusa o grafo (HTTP 400); o jogo então cai na simulação simplificada. **Corrigido** por `mirofish/patches/ontology_generator.py`, montado no `docker-compose.yml`, que normaliza os nomes. É uma modificação do MiroFish (AGPL-3.0): fica no repositório. Se a imagem `ghcr.io/666ghj/mirofish:latest` mudar, compare o arquivo com o original antes de atualizar (o cabeçalho do patch indica a versão de origem).
* O MiroFish leva **cerca de 90 s** para voltar depois de reiniciado. Nesse intervalo o jogo usa a simulação simplificada.
* O MiroFish cria agentes genéricos extras e escreve as personas internas em chinês. Isso não aparece para o jogador.

## 4. Regras do projeto (combinadas com o Fernando)

* **Nunca** versionar o `.env` nem repetir valores de chaves e senhas no chat ou em arquivos. A `ACESSO_SENHA` fica só no `.env`.
* As chaves ficam só no servidor, nunca no navegador.
* **Commit, merge e push só quando o Fernando pedir.** Um commit por etapa.
* Só informações públicas ou fictícias. Nenhum agente representa pessoa real identificável. Nada de registros internos de entidades.
* LGPD: dado mínimo. Mascarar **antes** de gravar e **antes** de enviar a qualquer IA ou ao MiroFish (`mascaramento.guarda`).
* Visual: sem emojis como ícones, sem confete, sem XP ou sequência de dias. Cores só pelas variáveis `--cacb-*` (contraste AA).
* Não reintroduzir o conselheiro sênior nem a Sala do Conselho.
* Textos em português do Brasil, vocabulário executivo: Mandato, Pauta, Mesa do Orçamento, Ata da decisão, Painel, Relatório de gestão, Certificações de competência.
* LLM: Claude Haiku 5.5 nos agentes do MiroFish, na moderação e na conversa; Claude Opus 5.5 em sinais, devolutiva, ficcionalização, personas, contingência e ensaio (`config/llm.yaml`). Orçamento: R$ 100 por mês.

## 5. Levar para outra máquina

O Git leva o código. **Não** leva:

* o `.env`: copie à mão por um meio seguro (pendrive, gerenciador de senhas), nunca por e-mail ou chat aberto;
* o banco e os caches do jogo (volume `lideranca-em-jogo_dados-jogo`) e os projetos do MiroFish (volume `lideranca-em-jogo_mirofish-uploads`).

O repositório não tem remoto configurado. Crie um privado (GitHub ou GitLab) e faça push, ou copie a pasta inteira.

Para levar também o banco e o cache da demo (opcional), na máquina de origem:

```bash
docker run --rm -v lideranca-em-jogo_dados-jogo:/d -v "$PWD":/b alpine tar czf /b/dados-jogo.tgz -C /d .
```

Na máquina nova, antes do primeiro `docker compose up`:

```bash
docker volume create lideranca-em-jogo_dados-jogo
```

```bash
docker run --rm -v lideranca-em-jogo_dados-jogo:/d -v "$PWD":/b alpine tar xzf /b/dados-jogo.tgz -C /d
```

O arquivo `dados-jogo.tgz` contém as vivências mascaradas e as sessões: trate como dado pessoal (não publique e apague depois de usar).

## 6. Windows (WSL 2)

Funciona, desde que tudo rode **dentro do WSL 2 (Ubuntu)**.

1. Instale o **WSL 2** com Ubuntu (no PowerShell como administrador):

```powershell
wsl --install -d Ubuntu
```

2. Instale o **Docker Desktop** e ative "Use the WSL 2 based engine" e, em *Resources → WSL integration*, a integração com o Ubuntu.
3. **No terminal do Ubuntu**, clone ou copie o projeto para o sistema de arquivos do Linux (`~/Projetos/lideranca-em-jogo`), **não** para `C:\` nem `/mnt/c`: lá o Docker e o Git ficam bem mais lentos.
4. Confirme que o Git não converte fins de linha (o `.gitattributes` já força LF, mas confira):

```bash
git config --global core.autocrlf input
```

5. Copie o `.env` para a raiz do projeto e suba:

```bash
docker compose up -d --build
```

6. Abra http://localhost:8000 no navegador do Windows. O WSL repassa a porta.
7. `./publicar.sh` roda no terminal do Ubuntu (não no PowerShell).
8. Modo demonstração sem Docker: os comandos do README valem **dentro do WSL**. Instale antes o Python e o venv:

```bash
sudo apt install -y python3 python3-venv
```

Sintomas de CRLF: `$'\r': command not found` ao rodar `./publicar.sh`, ou `bad interpreter`. Correção, **só com a árvore limpa** (sem alterações não commitadas, porque o comando descarta as alterações locais):

```bash
git add --renormalize . && git checkout -- .
```

**Claude Code no Windows:** pode rodar no app desktop ou no terminal do WSL. Abra a pasta do projeto pelo caminho do WSL (`\\wsl$\Ubuntu\home\<usuário>\Projetos\lideranca-em-jogo` no app, ou `cd ~/Projetos/lideranca-em-jogo && claude` no terminal). A primeira mensagem sugerida: "leia `docs/continuar.md` e o README antes de começar".

## 7. Comandos úteis

| Para quê | Comando |
|---|---|
| Testes | `cd orquestrador && .venv/bin/python -m pytest -q` |
| Demo sem chaves (porta 8010) | `cd orquestrador && LLM_FALSO=true MIROFISH_DESATIVADO=true FACILITADOR_CODIGO=demo .venv/bin/uvicorn app.main:app --port 8010` |
| Reconstruir o orquestrador | `docker compose up -d --build orquestrador` |
| Logs do jogo | `docker logs --tail 50 lej-orquestrador` |
| Logs do MiroFish | `docker logs --tail 50 lej-mirofish` |
| Desligar o MiroFish (testar contingência) | `docker compose stop mirofish` |
| Endereço do túnel | `./publicar.sh endereco` |
