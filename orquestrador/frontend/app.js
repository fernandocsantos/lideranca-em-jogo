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
function influencia(n) { return el("span", { "aria-label": `Influência ${n} de 5`, class: "influencia" }, "●".repeat(n), el("span", { class: "suave", "aria-hidden": "true" }, "○".repeat(5 - n))); }

function abrirAtor(a, postura) {
  const expr = AVATAR.expressaoDePostura(postura ?? a.postura_inicial);
  abrirPainel(a.nome,
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
      const r = await api("/api/sessoes", { method: "POST", body: { apelido: campo.value || "Demonstração" } });
      estado.token = r.token; localStorage.setItem("lej_token", r.token); localStorage.setItem("lej_apelido", r.apelido);
      await novaCampanha(estado.cfg.roteiro_demo.perfil);
    } catch (e) { mostrarErro(form, e); } } }, icone("play", 18), "Roteiro da demonstração (2 trimestres)") : "";
  tela(el("p", { class: "suave" }, FRASE), form, roteiro);
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

// ------------------------------------------------------------------ roteiro da demonstração
function passoRoteiro() {
  if (localStorage.getItem("lej_roteiro") !== "1" || !estado.cfg.roteiro_demo) return null;
  return estado.cfg.roteiro_demo.trimestres[estado.campanha?.indice_atual ?? 0] || null;
}
function faixaRoteiro(texto, acao, rotulo) {
  if (!passoRoteiro()) return "";
  return el("div", { class: "info" }, icone("play", 18), el("span", {}, el("strong", {}, "Roteiro da demonstração: "), texto, " ",
    acao ? el("button", { type: "button", class: "botao secundario", style: "min-height:36px;padding:.2rem .7rem;margin-left:.3rem", onclick: acao }, rotulo) : ""));
}

// ------------------------------------------------------------------ trimestre: pauta
function iniciarTrimestre(alocInicial) {
  const c = estado.campanha.cenario;
  estado.base = Object.fromEntries(c.demandas.map((d) => [d.id, d.ano_anterior ?? 0]));
  estado.aloc = { ...estado.base, ...(alocInicial || {}) };
  estado.escolhas = {};
  estado.previa = null;
  estado.reuniaoFim = null;
  estado.relatosAbertos = new Set();
  telaPauta();
}

function passosTrimestre(i) {
  return el("div", { class: "passos-trimestre", "aria-label": "Etapas do trimestre" },
    ["Pauta", "Mesa", "Ata", "Resultado"].map((n, k) => el("span", { class: k < i ? "feito" : k === i ? "atual" : "", "aria-current": k === i ? "step" : null }, n)));
}

function blocoRelatos(c) {
  const rel = c.relatos_rede || [];
  if (!rel.length) return "";
  return el("div", {},
    el("p", { class: "rotulo-secao" }, "O que a rede relata"),
    c.vivencias_base ? el("p", { class: "pequeno suave" }, `Construído a partir de ${c.vivencias_base} vivências da rede.`) : "",
    el("button", { class: "botao secundario bloco", onclick: () => {
      rel.forEach((r) => estado.relatosAbertos.add(r.id));
      estado.escolhas.considerou_vivencias = 1;
      abrirPainel("O que a rede relata",
        el("p", { class: "pequeno suave" }, "Trechos de vivências da rede, mascarados (sem nomes, locais exatos ou valores identificáveis) e aprovados por curadoria."),
        rel.map((r) => el("div", { class: "relato" }, el("div", {}, r.trecho), el("div", { class: "quem" }, `${r.perfil}${r.ficticia ? " · exemplo fictício" : ""}`))));
    } }, icone("book-open", 18), `Ver ${rel.length} relato(s) da rede`));
}

function telaPauta() {
  const camp = estado.campanha;
  const c = camp.cenario;
  topo(c.titulo, `${c.periodo.charAt(0).toUpperCase() + c.periodo.slice(1)} ${camp.indice_atual + 1} de ${camp.total}`, telaPainel); abas(null);
  const anterior = camp.historico.at(-1);
  const rot = passoRoteiro();
  tela(
    passosTrimestre(0),
    rot ? faixaRoteiro(rot.continuidade ? `escolha "${rot.continuidade[0].toUpperCase() + rot.continuidade.slice(1)}" abaixo.` : "leia a pauta e abra a Mesa do Orçamento.") : "",
    c.continua_de && anterior ? blocoTrimestreAnterior(c, anterior) : "",
    el("div", { class: "cartao" },
      el("div", { class: "cabecalho-doc" }, el("span", {}, "Pauta"), el("span", {}, c.associacao.nome.match(/\(([^)]+)\)/)?.[1] || ""), el("span", {}, `Teto ${brl(c.disponivel)}`)),
      el("p", { class: "narrativa" }, c.narrativa || c.texto.split(/\n\n/)[0]),
      el("div", { class: "linha" }, c.tags.map((t) => el("span", { class: "etiqueta" }, t))),
      el("button", { class: "botao fantasma", style: "padding-left:0", onclick: () => abrirPainel("Contexto completo",
        ...c.texto.split(/\n\n+/).map((p) => el("p", {}, p)),
        el("p", {}, el("strong", {}, "O que está em jogo: "), c.em_jogo),
        el("p", { class: "pequeno suave" }, `${c.associacao.nome} · ${c.associacao.cidade} · ${c.associacao.associados} associados. ${c.associacao.situacao_financeira}`)) },
        icone("book-open", 18), "Ler contexto completo")),
    c.evento ? el("div", { class: "aviso" }, icone(Number(c.evento.delta_orcamento) < 0 ? "trending-down" : "trending-up", 18),
      el("span", {}, el("strong", {}, c.evento.titulo), ". ", c.evento.texto)) : "",
    c.fato_noticia ? el("div", { class: "info" }, icone("newspaper", 18), el("span", {}, el("strong", {}, "Fato novo: "), c.fato_noticia.titulo, " ",
      el("button", { class: "botao fantasma", style: "min-height:0;padding:0", onclick: () => abrirPainel("Fato novo do trimestre", el("p", {}, c.fato_noticia.texto),
        el("p", { class: "pequeno suave" }, `Recorte: ${c.fato_noticia.recorte}. Inspirado em notícia de ${c.fato_noticia.fonte?.veiculo}, ${(c.fato_noticia.fonte?.data || "").split("-").reverse().join("/")}. Nomes trocados por termos genéricos.`),
        c.fato_noticia.fonte?.url ? el("a", { href: c.fato_noticia.fonte.url, target: "_blank", rel: "noopener" }, "Fonte") : "") }, "ler"))) : "",
    blocoRelatos(c),
    el("p", { class: "rotulo-secao" }, "Envolvidos"),
    el("ul", { class: "fileira-atores" }, c.atores.map((a) => el("li", {}, el("button", { type: "button", onclick: () => abrirAtor(a) },
      avatarDe(a, AVATAR.expressaoDePostura(a.postura_inicial), 56), el("span", { class: "nome" }, a.nome.split(" ").slice(0, 2).join(" ")))))),
    el("p", { class: "rotulo-secao" }, "Restrições"),
    el("ul", { class: "regras cartao" }, c.regras.map((r) => el("li", {}, icone(ICONE_REGRA[r.icone] || "info", 18), el("span", {}, r.texto)))),
    el("div", { class: "acoes" }, el("button", { class: "botao bloco", onclick: telaMesa }, "Abrir a Mesa do Orçamento", icone("chevron-right", 18))));
}

function blocoTrimestreAnterior(c, anterior) {
  const ir = (escolha, aloc) => { estado.escolhas.continuidade = escolha; estado.aloc = { ...estado.base, ...aloc }; SOM.tocar("confirmar"); telaMesa(); };
  const meta = anterior.meta;
  return el("div", { class: "cartao cartao-destaque" },
    el("h3", {}, "Resultado do trimestre anterior"),
    meta ? el("div", {}, el("p", { class: "pequeno" }, el("strong", {}, "Meta: "), meta.texto),
      el("div", { class: "barra", role: "meter", "aria-valuemin": 0, "aria-valuemax": meta.alvo, "aria-valuenow": meta.previsto, "aria-label": `Previsto ${meta.previsto} de ${meta.alvo}` },
        el("span", { style: `width:${Math.min(100, meta.pct)}%` })),
      el("p", { class: "pequeno" }, `Previsto: ${meta.previsto} de ${meta.alvo} (${meta.pct}%) · ${meta.situacao}`)) : el("p", { class: "pequeno suave" }, "Sem meta mensurável no trimestre anterior."),
    el("p", { class: "pequeno" }, "Manter, ajustar ou rever a decisão? A Mesa já parte do que foi executado."),
    el("div", { class: "acoes" },
      el("button", { class: "botao", onclick: () => ir("manter", {}) }, "Manter"),
      el("button", { class: "botao secundario", onclick: () => ir("ajustar", {}) }, "Ajustar"),
      el("button", { class: "botao secundario", onclick: () => ir("rever", Object.fromEntries(c.demandas.map((d) => [d.id, 0]))) }, "Rever")));
}

// ------------------------------------------------------------------ Mesa do Orçamento
function iniciarRelogio(caixa) {
  const minutos = estado.cfg.decisao.minutos_reuniao || 10;
  if (!estado.reuniaoFim) estado.reuniaoFim = Date.now() + minutos * 60000;
  clearInterval(estado.relogio);
  const tick = () => {
    const resta = Math.max(0, estado.reuniaoFim - Date.now());
    const m = Math.floor(resta / 60000), s = Math.floor((resta % 60000) / 1000);
    caixa.replaceChildren(icone("clock", 16), resta > 0 ? ` Reunião: ${m}:${String(s).padStart(2, "0")}` : " Tempo da reunião esgotado");
    if (!document.body.contains(caixa)) clearInterval(estado.relogio);
  };
  tick(); estado.relogio = setInterval(tick, 1000);
}

let previaPendente = null;
function pedirPrevia(aplicar) {
  clearTimeout(previaPendente);
  previaPendente = setTimeout(async () => {
    try { estado.previa = await api(`/api/campanhas/${estado.campanhaId}/previa`, { method: "POST", body: { alocacao: estado.aloc, escolhas: estado.escolhas } }); aplicar(estado.previa); }
    catch (_) { /* a tela mostra o total; o servidor valida no envio */ }
  }, 70);
}

function telaMesa() {
  const camp = estado.campanha;
  const c = camp.cenario;
  const teto = c.disponivel;
  topo("Mesa do Orçamento", c.titulo, telaPauta); abas(null);
  const relogio = el("span", { class: "pequeno suave" });
  const inds = el("div", {});
  const total = el("div", { class: "total-mesa", "aria-live": "polite" });
  const linhas = {};
  let estourado = null;
  const soma = () => Object.values(estado.aloc).reduce((a, b) => a + Number(b), 0);
  const btnSeguir = el("button", { class: "botao bloco", onclick: () => { SOM.tocar("confirmar"); telaDecisao(); } }, "Orçamento fechado: registrar a decisão", icone("chevron-right", 18));

  const atualizarTotal = () => {
    const t = soma(), dif = t - teto;
    const st = dif > 0 ? el("span", { class: "status-mesa estouro" }, icone("triangle-alert", 16), `Falta cortar ${brl(dif)}`)
      : dif === 0 ? el("span", { class: "status-mesa ok" }, icone("circle-check", 16), "Orçamento fechado")
        : el("span", { class: "status-mesa ok" }, icone("circle-check", 16), `Dentro do teto · sobram ${brl(-dif)}`);
    total.replaceChildren(
      el("div", { class: "numeros" }, el("span", {}, el("span", { class: "grande" }, brl(t)), el("span", { class: "suave" }, ` de ${brl(teto)}`)), st),
      el("div", { class: `barra-teto ${dif > 0 ? "estouro" : ""}`, role: "img", "aria-label": `Total ${brl(t)} de ${brl(teto)}` }, el("span", { style: `width:${Math.min(100, (t / teto) * 100)}%` })),
      c.evento ? el("div", { class: "pequeno suave", style: "margin-top:.35rem" }, `Teto = ${brl(c.orcamento)} ${Number(c.evento.delta_orcamento) < 0 ? "−" : "+"} ${brl(Math.abs(c.evento.delta_orcamento))} (${min1(c.evento.titulo)})`) : "");
    const agora = dif > 0;
    if (estourado === false && agora) SOM.tocar("alerta");
    if (estourado === true && !agora) SOM.tocar("fechado");
    estourado = agora;
    btnSeguir.disabled = agora;
  };
  const aplicarPrevia = (p) => {
    inds.replaceChildren(blocosIndicadores(camp.indicadores, null, p.tendencia));
    for (const d of p.demandas) { const l = linhas[d.id]; if (l) l.avatar.replaceChildren(avatarDe(ator(d.solicitante), d.expressao, 44)); }
  };
  const definir = (d, valor, comSom = true) => {
    const v = Math.max(0, Math.min(d.custo, Math.round(valor / 500) * 500));
    const mudou = v !== estado.aloc[d.id];
    estado.aloc[d.id] = v;
    const l = linhas[d.id];
    const df = v - (estado.base[d.id] || 0);
    l.valor.textContent = brl(v);
    l.menos.disabled = v <= 0; l.mais.disabled = v >= d.custo;
    l.status.className = `status-linha ${df < 0 ? "corte" : df > 0 ? "aumento" : "igual"}`;
    l.status.textContent = df === 0 ? "sem mudança" : df < 0 ? `corte de ${brl(-df)}` : `aumento de ${brl(df)}`;
    l.barra.style.width = `${(v / d.custo) * 100}%`;
    if (comSom && mudou) SOM.tocar("passo");
    atualizarTotal();
    pedirPrevia(aplicarPrevia);
  };

  const cartaoLinhas = el("div", { class: "cartao", style: "padding:.2rem 1rem" }, c.demandas.map((d) => {
    const a = ator(d.solicitante);
    const l = { valor: el("output", { "aria-live": "polite" }), status: el("span", {}), barra: el("span", {}), avatar: el("span", {}) };
    l.menos = el("button", { type: "button", "aria-label": `Diminuir ${d.titulo} em R$ 500`, onclick: () => definir(d, estado.aloc[d.id] - 500) }, icone("minus", 20));
    l.mais = el("button", { type: "button", "aria-label": `Aumentar ${d.titulo} em R$ 500`, onclick: () => definir(d, estado.aloc[d.id] + 500) }, icone("plus", 20));
    l.avatar.append(avatarDe(a, AVATAR.expressaoDePostura(a?.postura_inicial ?? 0), 44));
    linhas[d.id] = l;
    return el("div", { class: "linha-mesa" },
      l.avatar,
      el("div", {}, el("div", { class: "nome" }, d.titulo),
        el("div", { class: "meta-linha" }, `Pedido: ${brl(d.custo)} · ano anterior: ${brl(estado.base[d.id] || 0)} · ${a?.nome || ""}`),
        el("div", { class: "meta-linha" }, `Afeta: ${(d.afeta || []).join(", ") || "—"}`),
        el("button", { class: "botao fantasma", style: "min-height:0;padding:.1rem 0;font-size:.82rem", onclick: () => abrirPainel(d.titulo, el("p", {}, d.beneficio),
          el("p", { class: "pequeno suave" }, `Quem pede: ${a?.nome || d.solicitante} (${a?.papel || ""}).`)) }, "Detalhes")),
      el("div", { class: "mini-barra", "aria-hidden": "true" }, l.barra, el("i", { style: `left:${((estado.base[d.id] || 0) / d.custo) * 100}%` })),
      el("div", { class: "controle" }, el("div", { class: "passo" }, l.menos, l.valor, l.mais), l.status));
  }));

  const rot = passoRoteiro();
  tela(passosTrimestre(1),
    rot ? faixaRoteiro("aplique a divisão do roteiro.", () => { for (const d of c.demandas) definir(d, rot.alocacao[d.id] || 0, false); SOM.tocar("passo"); }, "Aplicar") : "",
    el("div", { class: "linha entre" }, el("p", { class: "pequeno suave", style: "margin:0" }, "Ajuste de R$ 500 em R$ 500. Os indicadores mostram uma prévia."), relogio),
    total, inds, cartaoLinhas,
    el("div", { class: "acoes" }, el("button", { class: "botao secundario", onclick: () => { for (const d of c.demandas) definir(d, estado.base[d.id] || 0, false); } },
      icone("refresh-ccw", 18), "Voltar ao ano anterior"), btnSeguir),
    el("details", { class: "cartao pequeno" }, el("summary", {}, el("strong", {}, "Como calculamos a prévia")),
      el("p", {}, "Cada pedido tem um efeito por indicador quando financiado e outro quando adiado; financiar em parte rende em proporção. Dinheiro guardado melhora a saúde financeira. Regras públicas em config/indicadores.yaml; nenhuma IA é usada na prévia.")));
  for (const d of c.demandas) definir(d, estado.aloc[d.id], false);
  estourado = soma() > teto;
  atualizarTotal();
  iniciarRelogio(relogio);
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

// ------------------------------------------------------------------ decisão (Ata)
const CRITERIOS = ["Maior impacto nas vendas", "Mais associados beneficiados", "Urgência", "Menor risco financeiro", "Exigência de parceiro"];
const CORTES = ["Menor impacto no curto prazo", "Pode esperar o próximo trimestre", "Há outra fonte de recurso", "Respeitar o teto sem usar a reserva", "Pedido da diretoria"];
const CANAIS = ["Assembleia", "WhatsApp", "Reunião setorial", "Jornal local"];
const PRAZOS = ["o fim do trimestre", "30 dias", "60 dias", "90 dias"];
const REVISOES = ["30 dias", "60 dias", "90 dias"];
const RESPONSAVEIS = ["Presidência", "Diretoria executiva", "Gerência", "Comissão de associados"];

function construtor() {
  if (!estado.escolhas.construtor) {
    const k = estado.escolhas.construtor = { motivos: [], motivoLivre: "", envolvidos: [], cortes: [], canais: [], canalLivre: "", qtd: "", oque: [], oqueLivre: "",
      prazo: [], revisao: [], responsavel: [], indicador: [] };
    const rot = passoRoteiro();
    if (rot?.construtor) for (const [ch, v] of Object.entries(rot.construtor)) k[ch] = Array.isArray(v) ? [...v] : v;
  }
  return estado.escolhas.construtor;
}
function houveCorte() { return estado.campanha.cenario.demandas.some((d) => estado.aloc[d.id] < (estado.base[d.id] || 0)); }
function textoMeta(k) {
  const oque = k.oqueLivre.trim() || k.oque[0] || "";
  if (!k.qtd || !oque || !k.prazo[0]) return "";
  return `${k.qtd} ${oque} até ${k.prazo[0]}` + (k.revisao[0] ? `; reavaliar em ${k.revisao[0]}` : "");
}

function telaDecisao() {
  const c = estado.campanha.cenario;
  const k = construtor();
  topo("Ata da decisão", c.titulo, telaMesa); abas(null);
  const corpo = el("div", {});
  const render = () => {
    const ok1 = k.motivos.length || k.motivoLivre.trim();
    const ok2 = k.envolvidos.length > 0;
    const ok3 = !houveCorte() || k.cortes.length > 0;
    const ok4 = k.canais.length || k.canalLivre.trim();
    const ok5 = !!textoMeta(k) && k.responsavel.length && k.indicador.length;
    const passo = (n, ok, titulo, ...conteudo) => el("div", { class: "cartao" }, el("div", { class: "passo-num" },
      el("span", { class: `n ${ok ? "ok" : ""}`, "aria-label": ok ? `Passo ${n} concluído` : `Passo ${n}` }, ok ? icone("circle-check", 16) : String(n)),
      el("div", { class: "corpo" }, el("h3", { style: "margin-top:.15rem" }, titulo), ...conteudo)));
    const livre = (chave, rotulo, id) => {
      const inp = el("input", { type: "text", id, maxlength: 300, value: k[chave] });
      inp.addEventListener("input", () => { k[chave] = inp.value; });
      inp.addEventListener("change", render);
      return el("div", {}, el("label", { for: id }, rotulo), el("div", { class: "linha" }, el("div", { style: "flex:1;min-width:180px" }, inp), botaoVoz(inp)));
    };
    const qtd = el("input", { type: "number", id: "meta-qtd", min: 1, max: 100000, inputmode: "numeric", value: k.qtd, style: "max-width:140px" });
    qtd.addEventListener("input", () => { k.qtd = qtd.value; }); qtd.addEventListener("change", render);
    const sugestoes = c.demandas.filter((d) => estado.aloc[d.id] > 0).map((d) => d.meta_sugerida).filter(Boolean);
    const cortadas = c.demandas.filter((d) => estado.aloc[d.id] < (estado.base[d.id] || 0));
    corpo.replaceChildren(
      passo(1, ok1, "Por que essa prioridade?", el("p", { class: "pequeno suave" }, "Até 2 critérios."), chips(CRITERIOS, k.motivos, { aoMudar: render }), livre("motivoLivre", "Outro critério (opcional)", "m-livre")),
      passo(2, ok2, "Quem você envolve antes de decidir?", el("p", { class: "pequeno suave" }, "Toque em quem será ouvido antes da decisão final."),
        el("div", { class: "envolvidos" }, c.atores.map((a) => el("button", { type: "button", "aria-pressed": String(k.envolvidos.includes(a.id)), onclick: () => {
          const i = k.envolvidos.indexOf(a.id); i >= 0 ? k.envolvidos.splice(i, 1) : k.envolvidos.push(a.id); render(); } },
          avatarDe(a, "neutra", 40, true), a.nome.split(" ").slice(0, 2).join(" "))))),
      passo(3, ok3, houveCorte() ? "Por que cortar?" : "Cortes", houveCorte()
        ? [el("p", { class: "pequeno suave" }, `Cortes em: ${cortadas.map((d) => `${d.titulo} (−${brl((estado.base[d.id] || 0) - estado.aloc[d.id])})`).join("; ")}.`), chips(CORTES, k.cortes, { aoMudar: render })]
        : el("p", { class: "pequeno suave" }, "Nenhuma linha foi cortada em relação ao ano anterior.")),
      passo(4, ok4, "Como vai comunicar aos associados?", chips(CANAIS, k.canais, { aoMudar: render }), livre("canalLivre", "Outro canal (opcional)", "c-livre")),
      passo(5, ok5, "Meta, responsável e acompanhamento",
        el("p", { class: "pequeno suave" }, "[quantidade] [o quê] até [quando]; reavaliar em 30, 60 ou 90 dias"),
        el("label", { for: "meta-qtd" }, "Quantidade"), qtd,
        el("p", { class: "rotulo-secao" }, "O quê"), sugestoes.length ? chips(sugestoes, k.oque, { multiplo: false, aoMudar: render }) : "",
        livre("oqueLivre", "Ou escreva o que será medido", "o-livre"),
        el("p", { class: "rotulo-secao" }, "Até quando"), chips(PRAZOS, k.prazo, { multiplo: false, aoMudar: render }),
        el("p", { class: "rotulo-secao" }, "Reavaliar em"), chips(REVISOES, k.revisao, { multiplo: false, aoMudar: render }),
        el("p", { class: "rotulo-secao" }, "Responsável"), chips(RESPONSAVEIS, k.responsavel, { multiplo: false, aoMudar: render }),
        el("p", { class: "rotulo-secao" }, "Indicador de acompanhamento"), chips(estado.cfg.indicadores.map((i) => i.nome), k.indicador, { multiplo: false, aoMudar: render })),
      avisoVoz(),
      el("div", { class: "acoes" }, el("button", { class: "botao bloco", onclick: () => { SOM.tocar("confirmar"); telaAta(); } }, "Ver a Ata da decisão", icone("chevron-right", 18))));
  };
  tela(passosTrimestre(2), passoRoteiro() ? faixaRoteiro("os passos já vêm preenchidos; confira e avance.") : "", corpo);
  render();
}

function gerarAta() {
  const c = estado.campanha.cenario;
  const k = construtor();
  const nomes = Object.fromEntries(c.atores.map((a) => [a.id, a.nome]));
  const fin = c.demandas.filter((d) => estado.aloc[d.id] > 0).sort((a, b) => estado.aloc[b.id] - estado.aloc[a.id])
    .map((d) => `${d.titulo} (${brl(estado.aloc[d.id])}${estado.aloc[d.id] < d.custo ? ` de ${brl(d.custo)}` : ""})`);
  const adi = c.demandas.filter((d) => !estado.aloc[d.id]).map((d) => d.titulo);
  const cortes = c.demandas.filter((d) => estado.aloc[d.id] < (estado.base[d.id] || 0)).map((d) => `${d.titulo} −${brl((estado.base[d.id] || 0) - estado.aloc[d.id])}`);
  const saldo = c.disponivel - Object.values(estado.aloc).reduce((a, b) => a + b, 0);
  const limites = [`teto de ${brl(c.disponivel)}` + (c.evento ? ` (${min1(c.evento.titulo)})` : "")];
  if (c.regras[0]) limites.push(min1(c.regras[0].texto.replace(/\.$/, "")));
  const crit = [...k.motivos, k.motivoLivre.trim()].filter(Boolean);
  const canais = [...k.canais, k.canalLivre.trim()].filter(Boolean);
  return [
    `Prioridade: ${fin.join("; ") || "nenhum pedido financiado"}` + (adi.length ? `. Adiado: ${adi.join(", ")}` : "") + (saldo > 0 ? `. Saldo guardado: ${brl(saldo)}` : "") + ".",
    `Critérios: ${crit.map(min1).join("; ") || "(não informado)"}.`,
    `Envolvidos antes de decidir: ${k.envolvidos.map((id) => nomes[id]).join(", ") || "(ninguém)"}.`,
    cortes.length ? `Cortes: ${cortes.join("; ")}; motivo: ${k.cortes.map(min1).join("; ") || "não informado"}.` : "Cortes: nenhum em relação ao ano anterior.",
    `Limites que pesaram: ${limites.join("; ")}.`,
    `Comunicação: ${canais.map((x) => (x === "WhatsApp" ? x : min1(x))).join(", ") || "(não definida)"}.`,
    `Meta: ${textoMeta(k) || "(não definida)"}` + (k.responsavel[0] ? `; responsável: ${min1(k.responsavel[0])}` : "") + (k.indicador[0] ? `; indicador: ${min1(k.indicador[0])}` : "") + ".",
  ].join("\n");
}

function telaAta() {
  const k = construtor();
  topo("Ata da decisão", "Conferir e confirmar", telaDecisao); abas(null);
  const area = el("textarea", { id: "ata", maxlength: estado.cfg.decisao.max_caracteres, rows: 9, class: "ata" });
  area.value = k.ataEditada || gerarAta();
  area.addEventListener("input", () => { k.ataEditada = area.value; });
  const completo = (k.motivos.length || k.motivoLivre) && k.envolvidos.length && (k.canais.length || k.canalLivre) && textoMeta(k);
  const botao = el("button", { class: "botao bloco", type: "submit" }, icone("file-check", 18), "Confirmar a decisão");
  const form = el("form", { class: "cartao", onsubmit: async (ev) => {
    ev.preventDefault(); botao.disabled = true;
    const c = estado.campanha.cenario;
    const escolhas = {
      construtor: k, motivos: [...k.motivos, k.motivoLivre].filter(Boolean), canais: [...k.canais, k.canalLivre].filter(Boolean),
      envolvidos: [...k.envolvidos], cortes_justificativa: [...k.cortes], responsavel: k.responsavel[0] || "", indicador_acompanhamento: k.indicador[0] || "",
      revisao_dias: Number((k.revisao[0] || "").split(" ")[0]) || null, meta: textoMeta(k), ano_anterior: { ...estado.base },
      comunicacao: (k.canais.length || k.canalLivre) ? 1 : 0, meta_mensuravel: textoMeta(k) ? 1 : 0, revisao_programada: k.revisao.length ? 1 : 0,
      resumo_completo: completo ? 1 : 0, continuidade: estado.escolhas.continuidade, considerou_vivencias: estado.escolhas.considerou_vivencias ? 1 : 0,
      envolveu_diretoria: k.envolvidos.some((id) => ["diretoria", "conselho"].includes(c.atores.find((a) => a.id === id)?.tipo)) ? 1 : 0,
    };
    try {
      const r = await api(`/api/campanhas/${estado.campanhaId}/tentativas`, { method: "POST", body: { decisao: area.value, alocacao: estado.aloc, escolhas } });
      clearInterval(estado.relogio);
      SOM.tocar("inicio_simulacao");
      telaResultado(r.tentativa_id);
    } catch (e) { mostrarErro(form, e); botao.disabled = false; }
  } },
    el("p", { class: "pequeno suave", style: "margin-top:0" }, "Alguém de fora deve entender a prioridade e os limites que pesaram. Você pode editar."),
    el("label", { for: "ata", class: "sr" }, "Ata da decisão"), area,
    el("div", { class: "linha" }, botaoVoz(area), el("button", { type: "button", class: "botao fantasma", onclick: () => { k.ataEditada = ""; area.value = gerarAta(); } }, icone("refresh-ccw", 16), "Refazer")),
    completo ? "" : el("div", { class: "aviso" }, icone("info", 18), el("span", {}, "Com critério, envolvidos, comunicação e meta preenchidos, a Ata fica mais clara.")),
    botao);
  tela(passosTrimestre(2), form);
}

// ------------------------------------------------------------------ resultado
async function telaResultado(tid) {
  const t = await api(`/api/tentativas/${tid}`);
  const camp = estado.campanha;
  topo("Resultado", camp.cenario?.titulo || "", telaPainel); abas(null);
  if (!t.resultado) return tela(el("div", { class: "info" }, icone("refresh-ccw", 18), el("span", {}, "Processando…")));
  const r = t.resultado, ind = r.indicadores;
  const nomeInd = Object.fromEntries(estado.cfg.indicadores.map((i) => [i.id, i.nome]));
  const status = el("div", { "aria-live": "polite" });
  const blocoSim = el("div", {});
  const devol = el("div", {});
  const conversaBox = el("div", {});
  const barras = (indic) => el("div", { class: "barras-ind cartao" }, Object.keys(indic.depois).map((k) =>
    el("div", { class: "l" }, el("span", {}, nomeInd[k]), el("span", { class: "barra" }, el("span", { style: `width:${indic.depois[k]}%` })),
      el("span", { class: "v" }, Number(indic.depois[k]).toFixed(0)), delta(indic.variacao[k]))));
  const caixaBarras = el("div", {}, barras(ind));
  tela(passosTrimestre(3),
    t.modo === "contingencia" && t.aviso ? el("div", { class: "aviso" }, icone("info", 18), el("span", {}, t.aviso)) : "",
    el("p", { class: "rotulo-secao", style: "margin-top:0" }, "Indicadores"), caixaBarras,
    el("details", { class: "cartao pequeno" }, el("summary", {}, el("strong", {}, "Como calculamos")),
      el("p", {}, "O resultado sai primeiro da divisão do orçamento, por regras fixas. A simulação dos agentes ajusta no máximo 10 pontos por indicador."),
      el("ul", {}, ind.auditoria.slice(0, 40).map((a) => el("li", {}, `${nomeInd[a.indicador] || a.indicador}: ${a.pontos > 0 ? "+" : ""}${a.pontos} — ${a.detalhe}`)))),
    r.meta ? el("div", { class: "cartao" }, el("h3", {}, "Meta"), el("p", { class: "pequeno" }, r.meta.texto),
      el("div", { class: "barra", role: "meter", "aria-valuemin": 0, "aria-valuemax": r.meta.alvo, "aria-valuenow": r.meta.previsto, "aria-label": `Previsto ${r.meta.previsto} de ${r.meta.alvo}` },
        el("span", { style: `width:${Math.min(100, r.meta.pct)}%` })),
      el("p", { class: "pequeno" }, `Previsto: ${r.meta.previsto} de ${r.meta.alvo} (${r.meta.pct}%) · ${r.meta.situacao}`)) : "",
    status, blocoSim, devol, conversaBox,
    el("details", { class: "cartao" }, el("summary", {}, el("strong", {}, "Ata da decisão")), el("pre", { class: "ata" }, t.decisao)),
    el("div", { class: "acoes" },
      el("button", { class: "botao secundario", onclick: async () => { estado.campanha = await api(`/api/campanhas/${camp.id}`); iniciarTrimestre(t.alocacao); } }, icone("refresh-ccw", 18), "Refazer a decisão"),
      el("button", { class: "botao", onclick: async () => {
        try {
          estado.campanha = await api(`/api/campanhas/${camp.id}/avancar`, { method: "POST", body: { tentativa_id: t.id } });
          SOM.tocar("confirmar");
          estado.campanha.status === "concluida" ? irPara("relatorio") : iniciarTrimestre();
        } catch (e) { mostrarErro(main(), e); } } }, camp.indice_atual + 1 >= camp.total ? "Concluir o mandato" : "Próximo trimestre", icone("chevron-right", 18))),
    el("p", { class: "pequeno suave" }, `Custo desta tentativa: R$ ${t.custo.total_brl.toFixed(2)}.`));
  verificarSelos();
  let revelado = r.fase === "completo";
  const atualizar = (tt) => {
    const rr = tt.resultado;
    if (rr.fase !== "completo") {
      status.replaceChildren(el("div", { class: "info" }, el("span", { class: "girando", style: "display:inline-flex" }, icone("refresh-ccw", 18)),
        el("span", {}, `Os envolvidos estão reagindo à decisão (${tt.progresso || 0}%). A devolutiva e a conversa já estão disponíveis.`)));
    } else {
      status.replaceChildren();
      if (!revelado) { revelado = true; SOM.tocar("fim_simulacao"); setTimeout(() => SOM.tocar("revelar"), 350); }
      caixaBarras.replaceChildren(barras(rr.indicadores));
      blocoSim.replaceChildren(blocoPrevisao(rr));
    }
    if (tt.devolutiva && !devol.dataset.ok) { devol.dataset.ok = "1"; devol.replaceChildren(blocoDevolutiva(tt.devolutiva)); }
    if (!conversaBox.dataset.ok) { conversaBox.dataset.ok = "1"; painelConversa(tt).then((p) => conversaBox.replaceChildren(p)); }
    return rr.fase === "completo" && tt.devolutiva;
  };
  if (!atualizar(t)) {
    estado.timer = setInterval(async () => {
      try { const tt = await api(`/api/tentativas/${tid}`); if (atualizar(tt)) { clearInterval(estado.timer); verificarSelos(); } } catch (_) {}
    }, 3000);
  }
}

function blocoPrevisao(rr) {
  const momentos = rr.momentos || [];
  const riscos = rr.riscos || [];
  return el("div", {},
    momentos.length ? el("div", { class: "cartao" }, el("h3", {}, "Reações previstas"),
      el("ol", { class: "linha-tempo" }, momentos.map((m) => {
        const a = ator(m.ator_id) || { id: m.ator_id, nome: m.nome, tipo: m.tipo };
        const reac = (rr.reacoes || []).find((x) => x.ator_id === m.ator_id);
        return el("li", {}, avatarDe(a, AVATAR.expressaoDePostura(reac?.postura_final ?? 0), 44), el("div", {}, el("strong", {}, a.nome), el("div", { class: "pequeno" }, m.fala)));
      })),
      rr.resumo ? el("details", {}, el("summary", { class: "pequeno" }, "Resumo da simulação"), el("p", { class: "pequeno" }, rr.resumo)) : "") : "",
    riscos.length ? el("div", { class: "cartao" }, el("h3", {}, "Mapa de riscos"), mapaRiscos(riscos),
      el("ol", { class: "pequeno" }, riscos.map((x) => el("li", {}, `${x.descricao} (probabilidade ${x.probabilidade}, impacto ${x.impacto})`))),
      (rr.sinais_alerta || []).length ? [el("h3", {}, "Sinais de alerta"), el("ul", { class: "pequeno" }, rr.sinais_alerta.map((s) => el("li", {}, s)))] : "",
      el("p", { class: "aviso-fixo" }, "Simulação para apoio à decisão; não é garantia de resultado.")) : "");
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

function blocoDevolutiva(dev) {
  if (dev.erro) return el("p", { class: "suave pequeno" }, dev.erro);
  const lista = (t, itens) => (itens?.length ? [el("h3", {}, t), el("ul", { class: "pequeno" }, itens.map((i) => el("li", {}, i)))] : "");
  return el("details", { class: "cartao" }, el("summary", {}, el("strong", {}, "Devolutiva: pontos fortes, riscos e perguntas")),
    lista("Pontos fortes", dev.pontos_fortes), lista("Riscos que ficaram de fora", dev.riscos_ignorados), lista("O que ganhou e o que custou", dev.trade_offs),
    lista("Para refletir", dev.perguntas_reflexivas),
    el("details", {}, el("summary", { class: "pequeno" }, "Competências (rubrica)"),
      el("table", {}, el("tbody", {}, dev.competencias.map((c) => el("tr", {}, el("th", { scope: "row" }, c.nome), el("td", {}, c.nivel ? `${c.nivel} — ${c.nivel_nome}` : c.nivel_nome)))))));
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
    cen.atores.map((a) => el("option", { value: a.id }, `${a.nome} — ${TIPOS[a.tipo] || a.tipo}`)));
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
      const [p, cen, fts, perf] = await Promise.all([f("/api/facilitador/partidas"), f("/api/facilitador/cenarios"), f("/api/facilitador/fatos"), f("/api/facilitador/perfil-padrao")]);
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
