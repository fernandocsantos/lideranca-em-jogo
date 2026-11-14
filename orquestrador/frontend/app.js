/* Liderança em Jogo — SPA sem dependências. Todo texto dinâmico entra via textContent (sem innerHTML). */
"use strict";

const estado = { cfg: null, token: localStorage.getItem("lej_token"), apelido: localStorage.getItem("lej_apelido"),
  campanhaId: localStorage.getItem("lej_campanha"), campanha: null, tentativaAtual: null, timer: null,
  esclarecimentos: [] };

const POSTURA = { "-2": "hostil", "-1": "desconfiada", "0": "neutra", "1": "favorável", "2": "aliada" };
const TIPOS = { associado: "Associado", diretoria: "Diretoria", conselho: "Conselho", funcionarios: "Equipe",
  poder_publico: "Poder público", imprensa: "Imprensa", sindicato: "Sindicato", consumidores: "Comunidade",
  entidade_concorrente: "Outra entidade", federacao: "Federação", parceiro: "Parceiro" };

// ------------------------------------------------------------------ utilidades
function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "class") n.className = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false)
    n.append(f instanceof Node ? f : document.createTextNode(String(f)));
  return n;
}
const $ = (s) => document.querySelector(s);
const main = () => $("#conteudo");

function tela(titulo, ...conteudo) {
  clearInterval(estado.timer);
  const m = main();
  m.replaceChildren(el("h1", { id: "titulo-tela" }, titulo), ...conteudo.flat().filter((c) => c !== null && c !== undefined && c !== ""));
  document.title = `${titulo} — Liderança em Jogo`;
  m.focus();
  window.scrollTo(0, 0);
}

async function api(caminho, opcoes = {}) {
  const headers = { "Content-Type": "application/json", ...(opcoes.headers || {}) };
  if (estado.token) headers["X-Sessao"] = estado.token;
  const r = await fetch(caminho, { ...opcoes, headers, body: opcoes.body ? JSON.stringify(opcoes.body) : undefined });
  if (!r.ok) {
    let msg = `Erro ${r.status}`;
    try { const j = await r.json(); msg = typeof j.detail === "string" ? j.detail : (j.detail?.[0]?.msg || msg); } catch (_) {}
    const e = new Error(msg); e.status = r.status; throw e;
  }
  return r.headers.get("content-type")?.includes("json") ? r.json() : r.text();
}

function mostrarErro(container, e) {
  const caixa = el("div", { class: "erro", role: "alert" }, e.message || String(e));
  container.prepend(caixa);
  caixa.scrollIntoView({ block: "center" });
}

function delta(v) {
  if (v === null || v === undefined) return el("span", {}, "—");
  const n = Number(v);
  if (n > 0) return el("span", { class: "delta-pos" }, `▲ +${n.toFixed(1)}`);
  if (n < 0) return el("span", { class: "delta-neg" }, `▼ ${n.toFixed(1)}`);
  return el("span", { class: "suave" }, "= 0");
}

// ------------------------------------------------------------------ indicadores
function renderIndicadores(valores, variacao) {
  const sec = $("#indicadores");
  if (!valores) { sec.hidden = true; return; }
  sec.hidden = false;
  sec.replaceChildren(...estado.cfg.indicadores.map((i) => {
    const v = Number(valores[i.id] ?? 0);
    return el("div", { class: "indicador", title: i.descricao },
      el("div", { class: "nome" }, i.nome),
      el("div", { class: "valor" }, v.toFixed(0), " ", variacao ? delta(variacao[i.id]) : ""),
      el("div", { class: "barra", role: "meter", "aria-valuemin": 0, "aria-valuemax": 100,
        "aria-valuenow": v.toFixed(0), "aria-label": `${i.nome}: ${v.toFixed(0)} de 100` },
        el("span", { style: `width:${Math.max(0, Math.min(100, v))}%` })));
  }));
}

async function verificarStatus() {
  try {
    const s = await api("/api/status");
    $("#faixa-status").replaceChildren(s.mirofish ? "" : el("div", { class: "aviso", style: "max-width:980px;margin:.75rem auto" },
      "Aviso: o simulador multiagente (MiroFish) está indisponível. O jogo continua em modo de contingência, ",
      "com simulações simplificadas feitas diretamente por um modelo de linguagem."));
  } catch (_) { /* silencioso */ }
}

// ------------------------------------------------------------------ boas-vindas
function telaInicio() {
  renderIndicadores(null);
  const campo = el("input", { type: "text", id: "apelido", maxlength: 40, autocomplete: "nickname",
    value: estado.apelido || "", "aria-describedby": "dica-apelido" });
  const form = el("form", { class: "cartao", onsubmit: async (ev) => {
    ev.preventDefault();
    try {
      const r = await api("/api/sessoes", { method: "POST", body: { apelido: campo.value } });
      estado.token = r.token; estado.apelido = r.apelido;
      localStorage.setItem("lej_token", r.token); localStorage.setItem("lej_apelido", r.apelido);
      await novaCampanha();
    } catch (e) { mostrarErro(form, e); }
  } },
    el("label", { for: "apelido" }, "Como quer ser chamado(a)?"),
    campo,
    el("p", { id: "dica-apelido", class: "suave pequeno" },
      "Use um apelido — não precisa ser seu nome. Não pedimos e-mail nem outros dados pessoais (LGPD)."),
    el("button", { type: "submit" }, "Começar uma campanha"));
  const continuar = estado.token && estado.campanhaId
    ? el("p", {}, el("button", { class: "secundario", onclick: () => abrirCampanha(estado.campanhaId) }, "Continuar a campanha em andamento"))
    : null;
  tela("Você na presidência da associação",
    el("p", {}, "Neste jogo você lidera uma associação comercial fictícia do interior paulista. A cada cenário — ",
      "inspirado em problemas reais do comércio — você escreve a sua decisão. Agentes de IA que representam associados, ",
      "diretoria, prefeitura, imprensa e outros atores reagem, e você vê os efeitos nos indicadores da associação."),
    el("p", {}, "Não existe resposta única certa: a devolutiva mostra trade-offs, riscos e perguntas para reflexão."),
    continuar, form);
}

async function novaCampanha() {
  const c = await api("/api/campanhas", { method: "POST" });
  estado.campanhaId = c.id; localStorage.setItem("lej_campanha", c.id);
  estado.campanha = c;
  telaCenario();
}

async function abrirCampanha(id) {
  try {
    estado.campanha = await api(`/api/campanhas/${id}`);
    const pendente = estado.campanha.tentativas.find((t) => t.status === "na_fila" || t.status === "executando");
    if (estado.campanha.status === "concluida") return telaFinal();
    if (pendente) return telaEspera(pendente.id);
    telaCenario();
  } catch (e) {
    if (e.status === 401 || e.status === 404) { localStorage.removeItem("lej_campanha"); estado.campanhaId = null; telaInicio(); }
    else alert(e.message);
  }
}

// ------------------------------------------------------------------ cenário + decisão
function blocoCenario(c) {
  const a = c.associacao;
  return el("div", {},
    el("p", { class: "linha" }, el("span", { class: "etiqueta" }, `Dificuldade ${c.dificuldade} de 3`),
      el("span", { class: "etiqueta" }, `Tema: ${c.tema.replaceAll("_", " ")}`)),
    el("div", { class: "cartao" },
      el("h2", {}, a.nome),
      el("p", {}, `${a.cidade} · porte ${a.porte} · ${a.associados} associados`),
      el("p", {}, el("strong", {}, "Situação financeira: "), a.situacao_financeira)),
    ...c.texto.split(/\n\n+/).map((p) => el("p", {}, p)),
    el("h2", {}, "Restrições"), el("ul", {}, c.restricoes.map((r) => el("li", {}, r))),
    el("h2", {}, "O que está em jogo"), el("p", {}, c.em_jogo),
    el("h2", {}, "Quem está envolvido"),
    el("ul", { class: "atores", role: "list" }, c.atores.map((t) => el("li", { class: "ator" },
      el("div", { class: "tipo" }, TIPOS[t.tipo] || t.tipo),
      el("strong", {}, t.nome), el("div", { class: "pequeno" }, t.papel),
      el("div", { class: "pequeno suave" }, `Influência ${t.influencia}/5 · postura inicial: ${POSTURA[t.postura_inicial]}`)))),
    c.inspirado_em ? el("p", { class: "suave pequeno" }, "Inspirado em: ",
      el("a", { href: c.inspirado_em.url, rel: "noopener", target: "_blank" }, c.inspirado_em.titulo),
      ` — ${c.inspirado_em.veiculo}, ${c.inspirado_em.data}. Nomes de pessoas, empresas e cidades foram trocados por fictícios.`) : null);
}

function telaCenario(decisaoInicial = "") {
  const camp = estado.campanha;
  renderIndicadores(camp.indicadores);
  if (camp.status === "concluida") return telaFinal();
  const c = camp.cenario;
  const lim = estado.cfg.decisao;
  estado.esclarecimentos = [];
  const area = el("textarea", { id: "decisao", maxlength: lim.max_caracteres, "aria-describedby": "dica-decisao contador" });
  area.value = decisaoInicial;
  const contador = el("div", { id: "contador", class: "contador", "aria-live": "polite" });
  const atualiza = () => { contador.textContent = `${area.value.length} de ${lim.max_caracteres} caracteres`; };
  area.addEventListener("input", atualiza); atualiza();
  const sim = estado.cfg.simulacao;
  const rodadas = el("input", { type: "range", id: "rodadas", min: 3, max: sim.max_rodadas, value: sim.rodadas_padrao,
    "aria-describedby": "valor-rodadas" });
  const valorR = el("span", { id: "valor-rodadas" }, `${sim.rodadas_padrao} rodadas`);
  rodadas.addEventListener("input", () => { valorR.textContent = `${rodadas.value} rodadas`; });
  const perguntas = el("div", { id: "perguntas" });
  const botao = el("button", { type: "submit" }, "Revisar e enviar decisão");
  const form = el("form", { class: "cartao", onsubmit: async (ev) => {
    ev.preventDefault();
    form.querySelectorAll(".erro").forEach((n) => n.remove());
    // recolhe respostas de esclarecimento já exibidas
    const respostas = [...perguntas.querySelectorAll("textarea")];
    if (respostas.length) {
      if (respostas.some((r) => !r.value.trim())) return mostrarErro(form, new Error("Responda às perguntas de esclarecimento."));
      estado.esclarecimentos.push(...respostas.map((r) => ({ pergunta: r.dataset.pergunta, resposta: r.value.trim() })));
      perguntas.replaceChildren();
    }
    botao.disabled = true; botao.textContent = "Analisando a decisão…";
    try {
      const corpo = { decisao: area.value, esclarecimentos: estado.esclarecimentos, rodadas: Number(rodadas.value) };
      const av = await api(`/api/campanhas/${camp.id}/decisoes/avaliar`, { method: "POST", body: corpo });
      if (!av.permitido) throw new Error(av.motivo);
      if (!av.simulavel && av.perguntas.length) {
        perguntas.replaceChildren(el("div", { class: "aviso", role: "status" },
          el("p", {}, el("strong", {}, "Antes de simular, precisamos entender melhor sua decisão:")),
          ...av.perguntas.map((p, i) => el("div", {},
            el("label", { for: `esc-${i}` }, p),
            el("textarea", { id: `esc-${i}`, "data-pergunta": p, style: "min-height:80px", maxlength: 600 })))));
        perguntas.querySelector("textarea").focus();
        botao.textContent = "Responder e continuar";
        botao.disabled = false;
        return;
      }
      const r = await api(`/api/campanhas/${camp.id}/tentativas`, { method: "POST", body: corpo });
      telaEspera(r.tentativa_id);
    } catch (e) { mostrarErro(form, e); botao.disabled = false; botao.textContent = "Revisar e enviar decisão"; }
  } },
    el("h2", {}, "Sua decisão"),
    el("label", { for: "decisao" }, "O que você decide e por quê?"),
    el("p", { id: "dica-decisao", class: "suave pequeno" },
      "Diga o que será feito, quem será envolvido, como e quando, e o porquê. Escreva como presidente da associação. ",
      `Mínimo de ${lim.min_caracteres} caracteres.`),
    area, contador,
    el("label", { for: "rodadas" }, "Duração da simulação"), rodadas, " ", valorR,
    el("p", { class: "suave pequeno" }, "Mais rodadas = mais interação entre os agentes, mais tempo de espera e mais custo."),
    perguntas, botao);
  const tentativas = camp.tentativas.filter((t) => t.status === "concluida");
  tela(`Cenário ${camp.indice_atual + 1} de ${camp.total}: ${c.titulo}`, blocoCenario(c),
    tentativas.length ? el("div", { class: "aviso" }, `Você já tem ${tentativas.length} tentativa(s) neste cenário. `,
      el("button", { class: "secundario", onclick: () => telaResultado(tentativas.at(-1).id) }, "Ver última tentativa")) : null,
    form);
}

// ------------------------------------------------------------------ espera
function telaEspera(tid) {
  const barra = el("progress", { max: 100, value: 0, "aria-labelledby": "etapa" });
  const etapa = el("p", { id: "etapa", "aria-live": "polite" }, "Enviando…");
  const fila = el("p", { class: "suave" });
  const aviso = el("div", {});
  const feed = el("ul", { class: "feed", "aria-label": "Reações parciais dos agentes" });
  tela("Simulando as reações", etapa, barra, fila, aviso,
    el("h2", {}, "O que os agentes estão fazendo"), feed,
    el("p", { class: "suave pequeno" }, "A simulação pode levar alguns minutos. Você pode sair e voltar depois: o progresso fica salvo."));
  let ultimaEtapa = "";
  const tick = async () => {
    try {
      const t = await api(`/api/tentativas/${tid}`);
      barra.value = t.progresso || 0;
      if (t.etapa !== ultimaEtapa) { etapa.textContent = `${t.etapa || "Aguardando"} (${t.progresso || 0}%)`; ultimaEtapa = t.etapa; }
      fila.textContent = t.posicao_fila ? `Posição na fila: ${t.posicao_fila}` : "";
      aviso.replaceChildren(t.aviso ? el("div", { class: "aviso", role: "status" }, t.aviso) : "");
      feed.replaceChildren(...(t.parciais || []).map((p) => el("li", {},
        el("strong", {}, p.autor), p.rodada ? ` (rodada ${p.rodada})` : "", ": ", p.texto || p.tipo)));
      if (t.status === "concluida") { clearInterval(estado.timer); telaResultado(tid); }
      if (t.status === "erro") { clearInterval(estado.timer); mostrarErro(main(), new Error(t.erro));
        main().append(el("button", { onclick: () => abrirCampanha(estado.campanhaId) }, "Voltar ao cenário")); }
    } catch (e) { etapa.textContent = `Falha ao consultar o progresso: ${e.message}`; }
  };
  tick();
  estado.timer = setInterval(tick, 2500);
}

// ------------------------------------------------------------------ resultado
async function telaResultado(tid) {
  const t = await api(`/api/tentativas/${tid}`);
  estado.tentativaAtual = t;
  const r = t.resultado, ind = r.indicadores, dev = r.devolutiva;
  renderIndicadores(ind.depois, ind.variacao);
  const nomeInd = Object.fromEntries(estado.cfg.indicadores.map((i) => [i.id, i.nome]));
  const abas = [
    ["Resultado", () => el("div", {},
      el("h2", {}, "O que aconteceu"), el("p", {}, r.resumo),
      el("h2", {}, "Impacto nos indicadores"),
      el("table", {}, el("caption", { class: "suave" }, "Valores de 0 a 100"),
        el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Indicador"), el("th", { scope: "col" }, "Antes"),
          el("th", { scope: "col" }, "Depois"), el("th", { scope: "col" }, "Variação"))),
        el("tbody", {}, Object.keys(ind.depois).map((k) => el("tr", {}, el("th", { scope: "row" }, nomeInd[k]),
          el("td", {}, Number(ind.antes[k]).toFixed(0)), el("td", {}, Number(ind.depois[k]).toFixed(0)),
          el("td", {}, delta(ind.variacao[k])))))),
      el("details", { class: "cartao" }, el("summary", {}, "Como calculamos (auditoria)"),
        el("p", { class: "pequeno suave" }, "Um modelo de linguagem extrai sinais da simulação; a conversão em pontos é feita por regras fixas e públicas (config/indicadores.yaml)."),
        el("table", { class: "pequeno" }, el("thead", {}, el("tr", {}, ["Regra", "Indicador", "Pontos", "Detalhe"].map((h) => el("th", { scope: "col" }, h)))),
          el("tbody", {}, ind.auditoria.map((a) => el("tr", {}, el("td", {}, a.regra), el("td", {}, nomeInd[a.indicador]),
            el("td", {}, a.pontos), el("td", {}, a.detalhe, a.evidencia ? el("div", { class: "suave" }, a.evidencia) : "")))))),
      el("h2", {}, "Reações dos principais atores"),
      el("ul", { class: "atores", role: "list" }, r.reacoes.map((x) => el("li", { class: "ator" },
        el("div", { class: "tipo" }, TIPOS[x.tipo] || x.tipo), el("strong", {}, x.nome),
        el("div", { class: "pequeno" }, `Postura: ${POSTURA[x.postura_inicial]} → ${POSTURA[x.postura_final]}`),
        el("p", { class: "pequeno" }, x.reacao), x.citacao ? el("blockquote", { class: "pequeno" }, `“${x.citacao}”`) : "")))) ],
    ["Devolutiva", () => el("div", {},
      el("h2", {}, "Competências"),
      el("table", {}, el("thead", {}, el("tr", {}, ["Competência", "Nível", "Evidência"].map((h) => el("th", { scope: "col" }, h)))),
        el("tbody", {}, dev.competencias.map((c) => el("tr", {}, el("th", { scope: "row" }, c.nome),
          el("td", {}, c.nivel ? `${c.nivel} — ${c.nivel_nome}` : c.nivel_nome, el("div", { class: "pequeno suave" }, c.descritor)),
          el("td", {}, c.evidencia))))),
      lista("Pontos fortes", dev.pontos_fortes), lista("Riscos ignorados", dev.riscos_ignorados),
      lista("Atores não considerados", dev.atores_nao_considerados),
      dev.atores_nao_mencionados?.length ? el("p", { class: "suave pequeno" }, "Não mencionados na sua decisão: ", dev.atores_nao_mencionados.join(", "), ".") : "",
      lista("Trade-offs", dev.trade_offs),
      el("h2", {}, "Para refletir"), el("ol", {}, dev.perguntas_reflexivas.map((p) => el("li", {}, p))),
      el("p", {}, el("button", { class: "secundario", onclick: () => window.print() }, "Imprimir / salvar em PDF"))) ],
    ["Conversar", () => painelConversa(t)],
    ["Comparar tentativas", () => painelComparar()],
  ];
  const corpo = el("div", { id: "painel-aba", role: "tabpanel", tabindex: 0 });
  const botoes = abas.map(([nome, f], i) => el("button", { role: "tab", "aria-selected": i === 0 ? "true" : "false", id: `aba-${i}`,
    "aria-controls": "painel-aba", onclick: async (ev) => {
      botoes.forEach((b) => b.setAttribute("aria-selected", "false"));
      ev.currentTarget.setAttribute("aria-selected", "true");
      corpo.setAttribute("aria-labelledby", ev.currentTarget.id);
      corpo.replaceChildren(await f());
    } }, nome));
  corpo.setAttribute("aria-labelledby", "aba-0");
  corpo.replaceChildren(await abas[0][1]());
  const camp = estado.campanha;
  tela("Resultado da simulação",
    t.modo === "contingencia" ? el("div", { class: "aviso", role: "status" }, t.aviso) : null,
    el("details", { class: "cartao" }, el("summary", {}, "Sua decisão"), el("p", {}, t.decisao),
      t.esclarecimentos.map((e) => el("p", { class: "pequeno" }, el("strong", {}, e.pergunta), " ", e.resposta))),
    el("div", { class: "abas", role: "tablist", "aria-label": "Seções do resultado" }, botoes), corpo,
    el("div", { class: "cartao" },
      el("h2", {}, "E agora?"),
      el("p", {}, "Você pode refazer a decisão (os indicadores voltam ao estado anterior a este cenário) ou seguir com esta tentativa."),
      el("button", { class: "secundario", onclick: async () => { estado.campanha = await api(`/api/campanhas/${camp.id}`); telaCenario(t.decisao); } }, "Refazer a decisão"),
      el("button", { onclick: async () => {
        try { estado.campanha = await api(`/api/campanhas/${camp.id}/avancar`, { method: "POST", body: { tentativa_id: t.id } });
          estado.campanha.status === "concluida" ? telaFinal() : telaCenario(); } catch (e) { mostrarErro(main(), e); } } },
        camp.indice_atual + 1 >= camp.total ? "Concluir a campanha com esta tentativa" : "Avançar com esta tentativa"),
      el("p", { class: "suave pequeno" }, `Custo desta tentativa: R$ ${t.custo.total_brl.toFixed(2)} (inclui estimativa do simulador).`)));
}

function lista(titulo, itens) {
  if (!itens || !itens.length) return "";
  return el("div", {}, el("h2", {}, titulo), el("ul", {}, itens.map((i) => el("li", {}, i))));
}

async function painelConversa(t) {
  const cen = estado.campanha.cenario;
  const sel = el("select", { id: "interlocutor" },
    el("option", { value: "relatorio" }, "Agente de relatório (análise da simulação)"),
    cen.atores.map((a) => el("option", { value: a.id }, `${a.nome} — ${TIPOS[a.tipo] || a.tipo}`)));
  const log = el("div", { class: "chat", role: "log", "aria-live": "polite", "aria-label": "Conversa" });
  const campo = el("input", { type: "text", id: "msg", maxlength: 800, placeholder: "Ex.: Por que você votou contra?" });
  const enviar = el("button", { type: "submit" }, "Enviar");
  const carregar = async () => {
    const h = await api(`/api/tentativas/${t.id}/conversa?interlocutor=${encodeURIComponent(sel.value)}`);
    log.replaceChildren(...h.mensagens.map((m) => el("div", { class: `msg ${m.papel}` }, m.conteudo)));
    log.scrollTop = log.scrollHeight;
  };
  sel.addEventListener("change", carregar);
  const form = el("form", { onsubmit: async (ev) => {
    ev.preventDefault();
    if (!campo.value.trim()) return;
    form.querySelectorAll(".erro").forEach((n) => n.remove());
    const texto = campo.value; campo.value = ""; enviar.disabled = true;
    log.append(el("div", { class: "msg jogador" }, texto), el("div", { class: "msg agente suave", id: "digitando" }, "…"));
    try {
      const r = await api(`/api/tentativas/${t.id}/conversa`, { method: "POST", body: { interlocutor: sel.value, mensagem: texto } });
      $("#digitando")?.remove();
      log.append(el("div", { class: "msg agente" }, r.resposta,
        r.fonte === "contingencia" ? el("div", { class: "pequeno suave" }, "(resposta gerada com a memória resumida da simulação)") : ""));
      dica.textContent = `Mensagens restantes nesta tentativa: ${r.restantes}`;
    } catch (e) { $("#digitando")?.remove(); mostrarErro(form, e); }
    enviar.disabled = false; log.scrollTop = log.scrollHeight; campo.focus();
  } }, el("label", { for: "msg" }, "Sua mensagem"), el("div", { class: "linha" }, campo, enviar));
  const dica = el("p", { class: "suave pequeno" });
  await carregar();
  return el("div", {}, el("label", { for: "interlocutor" }, "Conversar com"), sel,
    el("p", { class: "suave pequeno" }, "Os agentes respondem de acordo com a persona e com o que viveram na simulação."), log, form, dica);
}

async function painelComparar() {
  const camp = estado.campanha;
  const r = await api(`/api/campanhas/${camp.id}/comparar?indice=${camp.indice_atual}`);
  if (r.tentativas.length < 2) return el("p", {}, "Faça outra tentativa (\"Refazer a decisão\") para comparar resultados lado a lado.");
  const nomes = estado.cfg.indicadores;
  return el("table", {},
    el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Tentativa"), nomes.map((i) => el("th", { scope: "col" }, i.nome)))),
    el("tbody", {}, r.tentativas.map((t, n) => el("tr", {},
      el("th", { scope: "row" }, `#${n + 1} `, el("div", { class: "pequeno suave" }, t.decisao.slice(0, 180), t.decisao.length > 180 ? "…" : "")),
      nomes.map((i) => el("td", {}, delta(t.variacao?.[i.id])))))));
}

// ------------------------------------------------------------------ final
async function telaFinal() {
  const camp = estado.campanha;
  renderIndicadores(camp.indicadores);
  tela("Campanha concluída",
    el("p", {}, `Você liderou a associação por ${camp.total} cenários. Veja a trajetória dos indicadores:`),
    el("table", {}, el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Cenário"),
      estado.cfg.indicadores.map((i) => el("th", { scope: "col" }, i.nome)))),
      el("tbody", {}, camp.historico.map((h) => el("tr", {}, el("th", { scope: "row" }, `${h.indice + 1}`),
        estado.cfg.indicadores.map((i) => el("td", {}, Number(h.depois[i.id]).toFixed(0), " ", delta(h.depois[i.id] - h.antes[i.id]))))))),
    el("p", {}, `Custo total da campanha: R$ ${camp.custo.total_brl.toFixed(2)}.`),
    el("p", {}, el("button", { onclick: novaCampanha }, "Nova campanha"),
      el("button", { class: "secundario", onclick: () => window.print() }, "Imprimir / salvar em PDF"),
      el("button", { class: "secundario", onclick: async () => {
        if (!confirm("Apagar todos os seus dados deste navegador e do servidor? Não dá para desfazer.")) return;
        await api("/api/sessoes/eu", { method: "DELETE" }); localStorage.clear(); location.href = "/"; } }, "Apagar meus dados")));
}

// ------------------------------------------------------------------ facilitador
async function telaFacilitador() {
  renderIndicadores(null);
  let codigo = sessionStorage.getItem("lej_fac") || "";
  const f = (c, o = {}) => api(c, { ...o, headers: { "X-Facilitador": codigo } });
  const campo = el("input", { type: "password", id: "codigo", autocomplete: "off" });
  const area = el("div", {});
  const carregar = async () => {
    area.replaceChildren(el("p", {}, "Carregando…"));
    try {
      const [p, c] = await Promise.all([f("/api/facilitador/partidas"), f("/api/facilitador/cenarios")]);
      sessionStorage.setItem("lej_fac", codigo);
      const comparacao = el("div", {});
      area.replaceChildren(
        el("p", {}, `Gasto no mês: R$ ${p.gasto_mes_brl.toFixed(2)} de R$ ${p.orcamento_mensal_brl} de orçamento.`),
        el("p", {}, el("button", { onclick: async () => {
          const r = await fetch("/api/facilitador/export.csv", { headers: { "X-Facilitador": codigo } });
          const url = URL.createObjectURL(await r.blob());
          el("a", { href: url, download: "desempenho.csv" }).click();
        } }, "Exportar desempenho (CSV)"), el("button", { class: "secundario", onclick: () => window.print() }, "Imprimir relatório (PDF)")),
        el("h2", {}, "Partidas"),
        el("table", {}, el("thead", {}, el("tr", {}, ["Apelido", "Status", "Cenário", ...estado.cfg.indicadores.map((i) => i.nome), "Custo"].map((h) => el("th", { scope: "col" }, h)))),
          el("tbody", {}, p.partidas.map((x) => el("tr", {}, el("td", {}, x.apelido), el("td", {}, x.status),
            el("td", {}, `${Math.min(x.cenario_atual + 1, x.total)}/${x.total}`),
            estado.cfg.indicadores.map((i) => el("td", {}, Number(x.indicadores[i.id]).toFixed(0))),
            el("td", {}, `R$ ${x.custo.total_brl.toFixed(2)}`))))),
        el("h2", {}, "Cenários"),
        el("p", { class: "suave" }, "Cenários gerados de notícias só entram nas campanhas depois de aprovados."),
        el("p", {}, el("button", { class: "secundario", onclick: async (ev) => {
          ev.currentTarget.disabled = true;
          const r = await f("/api/facilitador/noticias/gerar?max_cenarios=3", { method: "POST" });
          alert(r.erro || `${r.gerados.length} cenário(s) gerado(s) a partir de ${r.candidatas} notícia(s) relevante(s).`); carregar();
        } }, "Gerar cenários a partir de notícias recentes")),
        el("table", {}, el("thead", {}, el("tr", {}, ["Cenário", "Tema", "Dif.", "Status", "Ações"].map((h) => el("th", { scope: "col" }, h)))),
          el("tbody", {}, c.cenarios.map((s) => el("tr", {},
            el("td", {}, el("details", {}, el("summary", {}, s.titulo), el("div", { class: "pequeno" }, s.texto),
              s.inspirado_em ? el("p", { class: "pequeno suave" }, "Inspirado em: ", el("a", { href: s.inspirado_em.url, target: "_blank", rel: "noopener" }, s.inspirado_em.titulo), ` (${s.inspirado_em.veiculo}, ${s.inspirado_em.data})`) : "")),
            el("td", {}, s.tema), el("td", {}, s.dificuldade), el("td", {}, s.status),
            el("td", {},
              el("button", { class: "secundario", onclick: async () => {
                const r = await f(`/api/facilitador/cenarios/${s.id}/decisoes`);
                comparacao.replaceChildren(el("h2", {}, `Decisões para “${s.titulo}”`),
                  r.decisoes.length ? el("table", {}, el("thead", {}, el("tr", {}, ["Apelido", "Decisão", ...estado.cfg.indicadores.map((i) => i.nome)].map((h) => el("th", { scope: "col" }, h)))),
                    el("tbody", {}, r.decisoes.map((d) => el("tr", {}, el("td", {}, d.apelido, d.modo === "contingencia" ? " (contingência)" : ""),
                      el("td", { class: "pequeno" }, d.decisao), estado.cfg.indicadores.map((i) => el("td", {}, delta(d.variacao[i.id])))))))
                    : el("p", {}, "Ainda não há decisões concluídas para este cenário."));
                comparacao.scrollIntoView();
              } }, "Comparar decisões"),
              s.status === "pendente_revisao" ? [
                el("button", { onclick: async () => { await f(`/api/facilitador/cenarios/${s.id}/status`, { method: "POST", body: { status: "aprovado" } }); carregar(); } }, "Aprovar"),
                el("button", { class: "secundario", onclick: async () => { await f(`/api/facilitador/cenarios/${s.id}/status`, { method: "POST", body: { status: "rejeitado" } }); carregar(); } }, "Rejeitar")] : ""))))),
        comparacao);
    } catch (e) { area.replaceChildren(); mostrarErro(area, e); }
  };
  tela("Painel do facilitador",
    el("form", { class: "cartao", onsubmit: (ev) => { ev.preventDefault(); codigo = campo.value; carregar(); } },
      el("label", { for: "codigo" }, "Código do facilitador"), campo,
      el("p", { class: "suave pequeno" }, "Definido em FACILITADOR_CODIGO no arquivo .env do servidor."),
      el("button", { type: "submit" }, "Entrar")), area);
  if (codigo) carregar();
}

// ------------------------------------------------------------------ início
(async function iniciar() {
  try { estado.cfg = await api("/api/config"); } catch (e) { tela("Serviço indisponível", el("p", {}, e.message)); return; }
  verificarStatus();
  if (location.pathname.startsWith("/facilitador")) return telaFacilitador();
  if (estado.token && estado.campanhaId) return abrirCampanha(estado.campanhaId);
  telaInicio();
})();
