/* Liderança em Jogo — PWA sem dependências de build. Texto dinâmico sempre via textContent (sem innerHTML).
   Áreas: Painel (mandato) · Ensaio · Vivências · Relatório · Facilitador.
   Trimestre: Pauta → Mesa do Orçamento (prévia em código, sem IA) → Decisão (Ata) → Resultado e conversa. */
"use strict";

const FRASE = "Treinamento gamificado que simula cenários de lideranças de associações comerciais usando uma coleção de agentes de IA para compor uma ferramenta preditiva que reduz os riscos de atuações reais.";
const estado = { cfg: null, token: localStorage.getItem("lej_token"), apelido: localStorage.getItem("lej_apelido"),
  campanhaId: localStorage.getItem("lej_campanha"), campanha: null, timer: null, aloc: {}, base: {}, previa: null,
  reuniaoFim: null, relogio: null, escolhas: {}, relatosAbertos: new Set() };

const POSTURA = { "-2": "insatisfeita", "-1": "desconfiada", "0": "neutra", "1": "favorável", "2": "favorável" };
const TIPOS = { associado: "Associado", diretoria: "Diretoria", conselho: "Conselho", funcionarios: "Equipe", poder_publico: "Poder público",
  imprensa: "Imprensa", sindicato: "Sindicato", consumidores: "Comunidade", entidade_concorrente: "Outra entidade", federacao: "Federação",
  parceiro: "Parceiro", fornecedor: "Fornecedor" };
const ICONE_REGRA = { "💰": "wallet", "📜": "file-check", "🔒": "lock", "⏱️": "clock", "🤝": "handshake", "⚖️": "scale", "🛡️": "shield-check",
  "📅": "calendar", "👥": "users", "🏛️": "landmark", "🩺": "shield-check", "🎤": "megaphone", "🧾": "file-text" };
const ABAS = [["painel", "layout-dashboard", "Painel"], ["ensaio", "flask-conical", "Ensaio"], ["vivencias", "library", "Vivências"],
  ["relatorio", "file-text", "Relatório"], ["facilitador", "users", "Facilitador"]];

// ------------------------------------------------------------------ utilidades
function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "class") n.className = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat(Infinity)) if (f !== null && f !== undefined && f !== false && f !== "")
    n.append(f instanceof Node ? f : document.createTextNode(String(f)));
  return n;
}
const $ = (s) => document.querySelector(s);
const main = () => $("#conteudo");
const brl = (v) => "R$ " + Math.round(Number(v) || 0).toLocaleString("pt-BR");
const min1 = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

function topo(titulo, sub = "", voltar = null) {
  $("#titulo-tela").textContent = titulo;
  $("#subtitulo-tela").textContent = sub;
  const b = $("#voltar");
  b.hidden = !voltar;
  b.onclick = voltar || null;
  document.title = `${titulo} — Liderança em Jogo`;
}

function abas(atual) {
  const nav = $("#abas");
  nav.hidden = !atual;
  if (!atual) return;
  $("#abas-dentro").replaceChildren(...ABAS.map(([id, ic, nome]) => el("button", { type: "button", "aria-current": id === atual ? "page" : null,
    onclick: () => irPara(id) }, icone(ic, 22), nome)));
}

function tela(...conteudo) {
  clearInterval(estado.timer);
  const m = main();
  m.replaceChildren(...conteudo.flat().filter((c) => c !== null && c !== undefined && c !== ""));
  m.focus({ preventScroll: true });
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
  container.querySelectorAll(":scope > .erro").forEach((n) => n.remove());
  const caixa = el("div", { class: "erro", role: "alert" }, e.message || String(e));
  container.prepend(caixa);
  caixa.scrollIntoView({ block: "center" });
  SOM.tocar("alerta");
}

let avisoTimer = null;
function avisoCurto(msg) {
  const t = $("#aviso-curto");
  t.textContent = msg; t.classList.add("visivel");
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => t.classList.remove("visivel"), 2800);
}

function abrirPainel(titulo, ...conteudo) {
  fecharPainel();
  const ant = document.activeElement;
  const painel = el("div", { class: "painel-inferior", role: "dialog", "aria-modal": "true", "aria-label": titulo, tabindex: "-1" },
    el("div", { class: "alca", "aria-hidden": "true" }),
    el("div", { class: "linha entre" }, el("h2", { style: "margin:0" }, titulo),
      el("button", { type: "button", class: "botao-icone", "aria-label": "Fechar", onclick: fecharPainel }, icone("x", 22))),
    ...conteudo);
  const fundo = el("div", { class: "fundo-painel", id: "fundo-painel", onclick: (ev) => { if (ev.target === fundo) fecharPainel(); } }, painel);
  fundo._anterior = ant;
  document.body.append(fundo);
  painel.focus();
}
function fecharPainel() { const f = $("#fundo-painel"); if (f) { f.remove(); f._anterior?.focus?.(); } }
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") fecharPainel(); });

function delta(v, casas = 1) {
  if (v === null || v === undefined) return el("span", { class: "estavel" }, "—");
  const n = Number(v);
  if (n > 0) return el("span", { class: "sobe" }, icone("trending-up", 14), ` +${n.toFixed(casas)}`);
  if (n < 0) return el("span", { class: "desce" }, icone("trending-down", 14), ` ${n.toFixed(casas)}`);
  return el("span", { class: "estavel" }, "0");
}

function ator(id) { return (estado.campanha?.cenario?.atores || []).find((a) => a.id === id); }
function avatarDe(a, expressao, tamanho = 52, semStatus = false) {
  return AVATAR.criar({ id: a?.id, nome: a?.nome, tipo: a?.tipo, genero: a?.genero, idade: a?.idade, expressao, tamanho, semStatus });
}
// Componente único de pessoa: nome com a função logo abaixo. Em texto corrido, use nomeFuncao(a) = "Nome (função)".
function funcaoDe(a) { return a?.funcao || (a?.papel ? min1(a.papel.split(",")[0]) : ""); }
function nomeFuncao(a) { return a ? (funcaoDe(a) ? `${a.nome} (${funcaoDe(a)})` : a.nome) : ""; }
function Ator(a, { tamanho = 44, expressao = null, status = false, classe = "" } = {}) {
  if (!a) return "";
  return el("span", { class: `ator ${classe}` },
    tamanho ? avatarDe(a, expressao || AVATAR.expressaoDePostura(a.postura_inicial ?? 0), tamanho, !status) : "",
    el("span", { class: "ator-texto" }, el("strong", { class: "ator-nome" }, a.nome), funcaoDe(a) ? el("span", { class: "ator-funcao" }, funcaoDe(a)) : ""));
}
function influencia(n) { return el("span", { "aria-label": `Influência ${n} de 5`, class: "influencia" }, "●".repeat(n), el("span", { class: "suave", "aria-hidden": "true" }, "○".repeat(5 - n))); }

function abrirAtor(a, postura) {
  const expr = AVATAR.expressaoDePostura(postura ?? a.postura_inicial);
  abrirPainel(nomeFuncao(a),
    el("div", { class: "linha" }, avatarDe(a, expr, 84), el("div", {}, el("span", { class: "etiqueta neutra" }, TIPOS[a.tipo] || a.tipo),
      el("p", { style: "margin:.4rem 0 0" }, a.papel))),
    el("p", {}, el("strong", {}, "Influência: "), influencia(a.influencia)),
    el("p", {}, el("strong", {}, "Postura: "), POSTURA[postura ?? a.postura_inicial]));
}

// ------------------------------------------------------------------ indicadores
function blocosIndicadores(valores, variacao, tendencia) {
  return el("div", { class: "indicadores" }, estado.cfg.indicadores.map((i) => {
    const v = Number(valores?.[i.id] ?? 0);
    const t = tendencia?.[i.id];
    return el("button", { type: "button", class: "ind", onclick: () => avisoCurto(`${i.nome}: ${i.descricao}`), "aria-label": `${i.nome}: ${v.toFixed(0)} de 100` },
      el("div", { class: "nome" }, i.nome),
      el("div", { class: "valor" }, v.toFixed(0),
        variacao ? el("span", { class: "delta" }, delta(variacao[i.id])) : "",
        t && t !== "estavel" ? el("span", { class: `delta ${t === "sobe" ? "sobe" : "desce"}`, "aria-label": `tendência: ${t}` }, icone(t === "sobe" ? "trending-up" : "trending-down", 16)) : ""),
      el("div", { class: "barra" }, el("span", { style: `width:${Math.max(0, Math.min(100, v))}%` })));
  }));
}

async function verificarStatus() {
  try {
    const s = await api("/api/status");
    $("#faixa-status").replaceChildren(s.mirofish ? "" : el("div", { class: "aviso", style: "margin:.5rem .9rem 0" }, icone("info", 18),
      el("span", {}, "Modo simplificado: o simulador de reações está fora do ar. O jogo continua, com reações simplificadas.")));
  } catch (_) { /* silencioso */ }
}

// ------------------------------------------------------------------ navegação
function irPara(area) {
  fecharPainel();
  clearInterval(estado.relogio);
  if (area === "painel") return telaPainel();
  if (area === "ensaio") return typeof telaEnsaio === "function" ? telaEnsaio() : telaEmBreve("Modo Ensaio", "ensaio");
  if (area === "vivencias") return typeof telaVivencias === "function" ? telaVivencias() : telaEmBreve("Banco de Vivências", "vivencias");
  if (area === "relatorio") return telaRelatorio();
  if (area === "facilitador") return telaFacilitador();
}

function telaEmBreve(nome, aba) {
  topo(nome); abas(aba);
  tela(el("div", { class: "info" }, icone("info", 18), el("span", {}, `${nome}: disponível em breve.`)));
}

// ------------------------------------------------------------------ onboarding e posse
const ONBOARDING = [
  ["landmark", "Você assumiu a diretoria", "Uma associação comercial fictícia precisa decidir prioridades, orçamento e resultados. Você conduz o mandato."],
  ["list-checks", "Cada trimestre tem 4 etapas", "Pauta, Mesa do Orçamento, Ata da decisão e Resultado com a reação dos envolvidos."],
  ["chart-column", "Uma ferramenta preditiva", "Agentes de IA representam associados, diretoria, poder público e imprensa e antecipam riscos antes da decisão real."],
  ["award", "Certificações de competência", "Reconhecem como você decide: clareza, metas, escuta e revisão com base em resultados. Não existe uma única resposta certa."],
];

function telaOnboarding(n = 0) {
  topo("Boas-vindas"); abas(null);
  const [ic, titulo, texto] = ONBOARDING[n];
  const fim = () => { localStorage.setItem("lej_onboarding_ok", "1"); telaPosse(); };
  tela(el("div", { class: "cartao", style: "text-align:center;padding:2rem 1.2rem" },
    el("div", { style: "display:inline-grid;place-items:center;width:72px;height:72px;border-radius:50%;background:var(--cacb-primaria-clara);color:var(--cacb-primaria)" }, icone(ic, 36)),
    el("h2", {}, titulo), el("p", { class: "suave" }, texto),
    el("p", { class: "pequeno suave", "aria-label": `Tela ${n + 1} de ${ONBOARDING.length}` }, ONBOARDING.map((_, i) => (i === n ? "●" : "○")).join(" ")),
    el("div", { class: "acoes" },
      el("button", { class: "botao secundario", onclick: fim }, "Pular"),
      el("button", { class: "botao", onclick: () => { SOM.tocar("confirmar"); n < ONBOARDING.length - 1 ? telaOnboarding(n + 1) : fim(); } },
        n < ONBOARDING.length - 1 ? "Próximo" : "Começar"))),
    el("p", { class: "pequeno suave", style: "text-align:center" }, FRASE));
}

function telaPosse() {
  topo("Tomar posse", "Liderança em Jogo"); abas(null);
  const campo = el("input", { type: "text", id: "apelido", maxlength: 40, autocomplete: "nickname", value: estado.apelido || "" });
  const perfis = estado.cfg.perfis || [];
  const form = el("form", { class: "cartao", onsubmit: async (ev) => {
    ev.preventDefault();
    try {
      const r = await api("/api/sessoes", { method: "POST", body: { apelido: campo.value } });
      estado.token = r.token; estado.apelido = r.apelido;
      localStorage.setItem("lej_token", r.token); localStorage.setItem("lej_apelido", r.apelido);
      localStorage.removeItem("lej_roteiro");
      localStorage.setItem("lej_jogador", JSON.stringify({ apelido: r.apelido, funcao: "diretora ou diretor em 1º mandato" }));
      await novaCampanha(form.querySelector("input[name=perfil]:checked")?.value);
      SOM.tocar("confirmar");
    } catch (e) { mostrarErro(form, e); }
  } },
    el("label", { for: "apelido" }, "Apelido"), campo,
    el("p", { class: "pequeno suave" }, "Não pedimos nome, e-mail nem dados pessoais."),
    el("p", { class: "rotulo-secao" }, "Associação do mandato (fictícia)"),
    perfis.map((p) => el("label", { class: "opcao" }, el("input", { type: "radio", name: "perfil", value: p.id, checked: p.id === estado.cfg.perfil_padrao }),
      el("span", {}, el("strong", {}, p.nome), el("br"), el("span", { class: "pequeno suave" }, p.descricao)))),
    el("button", { type: "submit", class: "botao bloco" }, "Tomar posse"));
  const roteiro = estado.cfg.roteiro_demo ? el("button", { class: "botao secundario bloco", onclick: async () => {
    try {
      localStorage.setItem("lej_roteiro", "1");
      localStorage.setItem("lej_jogador", JSON.stringify(VANESSA));
      const r = await api("/api/sessoes", { method: "POST", body: { apelido: VANESSA.apelido } });
      estado.token = r.token; estado.apelido = r.apelido; localStorage.setItem("lej_token", r.token); localStorage.setItem("lej_apelido", r.apelido);
      await novaCampanha(estado.cfg.roteiro_demo.perfil);
    } catch (e) { mostrarErro(form, e); } } }, icone("play", 18), "Entrar como Vanessa (demonstração)") : "";
  tela(el("p", { class: "suave" }, FRASE), form, roteiro);
}

// Perfil de quem joga: fica só no aparelho (nada identificável). Vanessa é o perfil de demonstração do pitch.
const VANESSA = { apelido: "Vanessa", funcao: "lojista, diretora em 1º mandato", papel: "Diretora", segmento: "Varejo", porte: "Pequena empresa", demo: true };
function jogador() {
  try { return JSON.parse(localStorage.getItem("lej_jogador") || "null") || { apelido: estado.apelido || "Você", funcao: "diretora ou diretor em 1º mandato" }; }
  catch (_) { return { apelido: estado.apelido || "Você", funcao: "diretora ou diretor em 1º mandato" }; }
}

async function novaCampanha(perfil) {
  const c = await api("/api/campanhas", { method: "POST", body: { perfil } });
  estado.campanhaId = c.id; localStorage.setItem("lej_campanha", c.id);
  estado.campanha = c;
  telaPainel();
}

async function carregarCampanha() {
  if (!estado.campanhaId) return null;
  try { estado.campanha = await api(`/api/campanhas/${estado.campanhaId}`); return estado.campanha; }
  catch (e) { if (e.status === 401 || e.status === 404) { localStorage.removeItem("lej_campanha"); estado.campanhaId = null; } return null; }
}

// ------------------------------------------------------------------ painel (mandato)
async function telaPainel() {
  if (!estado.token || !(await carregarCampanha())) return localStorage.getItem("lej_onboarding_ok") ? telaPosse() : telaOnboarding();
  const camp = estado.campanha;
  const perfil = (estado.cfg.perfis || []).find((p) => p.id === camp.perfil);
  topo("Painel", `${perfil?.nome || ""} · Mandato`); abas("painel");
  const feitos = camp.mandato.filter((m) => m.status === "concluido").length;
  const ultima = camp.tentativas.at(-1);
  const sigla = camp.cenario?.associacao?.nome?.match(/\(([^)]+)\)/)?.[1] || "";
  tela(
    el("div", { class: "cabecalho-doc" }, el("span", {}, "Mandato"), el("span", {}, sigla || "Associação"), el("span", {}, perfil?.id || "")),
    el("p", { class: "rotulo-secao", style: "margin-top:0" }, "Indicadores da associação"),
    blocosIndicadores(camp.indicadores),
    el("div", { class: "linha entre", style: "margin-top:1.4rem" }, el("p", { class: "rotulo-secao", style: "margin:0" }, "Mandato"),
      el("span", { class: "pequeno suave" }, `${feitos} de ${camp.total} concluídos`)),
    el("div", { class: "progresso-mandato", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": camp.total, "aria-valuenow": feitos },
      el("span", { style: `width:${(feitos / camp.total) * 100}%` })),
    el("ul", { class: "mandato" }, camp.mandato.map((m) => el("li", { class: m.status },
      el("span", { class: "num" }, m.status === "concluido" ? icone("circle-check", 18) : String(m.indice + 1)),
      el("div", { class: "corpo" }, el("strong", {}, m.titulo),
        el("span", { class: "pequeno suave" }, `${m.tema} · ${m.demandas} pedidos · cerca de ${m.duracao_min} min`)),
      m.status === "atual" ? el("button", { class: "botao", onclick: () => (ultima ? telaResultado(ultima.id) : iniciarTrimestre()) },
        icone("play", 16), ultima ? "Continuar" : "Jogar")
        : m.status === "concluido" ? el("span", { class: "etiqueta ok" }, "Concluído") : el("span", { class: "etiqueta neutra" }, icone("lock", 12), "Bloqueado")))),
    camp.status === "concluida" ? el("div", { class: "cartao cartao-destaque" }, el("h3", {}, "Mandato concluído"),
      el("p", { class: "suave" }, "O Relatório de gestão reúne as Atas Padronizadas e o consolidado do mandato."),
      el("div", { class: "acoes" }, el("button", { class: "botao", onclick: () => irPara("relatorio") }, icone("file-text", 18), "Abrir relatório"),
        el("button", { class: "botao secundario", onclick: () => novaCampanha(camp.perfil) }, "Novo mandato"))) : "",
    el("p", { class: "pequeno suave", style: "margin-top:1.4rem" }, FRASE));
}

// ------------------------------------------------------------------ voz
const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
const VOZ_OK = !!Reconhecimento;
function botaoVoz(campo) {
  if (!VOZ_OK) return el("span", { class: "pequeno suave" }, "Voz indisponível neste navegador.");
  let rec = null;
  const b = el("button", { type: "button", class: "botao secundario", "aria-pressed": "false" }, icone("mic", 18), "Falar");
  b.addEventListener("click", () => {
    if (rec) { rec.stop(); return; }
    rec = new Reconhecimento(); rec.lang = "pt-BR"; rec.interimResults = true; rec.continuous = true;
    const inicial = campo.value ? campo.value.trim() + " " : "";
    rec.onresult = (ev) => { let txt = ""; for (const r of ev.results) txt += r[0].transcript; campo.value = inicial + txt.trim(); campo.dispatchEvent(new Event("input")); };
    rec.onend = () => { rec = null; b.replaceChildren(icone("mic", 18), "Falar"); b.setAttribute("aria-pressed", "false"); campo.dispatchEvent(new Event("change")); };
    rec.onerror = (ev) => { if (ev.error === "not-allowed") avisoCurto("O navegador não deu acesso ao microfone. Use o texto."); };
    rec.start(); b.replaceChildren(icone("square", 18), "Parar"); b.setAttribute("aria-pressed", "true");
  });
  return b;
}
function avisoVoz() {
  return el("p", { class: "pequeno suave" }, VOZ_OK ? "A voz é transcrita pelo serviço do navegador (no Chrome, servidores do Google) e não é gravada pelo jogo. Revise o texto." : "Use os botões ou o texto.");
}
function chips(opcoes, selecionados, { multiplo = true, max = 2, aoMudar } = {}) {
  const g = el("div", { class: "chips", role: "group" });
  const render = () => g.replaceChildren(...opcoes.map((o) => {
    const ativo = selecionados.includes(o);
    return el("button", { type: "button", class: "chip", "aria-pressed": String(ativo), onclick: () => {
      const i = selecionados.indexOf(o);
      if (i >= 0) selecionados.splice(i, 1);
      else if (multiplo) { if (selecionados.length >= max) selecionados.shift(); selecionados.push(o); }
      else selecionados.splice(0, selecionados.length, o);
      render(); aoMudar?.();
    } }, ativo ? icone("circle-check", 16) : "", o);
  }));
  render();
  return g;
}

function mapaRiscos(riscos) {
  const rot = { alto: "Alta", medio: "Média", baixo: "Baixa" };
  const grade = el("div", { class: "mapa-riscos", role: "table", "aria-label": "Mapa de riscos: probabilidade por impacto" },
    el("span", { class: "eixo" }, "Probabilidade × impacto"), ["baixo", "medio", "alto"].map((i) => el("span", { class: "eixo" }, `Impacto ${rot[i].toLowerCase()}`)));
  ["alto", "medio", "baixo"].forEach((p, ip) => {
    grade.append(el("span", { class: "eixo" }, rot[p]));
    ["baixo", "medio", "alto"].forEach((imp, ii) => {
      const sev = Math.min(3, Math.max(1, Math.round(((2 - ip) + ii) / 2) + 1));
      grade.append(el("span", { class: `celula n${sev}` }, riscos.map((x, k) => (x.probabilidade === p && x.impacto === imp ? el("span", { class: "ponto", title: x.descricao }, String(k + 1)) : null))));
    });
  });
  return grade;
}

// ------------------------------------------------------------------ conversa
function posturaAtual(t, atorId) {
  const r = t.resultado || {};
  const reac = (r.reacoes || []).find((x) => x.ator_id === atorId);
  if (reac) return reac.postura_final;
  const d = (r.demandas || []).find((x) => x.solicitante === atorId);
  return d ? d.postura_prevista : (ator(atorId)?.postura_inicial ?? 0);
}
function perguntasSugeridas(t, atorId) {
  if (atorId === "relatorio") return ["Quem ficou mais insatisfeito?", "Qual é o maior risco agora?", "O que a simulação mostrou de inesperado?"];
  const d = (t.resultado?.demandas || []).find((x) => x.solicitante === atorId);
  if (d && d.valor === 0) return ["Por que você ficou insatisfeito?", "Dá para fazer parte do seu projeto com menos dinheiro?", "O que faria você apoiar a diretoria no próximo trimestre?"];
  if (d && d.valor < d.custo) return ["Com menos verba, o que dá para entregar?", "O que você precisa para não desistir do projeto?", "Como vamos medir o resultado?"];
  if (d) return ["O que você vai entregar com esse dinheiro?", "Como vamos medir o resultado?", "O que pode dar errado?"];
  return ["O que você achou da decisão?", "Quem ficou de fora, na sua opinião?", "O que você faria diferente?"];
}
async function painelConversa(t) {
  const cen = estado.campanha.cenario;
  const sel = el("select", { id: "interlocutor" }, el("option", { value: "relatorio" }, "Analista (resumo da simulação)"),
    cen.atores.map((a) => el("option", { value: a.id }, nomeFuncao(a))));
  const log = el("div", { class: "chat", role: "log", "aria-live": "polite", "aria-label": "Conversa" });
  const campo = el("input", { type: "text", id: "msg", maxlength: 800, placeholder: "Sua pergunta" });
  const enviar = el("button", { type: "submit", class: "botao" }, "Enviar");
  const dica = el("p", { class: "pequeno suave" });
  const sugestoes = el("div", { class: "chips" });
  const rosto = el("span", {});
  const carregar = async () => {
    const h = await api(`/api/tentativas/${t.id}/conversa?interlocutor=${encodeURIComponent(sel.value)}`);
    log.replaceChildren(...h.mensagens.map((m) => el("div", { class: `msg ${m.papel}` }, m.conteudo)));
    log.scrollTop = log.scrollHeight;
  };
  const mandar = async (texto) => {
    if (!texto.trim()) return;
    form.querySelectorAll(".erro").forEach((n) => n.remove());
    enviar.disabled = true;
    log.append(el("div", { class: "msg jogador" }, texto), el("div", { class: "msg agente suave", id: "digitando" }, "…"));
    try {
      const r = await api(`/api/tentativas/${t.id}/conversa`, { method: "POST", body: { interlocutor: sel.value, mensagem: texto } });
      $("#digitando")?.remove();
      log.append(el("div", { class: "msg agente" }, r.resposta));
      dica.textContent = `Mensagens restantes: ${r.restantes}`;
      verificarSelos();
    } catch (e) { $("#digitando")?.remove(); mostrarErro(form, e); }
    enviar.disabled = false; log.scrollTop = log.scrollHeight;
  };
  const atualizarSug = () => {
    const a = ator(sel.value);
    rosto.replaceChildren(a ? avatarDe(a, AVATAR.expressaoDePostura(posturaAtual(t, sel.value)), 48) : AVATAR.criar({ id: "analista", nome: "Analista", tipo: "parceiro", tamanho: 48, semStatus: true }));
    sugestoes.replaceChildren(...perguntasSugeridas(t, sel.value).map((q) => el("button", { type: "button", class: "chip", onclick: () => mandar(q) }, q)));
  };
  const form = el("form", { onsubmit: (ev) => { ev.preventDefault(); const v = campo.value; campo.value = ""; mandar(v); } },
    el("label", { for: "msg" }, "Pergunta"), el("div", { class: "linha" }, el("div", { style: "flex:1;min-width:160px" }, campo), botaoVoz(campo), enviar));
  sel.addEventListener("change", () => { atualizarSug(); carregar(); });
  const rotConv = passoRoteiro()?.conversa;
  if (rotConv && cen.atores.some((a) => a.id === rotConv.ator)) sel.value = rotConv.ator;
  atualizarSug();
  await carregar();
  return el("div", { class: "cartao" }, el("h3", {}, "Conversar com os envolvidos"),
    rotConv ? faixaRoteiro(`pergunte "${rotConv.pergunta}".`, () => mandar(rotConv.pergunta), "Perguntar") : "",
    el("div", { class: "linha" }, rosto, el("div", { style: "flex:1" }, el("label", { for: "interlocutor", style: "margin-top:0" }, "Com quem"), sel)),
    sugestoes, log, form, dica);
}

// ------------------------------------------------------------------ certificações
async function verificarSelos() {
  if (!estado.campanhaId) return;
  try { const r = await api(`/api/campanhas/${estado.campanhaId}/selos`); for (const n of r.novos) mostrarCertificacao(n); } catch (_) {}
}
function mostrarCertificacao(s) {
  SOM.tocar("certificacao");
  const caixa = el("div", { class: "selo-conquista", role: "status" }, el("div", { class: "selo" }, icone("award", 30)),
    el("div", { class: "pequeno suave" }, "Certificação de competência"), el("strong", {}, s.nome));
  document.body.append(caixa);
  setTimeout(() => caixa.classList.add("saindo"), 2600);
  setTimeout(() => caixa.remove(), 3000);
}
function credenciais(lista) {
  return el("ul", { class: "credenciais" }, lista.map((x) => el("li", { class: `credencial ${x.ganho ? "ganha" : ""}` },
    el("span", { class: "selo" }, icone(x.ganho ? "award" : "lock", 20)), el("strong", {}, x.nome), el("span", {}, x.descricao),
    el("span", { class: `etiqueta ${x.ganho ? "ok" : "neutra"}` }, x.ganho ? "Obtida" : "Pendente"))));
}

// ------------------------------------------------------------------ relatório
async function telaRelatorio() {
  topo("Relatório de gestão"); abas("relatorio");
  if (!estado.campanhaId) return tela(el("p", { class: "suave" }, "Comece um mandato no Painel."));
  try {
    const sel = await api(`/api/campanhas/${estado.campanhaId}/selos`);
    const camp = await carregarCampanha();
    tela(el("p", { class: "rotulo-secao", style: "margin-top:0" }, "Certificações de competência"), credenciais(sel.selos),
      typeof RELATORIO.tela === "function" ? await RELATORIO.tela(camp) : el("p", { class: "suave" }, "Atas do mandato: disponíveis ao concluir os trimestres."));
  } catch (e) { tela(); mostrarErro(main(), e); }
}

// ------------------------------------------------------------------ facilitador
async function telaFacilitador() {
  topo("Facilitador"); abas("facilitador");
  let codigo = sessionStorage.getItem("lej_fac") || "";
  const f = (c, o = {}) => api(c, { ...o, headers: { "X-Facilitador": codigo } });
  const area = el("div", {});
  const campo = el("input", { type: "password", id: "codigo", autocomplete: "off" });
  const carregar = async () => {
    area.replaceChildren(el("p", { class: "suave" }, "Carregando…"));
    try {
      const [p, cen, fts, perf, sims] = await Promise.all([f("/api/facilitador/partidas"), f("/api/facilitador/cenarios"), f("/api/facilitador/fatos"),
        f("/api/facilitador/perfil-padrao"), f("/api/facilitador/simulacoes")]);
      sessionStorage.setItem("lej_fac", codigo);
      const extras = typeof secoesFacilitadorExtras === "function" ? await secoesFacilitadorExtras(f, carregar) : [];
      area.replaceChildren(
        el("p", { class: "rotulo-secao" }, "Turma da sessão"),
        el("p", { class: "pequeno suave" }, `Gasto no mês: R$ ${p.gasto_mes_brl.toFixed(2)} de R$ ${p.orcamento_mensal_brl}.`),
        el("div", { class: "tabela-rolagem cartao", style: "padding:0" }, el("table", {},
          el("thead", {}, el("tr", {}, ["Apelido", "Situação", "Trimestre", ...estado.cfg.indicadores.map((i) => i.nome.split(" ")[0])].map((h) => el("th", { scope: "col" }, h)))),
          el("tbody", {}, p.partidas.map((x) => el("tr", {}, el("td", {}, x.apelido), el("td", {}, x.status === "concluida" ? "concluído" : "em andamento"),
            el("td", {}, `${Math.min(x.cenario_atual + 1, x.total)}/${x.total}`), estado.cfg.indicadores.map((i) => el("td", { class: "num" }, Number(x.indicadores[i.id]).toFixed(0)))))))),
        el("div", { class: "acoes" }, el("button", { class: "botao secundario", onclick: async () => {
          const r = await fetch("/api/facilitador/export.csv", { headers: { "X-Facilitador": codigo } });
          el("a", { href: URL.createObjectURL(await r.blob()), download: "turma.csv" }).click(); } }, icone("download", 18), "Baixar dados da turma (CSV)")),
        el("p", { class: "rotulo-secao" }, "Revisão humana das simulações"),
        el("p", { class: "pequeno suave" }, "Cada simulação começa como pendente. Valide depois de ler o resultado; o status aparece no Plano exportado."),
        sims.simulacoes.length ? el("div", { class: "tabela-rolagem cartao", style: "padding:0" }, el("table", {},
          el("thead", {}, el("tr", {}, ["Apelido", "Missão", "Carimbo", "Riscos", "Modo", "Revisão"].map((h) => el("th", { scope: "col" }, h)))),
          el("tbody", {}, sims.simulacoes.map((x) => el("tr", {}, el("td", {}, x.apelido), el("td", { class: "num" }, String(x.missao)), el("td", {}, x.carimbo || "—"),
            el("td", { class: "num" }, String(x.riscos)), el("td", {}, x.modo === "mirofish" ? "agentes (MiroFish)" : "offline"),
            el("td", {}, el("button", { class: `botao mini ${x.revisao_humana === "validada" ? "secundario" : ""}`, onclick: async () => {
              await f(`/api/facilitador/simulacoes/${x.id}/revisao`, { method: "POST", body: { status: x.revisao_humana === "validada" ? "pendente" : "validada" } });
              avisoCurto("Revisão atualizada."); carregar(); } }, x.revisao_humana === "validada" ? "Validada (desfazer)" : "Validar")))))))
          : el("p", { class: "pequeno suave" }, "Nenhuma simulação ainda."),
        el("p", { class: "rotulo-secao" }, "Adaptar para outra associação"),
        el("p", { class: "pequeno suave" }, "Perfil usado nos novos mandatos. Para criar outro perfil, copie um arquivo de config/perfis/ e ajuste orçamento, equipe e personagens."),
        perf.perfis.map((x) => el("label", { class: "opcao" }, el("input", { type: "radio", name: "perfil-padrao", value: x.id, checked: x.id === perf.padrao,
          onchange: async () => { await f("/api/facilitador/perfil-padrao", { method: "POST", body: { perfil: x.id } }); avisoCurto("Perfil padrão atualizado."); estado.cfg = await api("/api/config"); } }),
          el("span", {}, el("strong", {}, x.nome), el("br"), el("span", { class: "pequeno suave" }, `${x.associados} associados · teto ${brl(x.orcamento_trimestral)} por trimestre · ${x.equipe}`)))),
        ...extras,
        el("p", { class: "rotulo-secao" }, "Fatos de notícias para os trimestres"),
        el("div", { class: "acoes" }, el("button", { class: "botao secundario", onclick: async (ev) => { ev.currentTarget.disabled = true;
          const r = await f("/api/facilitador/noticias/gerar?max_cenarios=3", { method: "POST" }); avisoCurto(r.erro || `${r.gerados.length} fato(s) gerado(s).`); carregar(); } },
          icone("newspaper", 18), "Gerar fatos de notícias recentes")),
        fts.fatos.map((x) => el("div", { class: "cartao" }, el("div", { class: "linha entre" }, el("strong", {}, x.titulo), el("span", { class: `etiqueta ${x.status === "aprovado" ? "ok" : "alerta"}` }, x.status.replace("_", " "))),
          el("p", { class: "pequeno" }, x.texto), el("p", { class: "pequeno suave" }, `Original: “${x.fonte.titulo}” — ${x.fonte.veiculo}, ${x.fonte.data}`),
          el("div", { class: "acoes" }, x.status !== "aprovado" ? el("button", { class: "botao", onclick: async () => { await f(`/api/facilitador/fatos/${x.id}/status`, { method: "POST", body: { status: "aprovado" } }); carregar(); } }, "Aprovar") : "",
            x.status !== "rejeitado" ? el("button", { class: "botao secundario", onclick: async () => { await f(`/api/facilitador/fatos/${x.id}/status`, { method: "POST", body: { status: "rejeitado" } }); carregar(); } }, "Rejeitar") : ""))),
        el("p", { class: "rotulo-secao" }, "Cenários"),
        cen.cenarios.map((s) => el("div", { class: "cartao" }, el("div", { class: "linha entre" }, el("strong", {}, s.titulo), el("span", { class: `etiqueta ${s.status === "pendente_revisao" ? "alerta" : "neutra"}` }, s.status.replace("_", " "))),
          s.vivencias_base ? el("p", { class: "pequeno suave" }, `Construído a partir de ${s.vivencias_base} vivências.`) : "",
          s.status === "pendente_revisao" ? el("div", { class: "acoes" },
            el("button", { class: "botao", onclick: async () => { await f(`/api/facilitador/cenarios/${s.id}/status`, { method: "POST", body: { status: "aprovado" } }); carregar(); } }, "Aprovar"),
            el("button", { class: "botao secundario", onclick: async () => { await f(`/api/facilitador/cenarios/${s.id}/status`, { method: "POST", body: { status: "rejeitado" } }); carregar(); } }, "Rejeitar")) : "")));
    } catch (e) { area.replaceChildren(); mostrarErro(area, e); }
  };
  tela(el("form", { class: "cartao", onsubmit: (ev) => { ev.preventDefault(); codigo = campo.value; carregar(); } },
    el("label", { for: "codigo", style: "margin-top:0" }, "Código do facilitador"), campo, el("button", { type: "submit", class: "botao bloco", style: "margin-top:.6rem" }, "Entrar")), area);
  if (codigo) carregar();
}

// ------------------------------------------------------------------ preferências e início
function iniciarPreferencias() {
  const aplicar = () => {
    document.documentElement.style.setProperty("--fonte", localStorage.getItem("lej_fonte") || "1");
    document.body.classList.toggle("alto-contraste", localStorage.getItem("lej_contraste") === "1");
    const somOn = SOM.ligado();
    $("#som").replaceChildren(icone(somOn ? "volume-2" : "volume-x", 22));
    $("#som").setAttribute("aria-label", somOn ? "Som ligado (tocar para silenciar)" : "Som desligado (tocar para ligar)");
    $("#som").setAttribute("aria-pressed", String(somOn));
  };
  $("#voltar").replaceChildren(icone("arrow-left", 22));
  $("#preferencias").replaceChildren(icone("settings", 22));
  $("#som").addEventListener("click", () => { SOM.alternar(); aplicar(); avisoCurto(SOM.ligado() ? "Som ligado" : "Som desligado"); SOM.tocar("confirmar"); });
  $("#preferencias").addEventListener("click", () => {
    const vol = el("input", { type: "range", id: "vol", min: 0, max: 100, value: Math.round(SOM.volume() * 100) });
    vol.addEventListener("input", () => SOM.definirVolume(Number(vol.value) / 100));
    vol.addEventListener("change", () => SOM.tocar("confirmar"));
    const fonte = (d) => { const f = Math.min(1.5, Math.max(0.875, Number(localStorage.getItem("lej_fonte") || 1) + d)); localStorage.setItem("lej_fonte", f.toFixed(3)); aplicar(); };
    abrirPainel("Preferências",
      el("p", { class: "rotulo-secao", style: "margin-top:0" }, "Texto"),
      el("div", { class: "acoes" }, el("button", { class: "botao secundario", onclick: () => fonte(-0.0625) }, "A− Diminuir"), el("button", { class: "botao secundario", onclick: () => fonte(0.0625) }, "A+ Aumentar")),
      el("label", { class: "opcao" }, el("input", { type: "checkbox", checked: localStorage.getItem("lej_contraste") === "1",
        onchange: (ev) => { localStorage.setItem("lej_contraste", ev.target.checked ? "1" : "0"); aplicar(); } }), el("span", {}, "Alto contraste")),
      el("p", { class: "rotulo-secao" }, "Som"),
      el("label", { class: "opcao" }, el("input", { type: "checkbox", checked: SOM.ligado(), onchange: () => { SOM.alternar(); aplicar(); } }), el("span", {}, "Efeitos sonoros nos momentos-chave")),
      el("label", { for: "vol" }, "Volume"), vol,
      el("p", { class: "pequeno suave" }, "O som só reforça confirmações; toda informação também aparece na tela."));
  });
  aplicar();
}

(async function iniciar() {
  iniciarPreferencias();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => null);
  try { estado.cfg = await api("/api/config"); } catch (e) { tela(el("div", { class: "erro" }, e.message)); return; }
  verificarStatus();
  const p = location.pathname;
  if (p.startsWith("/facilitador")) return telaFacilitador();
  if (p.startsWith("/vivencias")) return irPara("vivencias");
  if (p.startsWith("/ensaio")) return irPara("ensaio");
  if (p.startsWith("/relatorio") || p.startsWith("/certificado")) return irPara("relatorio");
  telaPainel();
})();
