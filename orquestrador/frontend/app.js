/* Liderança em Jogo — SPA sem dependências. Todo texto dinâmico entra via textContent (sem innerHTML).
   Fluxo do trimestre: pauta → orçamento (prévia instantânea, sem IA) → decisão → resultado e conversa. */
"use strict";

const estado = { cfg: null, token: localStorage.getItem("lej_token"), apelido: localStorage.getItem("lej_apelido"),
  campanhaId: localStorage.getItem("lej_campanha"), campanha: null, timer: null, aloc: {}, previa: null,
  reuniaoFim: null, relogio: null, escolhas: {} };

const POSTURA = { "-2": "insatisfeita", "-1": "desconfiada", "0": "neutra", "1": "favorável", "2": "favorável" };
const TIPOS = { associado: "Associado", diretoria: "Diretoria", conselho: "Conselho", funcionarios: "Equipe",
  poder_publico: "Poder público", imprensa: "Imprensa", sindicato: "Sindicato", consumidores: "Comunidade",
  entidade_concorrente: "Outra entidade", federacao: "Federação", parceiro: "Parceiro", conselheiro: "Conselheiro" };
const SETA = { sobe: "▲", desce: "▼", estavel: "■" };

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
  container.querySelectorAll(":scope > .erro").forEach((n) => n.remove());
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

function ator(id) { return (estado.campanha?.cenario?.atores || []).find((a) => a.id === id); }

function avatarDe(a, expressao, tamanho = 56) {
  const svg = AVATAR.criar({ id: a?.id, tipo: a?.tipo, genero: a?.genero, idade: a?.idade, expressao, tamanho });
  svg.setAttribute("aria-label", `${a?.nome || "?"}, ${AVATAR.NOME_EXPR[expressao] || "neutra"}`);
  return svg;
}

function influencia(n) {
  return el("span", { class: "influencia", "aria-label": `Influência ${n} de 5` }, "●".repeat(n), el("span", { class: "apagado" }, "●".repeat(5 - n)));
}

// ------------------------------------------------------------------ indicadores
function renderIndicadores(valores, variacao, tendencia) {
  const sec = $("#indicadores");
  if (!valores) { sec.hidden = true; return; }
  sec.hidden = false;
  sec.replaceChildren(...estado.cfg.indicadores.map((i) => {
    const v = Number(valores[i.id] ?? 0);
    const t = tendencia?.[i.id];
    return el("div", { class: "indicador", title: i.descricao },
      el("div", { class: "nome" }, i.nome),
      el("div", { class: "valor" }, v.toFixed(0), " ",
        variacao ? delta(variacao[i.id]) : "",
        t ? el("span", { class: `tendencia t-${t}`, "aria-label": `tendência: ${t}` }, SETA[t]) : ""),
      el("div", { class: "barra", role: "meter", "aria-valuemin": 0, "aria-valuemax": 100,
        "aria-valuenow": v.toFixed(0), "aria-label": `${i.nome}: ${v.toFixed(0)} de 100` },
        el("span", { style: `width:${Math.max(0, Math.min(100, v))}%` })));
  }));
}

async function verificarStatus() {
  try {
    const s = await api("/api/status");
    $("#faixa-status").replaceChildren(s.mirofish ? "" : el("div", { class: "aviso faixa" },
      "Simulador de agentes indisponível: o jogo segue em modo de contingência (simulação simplificada)."));
  } catch (_) { /* silencioso */ }
}

// ------------------------------------------------------------------ início
function telaInicio() {
  renderIndicadores(null);
  const campo = el("input", { type: "text", id: "apelido", maxlength: 40, autocomplete: "nickname",
    value: estado.apelido || "", "aria-describedby": "dica-apelido" });
  const perfis = estado.cfg.perfis || [];
  const escolhaPerfil = el("fieldset", { class: "perfis" }, el("legend", {}, "Qual associação você vai liderar?"),
    perfis.map((p) => el("label", { class: "cartao-opcao" },
      el("input", { type: "radio", name: "perfil", value: p.id, checked: p.id === estado.cfg.perfil_padrao }),
      el("strong", {}, p.nome), el("span", { class: "pequeno" }, p.descricao))));
  const form = el("form", { class: "cartao", onsubmit: async (ev) => {
    ev.preventDefault();
    try {
      const r = await api("/api/sessoes", { method: "POST", body: { apelido: campo.value } });
      estado.token = r.token; estado.apelido = r.apelido;
      localStorage.setItem("lej_token", r.token); localStorage.setItem("lej_apelido", r.apelido);
      const perfil = form.querySelector("input[name=perfil]:checked")?.value;
      await novaCampanha(perfil);
    } catch (e) { mostrarErro(form, e); }
  } },
    el("label", { for: "apelido" }, "Como quer ser chamado(a)?"), campo,
    el("p", { id: "dica-apelido", class: "suave pequeno" }, "Pode ser um apelido. Não pedimos e-mail nem dados pessoais."),
    perfis.length > 1 ? escolhaPerfil : "",
    el("button", { type: "submit", class: "grande" }, "Começar"));
  const continuar = estado.token && estado.campanhaId
    ? el("p", {}, el("button", { class: "secundario grande", onclick: () => abrirCampanha(estado.campanhaId) }, "Continuar de onde parei"))
    : null;
  tela("Formar lideranças para decidir e acompanhar resultados",
    el("p", { class: "destaque" }, "Você vai presidir uma associação comercial por dois trimestres: escolher prioridades, dividir o orçamento e acompanhar os resultados."),
    continuar, form,
    el("div", { class: "cartao conselho-convite" },
      AVATAR.criar({ id: "conselheiro", tipo: "conselheiro", genero: "m", idade: 70, expressao: "favoravel", tamanho: 72 }),
      el("div", {}, el("h2", {}, "Sala do Conselho"),
        el("p", {}, "É dirigente experiente? Conte, por voz ou texto, o que você aprendeu. Leva uns 5 minutos."),
        el("button", { class: "secundario grande", onclick: () => telaConselho(1) }, "Contribuir com minha experiência"))));
}

async function novaCampanha(perfil) {
  const c = await api("/api/campanhas", { method: "POST", body: { perfil } });
  estado.campanhaId = c.id; localStorage.setItem("lej_campanha", c.id);
  estado.campanha = c;
  iniciarTrimestre();
}

async function abrirCampanha(id) {
  try {
    estado.campanha = await api(`/api/campanhas/${id}`);
    if (estado.campanha.status === "concluida") return telaFinal();
    const ultima = estado.campanha.tentativas.at(-1);
    if (ultima) return telaResultado(ultima.id);
    iniciarTrimestre();
  } catch (e) {
    if (e.status === 401 || e.status === 404) { localStorage.removeItem("lej_campanha"); estado.campanhaId = null; telaInicio(); }
    else alert(e.message);
  }
}

function iniciarTrimestre(alocInicial) {
  const c = estado.campanha.cenario;
  estado.aloc = {};
  for (const d of c.demandas) estado.aloc[d.id] = alocInicial?.[d.id] ?? 0;
  estado.escolhas = {};
  estado.previa = null;
  estado.reuniaoFim = null;
  telaPauta();
}

// ------------------------------------------------------------------ pauta
function cabecalhoTrimestre() {
  const camp = estado.campanha;
  return el("p", { class: "etapas", "aria-label": "Etapa atual" },
    ["Pauta", "Orçamento", "Decisão", "Resultado"].map((n, i) => el("span", { class: "etapa", "data-i": i }, n)),
    el("span", { class: "suave" }, ` · ${camp.cenario.periodo} ${camp.indice_atual + 1} de ${camp.total}`));
}

function marcarEtapa(i) { document.querySelectorAll(".etapa").forEach((e) => e.classList.toggle("atual", Number(e.dataset.i) === i)); }

function cartaoAtor(a, expressao) {
  const detalhe = el("div", { class: "ator-detalhe", hidden: true },
    el("strong", {}, a.nome), el("div", { class: "pequeno" }, a.papel),
    el("div", { class: "pequeno" }, "Influência: ", influencia(a.influencia)),
    el("div", { class: "pequeno" }, `Postura: ${POSTURA[a.postura_inicial]}`));
  const botao = el("button", { class: "ator-botao", type: "button", "aria-expanded": "false",
    onclick: () => { detalhe.hidden = !detalhe.hidden; botao.setAttribute("aria-expanded", String(!detalhe.hidden)); } },
    avatarDe(a, expressao || AVATAR.expressaoDePostura(a.postura_inicial)),
    el("span", { class: "ator-nome" }, a.nome.split(" ").slice(0, 2).join(" ")));
  return el("li", { class: "ator-item" }, botao, detalhe);
}

function telaPauta() {
  const camp = estado.campanha;
  const c = camp.cenario;
  renderIndicadores(camp.indicadores);
  tela(c.titulo, cabecalhoTrimestre(),
    el("div", { class: "cartao narrativa" }, el("p", {}, c.narrativa || c.texto.split(/\n\n/)[0])),
    c.evento ? el("div", { class: "cartao evento" }, el("span", { class: "icone-grande", "aria-hidden": "true" }, Number(c.evento.delta_orcamento) < 0 ? "📉" : "📈"),
      el("div", {}, el("strong", {}, c.evento.titulo), el("div", { class: "pequeno" }, c.evento.texto))) : "",
    el("div", { class: "linha tags", "aria-label": "O que está em jogo" }, c.tags.map((t) => el("span", { class: "etiqueta" }, t))),
    el("h2", {}, "Quem está envolvido"),
    el("ul", { class: "fileira-avatares", role: "list" }, c.atores.map((a) => cartaoAtor(a))),
    el("p", { class: "suave pequeno" }, "Toque em uma pessoa para ver papel, influência e postura."),
    blocoExperiencias(),
    el("h2", {}, "Regras deste trimestre"),
    el("ul", { class: "regras", role: "list" }, c.regras.map((r) => el("li", {}, el("span", { class: "icone", "aria-hidden": "true" }, r.icone), r.texto))),
    c.inspirado_em ? el("p", { class: "suave pequeno" }, "Inspirado em: ",
      el("a", { href: c.inspirado_em.url, rel: "noopener", target: "_blank" }, c.inspirado_em.titulo),
      ` — ${c.inspirado_em.veiculo}, ${c.inspirado_em.data}. Nomes trocados por fictícios.`) : "",
    el("p", {}, el("button", { class: "secundario grande", onclick: abrirConselheiro }, "🦉 Consultar o conselheiro"),
      el("button", { class: "grande", onclick: telaOrcamento }, "Ir para o orçamento →")));
  marcarEtapa(0);
}

// ------------------------------------------------------------------ orçamento
function iniciarRelogio(caixa) {
  const min = estado.cfg.decisao.minutos_reuniao || 10;
  if (!estado.reuniaoFim) estado.reuniaoFim = Date.now() + min * 60000;
  clearInterval(estado.relogio);
  const tick = () => {
    const resta = Math.max(0, estado.reuniaoFim - Date.now());
    const m = Math.floor(resta / 60000), s = Math.floor((resta % 60000) / 1000);
    caixa.textContent = resta > 0 ? `⏱️ Reunião: ${m}:${String(s).padStart(2, "0")}` : "⏱️ Tempo da reunião esgotado: decida com o que tem.";
    caixa.classList.toggle("urgente", resta < 60000);
    if (!document.body.contains(caixa)) clearInterval(estado.relogio);
  };
  tick();
  estado.relogio = setInterval(tick, 1000);
}

let previaPendente = null;
function pedirPrevia(atualizar) {
  clearTimeout(previaPendente);
  previaPendente = setTimeout(async () => {
    try {
      estado.previa = await api(`/api/campanhas/${estado.campanhaId}/previa`, { method: "POST",
        body: { alocacao: estado.aloc, escolhas: estado.escolhas } });
      atualizar(estado.previa);
    } catch (_) { /* a validação aparece na tela */ }
  }, 80);
}

function telaOrcamento() {
  const camp = estado.campanha;
  const c = camp.cenario;
  const disp = c.disponivel;
  const relogio = el("div", { class: "relogio", role: "timer", "aria-live": "off" });
  const barra = el("div", { class: "barra-orcamento", role: "img" });
  const saldoTxt = el("p", { class: "saldo", "aria-live": "polite" });
  const linhas = {};

  const soma = () => Object.values(estado.aloc).reduce((a, b) => a + Number(b), 0);
  const atualizarTotais = () => {
    const usado = soma();
    barra.replaceChildren(...c.demandas.map((d, i) => el("span", { class: `fatia f${i % 4}`,
      style: `width:${(estado.aloc[d.id] / disp) * 100}%`, title: `${d.titulo}: ${brl(estado.aloc[d.id])}` })));
    barra.setAttribute("aria-label", `Usado ${brl(usado)} de ${brl(disp)}`);
    saldoTxt.replaceChildren(el("strong", {}, `Saldo: ${brl(disp - usado)}`), ` · usado ${brl(usado)} de ${brl(disp)}`);
  };
  const aplicarPrevia = (p) => {
    renderIndicadores(camp.indicadores, null, p.tendencia);
    for (const d of p.demandas) {
      const l = linhas[d.id]; if (!l) continue;
      l.avatar.replaceChildren(avatarDe(ator(d.solicitante), d.expressao, 64));
      l.humor.textContent = `${ator(d.solicitante)?.nome.split(" ")[0] || ""} fica ${AVATAR.NOME_EXPR[d.expressao]}`;
    }
  };
  const definir = (d, valor) => {
    const outros = soma() - estado.aloc[d.id];
    const v = Math.max(0, Math.min(d.custo, disp - outros, Math.round(valor / 500) * 500));
    estado.aloc[d.id] = v;
    const l = linhas[d.id];
    l.slider.value = v; l.valor.textContent = `${brl(v)} de ${brl(d.custo)}`;
    l.slider.setAttribute("aria-valuetext", `${brl(v)} de ${brl(d.custo)}`);
    atualizarTotais();
    pedirPrevia(aplicarPrevia);
  };

  const cartoes = c.demandas.map((d) => {
    const a = ator(d.solicitante);
    const slider = el("input", { type: "range", min: 0, max: d.custo, step: 500, value: estado.aloc[d.id], id: `s-${d.id}`,
      "aria-describedby": `b-${d.id}` });
    slider.addEventListener("input", () => definir(d, Number(slider.value)));
    const l = { slider, valor: el("span", { class: "valor-demanda" }), avatar: el("span", { class: "avatar-demanda" }),
      humor: el("span", { class: "pequeno suave humor", "aria-live": "polite" }) };
    linhas[d.id] = l;
    l.avatar.append(avatarDe(a, AVATAR.expressaoDePostura(a?.postura_inicial ?? 0), 64));
    return el("article", { class: "cartao demanda" },
      el("div", { class: "demanda-topo" }, l.avatar,
        el("div", {}, el("h3", {}, d.titulo), el("div", { class: "pequeno" }, `Pede: ${a?.nome || d.solicitante}`),
          el("div", { id: `b-${d.id}`, class: "pequeno" }, d.beneficio))),
      el("label", { for: `s-${d.id}`, class: "linha-valor" }, el("span", {}, `Custo: ${brl(d.custo)}`), l.valor),
      slider,
      el("div", { class: "linha botoes-rapidos" },
        el("button", { type: "button", class: "secundario", onclick: () => definir(d, d.custo) }, "Financiar tudo"),
        el("button", { type: "button", class: "secundario", onclick: () => definir(d, d.custo / 2) }, "Metade"),
        el("button", { type: "button", class: "secundario", onclick: () => definir(d, 0) }, "Adiar")),
      l.humor);
  });

  const continuidade = c.continua_de && estado.campanha.historico.length
    ? blocoManterAjustar(c, (aloc) => { for (const d of c.demandas) definir(d, 0); for (const d of c.demandas) definir(d, aloc[d.id] || 0); })
    : "";

  tela("Dividir o orçamento", cabecalhoTrimestre(), relogio,
    el("div", { class: "cartao" },
      el("p", {}, el("strong", {}, `Disponível neste ${c.periodo}: ${brl(disp)}`),
        c.evento ? el("span", { class: "pequeno suave" }, ` (${brl(c.orcamento)} ${Number(c.evento.delta_orcamento) < 0 ? "−" : "+"} ${brl(Math.abs(c.evento.delta_orcamento))}: ${c.evento.titulo.charAt(0).toLowerCase() + c.evento.titulo.slice(1)})`) : ""),
      barra, saldoTxt,
      el("p", { class: "pequeno suave" }, "Os pedidos somam mais do que o disponível. As setas nos indicadores mostram a tendência da sua escolha.")),
    continuidade, cartoes,
    el("p", {}, el("button", { class: "secundario", onclick: telaPauta }, "← Voltar à pauta"),
      el("button", { class: "secundario", onclick: abrirConselheiro }, "🦉 Conselheiro"),
      el("button", { class: "grande", onclick: telaDecisao }, "Registrar a decisão →")));
  marcarEtapa(1);
  for (const d of c.demandas) { linhas[d.id].valor.textContent = `${brl(estado.aloc[d.id])} de ${brl(d.custo)}`; }
  atualizarTotais();
  iniciarRelogio(relogio);
  pedirPrevia(aplicarPrevia);
}

function blocoManterAjustar(c, aplicar) {
  const anterior = estado.campanha.historico.at(-1);
  const fracoes = anterior?.fracoes || {};
  // mesma proporção de cada projeto no trimestre anterior; pedidos novos começam em zero
  const escala = (fator) => Object.fromEntries(c.demandas.map((d) => [d.id, Math.min(d.custo, Math.round(d.custo * (fracoes[d.id] || 0) * fator / 500) * 500)]));
  const msg = el("p", { class: "pequeno", "aria-live": "polite" });
  return el("div", { class: "cartao continuidade" },
    el("h2", {}, "Manter, ajustar ou rever a decisão anterior?"),
    anterior?.resumo ? el("p", { class: "pequeno" }, el("strong", {}, "No trimestre passado: "), anterior.resumo.split("\n")[0]) : "",
    el("div", { class: "linha" },
      el("button", { type: "button", onclick: () => { estado.escolhas.continuidade = "manter"; aplicar(escala(1)); msg.textContent = "Mantido: os mesmos projetos continuam."; } }, "Manter"),
      el("button", { type: "button", class: "secundario", onclick: () => { estado.escolhas.continuidade = "ajustar"; aplicar(escala(1)); msg.textContent = "Ajustar: começamos da decisão anterior. Mexa nos controles abaixo."; document.querySelector(".demanda input[type=range]")?.focus(); } }, "Ajustar"),
      el("button", { type: "button", class: "secundario", onclick: () => { estado.escolhas.continuidade = "rever"; aplicar({}); msg.textContent = "Rever: começando do zero."; } }, "Rever")),
    msg);
}

// ------------------------------------------------------------------ voz (Web Speech API)
const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
const VOZ_OK = !!Reconhecimento;

/** Botão de microfone que escreve no campo (a transcrição continua editável). */
function botaoVoz(campo, aoTerminar) {
  if (!VOZ_OK) return el("span", { class: "pequeno suave" }, "Voz indisponível neste navegador: use o texto.");
  let rec = null;
  const b = el("button", { type: "button", class: "secundario voz", "aria-pressed": "false" }, "🎤 Falar");
  b.addEventListener("click", () => {
    if (rec) { rec.stop(); return; }
    rec = new Reconhecimento();
    rec.lang = "pt-BR"; rec.interimResults = true; rec.continuous = true;
    const inicial = campo.value ? campo.value.trim() + " " : "";
    rec.onresult = (ev) => {
      let txt = "";
      for (const r of ev.results) txt += r[0].transcript;
      campo.value = inicial + txt.trim();
      campo.dispatchEvent(new Event("input"));
    };
    rec.onend = () => { rec = null; b.textContent = "🎤 Falar"; b.setAttribute("aria-pressed", "false"); b.classList.remove("gravando"); aoTerminar?.(); };
    rec.onerror = (ev) => { if (ev.error === "not-allowed") alert("O navegador não deu acesso ao microfone. Use o texto."); };
    rec.start();
    b.textContent = "⏹️ Parar"; b.setAttribute("aria-pressed", "true"); b.classList.add("gravando");
  });
  return b;
}

function avisoVoz() {
  return el("p", { class: "pequeno suave" }, VOZ_OK
    ? "🎤 A voz é transcrita pelo serviço de reconhecimento do navegador (no Chrome, servidores do Google). Revise o texto antes de enviar."
    : "Este navegador não tem reconhecimento de voz. Use os botões ou o texto.");
}

/** Grupo de botões selecionáveis (chips). */
function chips(opcoes, selecionados, { multiplo = true, max = 2, aoMudar } = {}) {
  const grupo = el("div", { class: "chips", role: "group" });
  const render = () => grupo.replaceChildren(...opcoes.map((o) => {
    const ativo = selecionados.includes(o);
    return el("button", { type: "button", class: `chip ${ativo ? "ativo" : ""}`, "aria-pressed": String(ativo),
      onclick: () => {
        const i = selecionados.indexOf(o);
        if (i >= 0) selecionados.splice(i, 1);
        else if (multiplo) { if (selecionados.length >= max) selecionados.shift(); selecionados.push(o); }
        else { selecionados.splice(0, selecionados.length, o); }
        render(); aoMudar?.();
      } }, ativo ? "✓ " + o : o);
  }));
  render();
  return grupo;
}

// ------------------------------------------------------------------ decisão guiada (3 passos + resumo)
const MOTIVOS = ["Maior impacto nas vendas", "Mais associados beneficiados", "Urgência", "Menor risco financeiro", "Exigência de parceiro"];
const CANAIS = ["Assembleia", "WhatsApp", "Reunião setorial", "Jornal local"];
const PRAZOS = ["o fim do trimestre", "30 dias", "60 dias", "90 dias"];
const REVISOES = ["30 dias", "60 dias", "90 dias"];

function construtor() {
  if (!estado.escolhas.construtor) {
    estado.escolhas.construtor = { motivos: [], motivoLivre: "", canais: [], canalLivre: "", qtd: "", oque: [], oqueLivre: "", prazo: [], revisao: [] };
  }
  return estado.escolhas.construtor;
}

function financiadas() {
  const c = estado.campanha.cenario;
  return c.demandas.filter((d) => estado.aloc[d.id] > 0);
}

function passoDecisao(n) {
  const k = construtor();
  const total = 4;
  const progresso = el("p", { class: "pequeno suave" }, `Passo ${n} de ${total}`);
  const voltar = el("button", { class: "secundario", onclick: () => (n === 1 ? telaOrcamento() : passoDecisao(n - 1)) }, "← Voltar");
  const avancar = (rotulo = "Próximo →") => el("button", { class: "grande", onclick: () => passoDecisao(n + 1) }, rotulo);
  const campoLivre = (chave, rotulo, id) => {
    const inp = el("input", { type: "text", id, maxlength: 300, value: k[chave] });
    inp.addEventListener("input", () => { k[chave] = inp.value; });
    return el("div", { class: "livre" }, el("label", { for: id }, rotulo), el("div", { class: "linha" }, inp, botaoVoz(inp)));
  };
  let corpo;
  if (n === 1) {
    corpo = [el("h2", {}, "Por que essa prioridade?"), el("p", { class: "suave" }, "Escolha até 2 motivos."),
      chips(MOTIVOS, k.motivos), campoLivre("motivoLivre", "Outro motivo (opcional)", "m-livre"), avisoVoz(), el("p", {}, voltar, avancar())];
  } else if (n === 2) {
    corpo = [el("h2", {}, "Como vai comunicar aos associados?"), el("p", { class: "suave" }, "Escolha até 2 canais."),
      chips(CANAIS, k.canais), campoLivre("canalLivre", "Outro canal (opcional)", "c-livre"), el("p", {}, voltar, avancar())];
  } else if (n === 3) {
    const sugestoes = financiadas().map((d) => d.meta_sugerida).filter(Boolean);
    const qtd = el("input", { type: "number", id: "meta-qtd", min: 1, max: 100000, inputmode: "numeric", value: k.qtd, class: "qtd" });
    qtd.addEventListener("input", () => { k.qtd = qtd.value; });
    corpo = [el("h2", {}, "Qual a meta e quando rever?"),
      el("p", { class: "modelo-meta" }, "[quantidade] [o quê] até [quando]; reavaliar em 30, 60 ou 90 dias"),
      el("label", { for: "meta-qtd" }, "Quantidade"), qtd,
      el("p", { class: "rotulo" }, "O quê"), sugestoes.length ? chips(sugestoes, k.oque, { multiplo: false }) : "",
      campoLivre("oqueLivre", "Ou escreva/fale o que será medido", "o-livre"),
      el("p", { class: "rotulo" }, "Até quando"), chips(PRAZOS, k.prazo, { multiplo: false }),
      el("p", { class: "rotulo" }, "Reavaliar em"), chips(REVISOES, k.revisao, { multiplo: false }),
      el("p", {}, voltar, avancar("Ver o resumo →"))];
  } else {
    return telaResumoDecisao();
  }
  tela("Registrar a decisão", cabecalhoTrimestre(), el("div", { class: "cartao passo" }, progresso, corpo));
  marcarEtapa(2);
}

const min1 = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

function textoMeta(k) {
  const oque = k.oqueLivre.trim() || k.oque[0] || "";
  if (!k.qtd || !oque || !k.prazo[0]) return "";
  return `${k.qtd} ${oque} até ${k.prazo[0]}` + (k.revisao[0] ? `; reavaliar em ${k.revisao[0]}` : "");
}

/** Resumo de até 5 linhas: prioridade, motivo, limites que pesaram, comunicação e meta. */
function gerarResumo() {
  const c = estado.campanha.cenario;
  const k = construtor();
  const fin = c.demandas.filter((d) => estado.aloc[d.id] >= d.custo).map((d) => `${d.titulo} (${brl(estado.aloc[d.id])})`);
  const parc = c.demandas.filter((d) => estado.aloc[d.id] > 0 && estado.aloc[d.id] < d.custo).map((d) => `${d.titulo} em parte (${brl(estado.aloc[d.id])} de ${brl(d.custo)})`);
  const adi = c.demandas.filter((d) => !estado.aloc[d.id]).map((d) => d.titulo);
  const saldo = c.disponivel - Object.values(estado.aloc).reduce((a, b) => a + b, 0);
  const motivos = [...k.motivos, k.motivoLivre.trim()].filter(Boolean);
  const canais = [...k.canais, k.canalLivre.trim()].filter(Boolean);
  const limites = [`orçamento de ${brl(c.disponivel)}` + (c.evento ? ` (${c.evento.titulo.charAt(0).toLowerCase() + c.evento.titulo.slice(1)})` : "")];
  if (c.regras[0]) limites.push(min1(c.regras[0].texto.replace(/\.$/, "")));
  const linhas = [
    `Prioridade: ${[...fin, ...parc].join("; ") || "nenhum pedido financiado"}` + (adi.length ? `. Adiado: ${adi.join(", ")}` : "") + (saldo > 0 ? `. Guardamos ${brl(saldo)}` : "") + ".",
    `Por quê: ${motivos.map(min1).join("; ") || "(não informado)"}.`,
    `Limites que pesaram: ${limites.join("; ")}.`,
    `Comunicação: ${canais.map((x) => (x === "WhatsApp" ? x : min1(x))).join(", ") || "(não definida)"}.`,
    `Meta: ${textoMeta(k) || "(não definida)"}.`,
  ];
  return linhas.join("\n");
}

function telaResumoDecisao() {
  const k = construtor();
  const area = el("textarea", { id: "resumo", maxlength: estado.cfg.decisao.max_caracteres, rows: 6 });
  area.value = k.resumoEditado || gerarResumo();
  area.addEventListener("input", () => { k.resumoEditado = area.value; });
  const completo = k.motivos.length + (k.motivoLivre ? 1 : 0) > 0 && k.canais.length + (k.canalLivre ? 1 : 0) > 0 && !!textoMeta(k);
  const botao = el("button", { class: "grande", type: "submit" }, "Confirmar decisão");
  const form = el("form", { class: "cartao", onsubmit: async (ev) => {
    ev.preventDefault(); botao.disabled = true; botao.textContent = "Enviando…";
    const escolhas = {
      construtor: k, motivos: [...k.motivos, k.motivoLivre].filter(Boolean),
      canais: [...k.canais, k.canalLivre].filter(Boolean), meta: textoMeta(k),
      comunicacao: (k.canais.length || k.canalLivre) ? 1 : 0, meta_mensuravel: textoMeta(k) ? 1 : 0,
      revisao_programada: k.revisao.length ? 1 : 0, resumo_completo: completo ? 1 : 0,
      continuidade: estado.escolhas.continuidade, experiencias_citadas: estado.escolhas.experiencias_citadas,
      consultou_conselheiro: estado.escolhas.consultou_conselheiro ? 1 : 0,
    };
    try { await enviarDecisao(area.value, escolhas); } catch (e) { mostrarErro(form, e); botao.disabled = false; botao.textContent = "Confirmar decisão"; }
  } },
    el("p", { class: "pequeno suave" }, "Passo 4 de 4"),
    el("h2", {}, "Resumo da decisão"),
    el("p", { class: "suave" }, "Confira: alguém de fora deve entender a prioridade e os limites que pesaram. Você pode editar."),
    el("label", { for: "resumo", class: "sr" }, "Resumo da decisão"), area,
    el("div", { class: "linha" }, botaoVoz(area), el("button", { type: "button", class: "secundario", onclick: () => { k.resumoEditado = ""; area.value = gerarResumo(); } }, "Refazer o resumo")),
    completo ? "" : el("p", { class: "aviso" }, "Dica: com motivo, canal e meta preenchidos, a decisão fica mais clara."),
    el("p", {}, el("button", { type: "button", class: "secundario", onclick: () => passoDecisao(3) }, "← Voltar"), botao));
  tela("Registrar a decisão", cabecalhoTrimestre(), form);
  marcarEtapa(2);
}

function telaDecisao() { passoDecisao(1); }

async function enviarDecisao(texto, escolhas = estado.escolhas) {
  const camp = estado.campanha;
  const r = await api(`/api/campanhas/${camp.id}/tentativas`, { method: "POST",
    body: { decisao: texto, alocacao: estado.aloc, escolhas } });
  clearInterval(estado.relogio);
  telaResultado(r.tentativa_id);
}

// ------------------------------------------------------------------ resultado
async function telaResultado(tid) {
  const t = await api(`/api/tentativas/${tid}`);
  if (!t.resultado) return telaEspera(tid);  // fluxo antigo (sem orçamento)
  estado.tentativaAtual = t;
  const camp = estado.campanha;
  const r = t.resultado, ind = r.indicadores;
  renderIndicadores(ind.depois, ind.variacao);
  const nomeInd = Object.fromEntries(estado.cfg.indicadores.map((i) => [i.id, i.nome]));
  const status = el("div", { class: "status-sim", role: "status", "aria-live": "polite" });
  const linhaTempo = el("section", { "aria-label": "Linha do tempo" });
  const devol = el("section", { "aria-label": "Devolutiva" });
  const conversaBox = el("section", {});

  const barras = el("div", { class: "barras-resultado" }, Object.keys(ind.depois).map((k) =>
    el("div", { class: "linha-barra" }, el("span", { class: "rotulo" }, nomeInd[k]),
      el("span", { class: "barra" }, el("span", { style: `width:${ind.depois[k]}%` })),
      el("span", { class: "num" }, Number(ind.depois[k]).toFixed(0)), delta(ind.variacao[k]))));

  const demandas = el("ul", { class: "resultado-demandas", role: "list" }, (r.demandas || []).map((d) => {
    const dem = camp.cenario.demandas.find((x) => x.id === d.id) || { titulo: d.id };
    const a = ator(d.solicitante);
    return el("li", { class: "cartao-mini" }, avatarDe(a, d.expressao, 48),
      el("div", {}, el("strong", {}, dem.titulo), el("div", { class: "pequeno" },
        d.valor >= d.custo ? `Financiada (${brl(d.valor)})` : d.valor > 0 ? `Parcial: ${brl(d.valor)} de ${brl(d.custo)}` : "Adiada")));
  }));

  tela(`Resultado do ${camp.cenario.periodo}`, cabecalhoTrimestre(),
    t.modo === "contingencia" && t.aviso ? el("div", { class: "aviso" }, t.aviso) : "",
    el("details", { class: "cartao" }, el("summary", {}, "Resumo da decisão"), el("p", {}, t.decisao)),
    el("h2", {}, "Indicadores"), barras,
    el("details", { class: "cartao pequeno" }, el("summary", {}, "Como calculamos"),
      el("p", {}, "O resultado base sai da sua divisão do orçamento, por regras fixas e públicas. A simulação dos agentes só ajusta até ±10 pontos."),
      el("ul", {}, ind.auditoria.slice(0, 40).map((a) => el("li", {}, `${nomeInd[a.indicador] || a.indicador}: ${a.pontos > 0 ? "+" : ""}${a.pontos} — ${a.detalhe}`)))),
    el("h2", {}, "O que você financiou"), demandas,
    status, linhaTempo, devol, conversaBox,
    el("div", { class: "cartao" },
      el("h2", {}, "E agora?"),
      el("button", { class: "secundario", onclick: async () => {
        estado.campanha = await api(`/api/campanhas/${camp.id}`); iniciarTrimestre(t.alocacao); } }, "Refazer a decisão"),
      el("button", { class: "grande", onclick: async () => {
        try {
          estado.campanha = await api(`/api/campanhas/${camp.id}/avancar`, { method: "POST", body: { tentativa_id: t.id } });
          estado.campanha.status === "concluida" ? telaFinal() : iniciarTrimestre();
        } catch (e) { mostrarErro(main(), e); } } },
        camp.indice_atual + 1 >= camp.total ? "Concluir" : "Ir para o próximo trimestre →"),
      el("p", { class: "suave pequeno" }, `Custo desta tentativa até agora: R$ ${t.custo.total_brl.toFixed(2)}.`)));
  marcarEtapa(3);

  const atualizar = (tt) => {
    const rr = tt.resultado;
    if (rr.fase !== "completo") {
      status.replaceChildren(el("div", { class: "aviso suave-aviso" }, el("span", { class: "girando", "aria-hidden": "true" }, "⏳"),
        ` Os agentes estão reagindo à sua decisão (${tt.progresso || 0}%). ${tt.etapa || ""}`,
        tt.posicao_fila ? ` Posição na fila: ${tt.posicao_fila}.` : ""));
    } else {
      status.replaceChildren(rr.resumo ? el("details", { class: "cartao" }, el("summary", {}, "Ler o resumo do que aconteceu"), el("p", {}, rr.resumo)) : "");
      renderIndicadores(rr.indicadores.depois, rr.indicadores.variacao);
      linhaTempo.replaceChildren(rr.momentos?.length ? el("div", {}, el("h2", {}, "Momentos-chave"),
        el("ol", { class: "linha-tempo" }, rr.momentos.map((m) => {
          const a = ator(m.ator_id) || { id: m.ator_id, nome: m.nome, tipo: m.tipo };
          const reac = rr.reacoes.find((x) => x.ator_id === m.ator_id);
          return el("li", {}, avatarDe(a, AVATAR.expressaoDePostura(reac?.postura_final ?? 0), 52),
            el("div", { class: "balao" }, el("strong", {}, a.nome), el("p", {}, m.fala)));
        }))) : "");
    }
    if (tt.devolutiva && !devol.dataset.ok) { devol.dataset.ok = "1"; devol.replaceChildren(blocoDevolutiva(tt.devolutiva)); }
    if (!conversaBox.dataset.ok) { conversaBox.dataset.ok = "1"; painelConversa(tt).then((p) => conversaBox.replaceChildren(p)); }
    return rr.fase === "completo" && tt.devolutiva;
  };
  if (!atualizar(t)) {
    estado.timer = setInterval(async () => {
      try { const tt = await api(`/api/tentativas/${tid}`); if (atualizar(tt)) clearInterval(estado.timer); } catch (_) {}
    }, 3000);
  }
}

function blocoDevolutiva(dev) {
  if (dev.erro) return el("p", { class: "suave" }, dev.erro);
  return el("details", { class: "cartao devolutiva" }, el("summary", {}, el("strong", {}, "Devolutiva: pontos fortes, riscos e perguntas para refletir")),
    lista("Pontos fortes", dev.pontos_fortes), lista("Riscos que ficaram de fora", dev.riscos_ignorados),
    lista("Trade-offs", dev.trade_offs),
    el("h3", {}, "Para refletir"), el("ol", {}, dev.perguntas_reflexivas.map((p) => el("li", {}, p))),
    el("details", {}, el("summary", {}, "Competências (rubrica)"),
      el("table", {}, el("tbody", {}, dev.competencias.map((c) => el("tr", {}, el("th", { scope: "row" }, c.nome),
        el("td", {}, c.nivel ? `${c.nivel} — ${c.nivel_nome}` : c.nivel_nome), el("td", { class: "pequeno" }, c.evidencia)))))));
}

function lista(titulo, itens) {
  if (!itens || !itens.length) return "";
  return el("div", {}, el("h3", {}, titulo), el("ul", {}, itens.map((i) => el("li", {}, i))));
}

// Espera do fluxo antigo (cenários sem orçamento); mantida por compatibilidade
function telaEspera(tid) {
  const barra = el("progress", { max: 100, value: 0, "aria-labelledby": "etapa" });
  const etapa = el("p", { id: "etapa", "aria-live": "polite" }, "Enviando…");
  tela("Simulando as reações", etapa, barra);
  const tick = async () => {
    const t = await api(`/api/tentativas/${tid}`);
    barra.value = t.progresso || 0; etapa.textContent = `${t.etapa || "Aguardando"} (${t.progresso || 0}%)`;
    if (t.resultado) { clearInterval(estado.timer); telaResultado(tid); }
  };
  tick(); estado.timer = setInterval(tick, 2500);
}

async function painelConversa(t) {
  const cen = estado.campanha.cenario;
  const sel = el("select", { id: "interlocutor" },
    el("option", { value: "relatorio" }, "Analista da simulação"),
    cen.atores.map((a) => el("option", { value: a.id }, `${a.nome} — ${TIPOS[a.tipo] || a.tipo}`)));
  const log = el("div", { class: "chat", role: "log", "aria-live": "polite", "aria-label": "Conversa" });
  const campo = el("input", { type: "text", id: "msg", maxlength: 800, placeholder: "Escreva sua pergunta" });
  const enviar = el("button", { type: "submit" }, "Enviar");
  const dica = el("p", { class: "suave pequeno" });
  const carregar = async () => {
    const h = await api(`/api/tentativas/${t.id}/conversa?interlocutor=${encodeURIComponent(sel.value)}`);
    log.replaceChildren(...h.mensagens.map((m) => el("div", { class: `msg ${m.papel}` }, m.conteudo)));
    log.scrollTop = log.scrollHeight;
  };
  sel.addEventListener("change", carregar);
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
    } catch (e) { $("#digitando")?.remove(); mostrarErro(form, e); }
    enviar.disabled = false; log.scrollTop = log.scrollHeight;
  };
  const form = el("form", { onsubmit: (ev) => { ev.preventDefault(); const v = campo.value; campo.value = ""; mandar(v); } },
    el("label", { for: "msg" }, "Sua pergunta"), el("div", { class: "linha" }, campo, botaoVoz(campo), enviar));
  const sugestoes = el("div", { class: "chips", role: "group", "aria-label": "Perguntas sugeridas" });
  const rostinho = el("span", { class: "conversa-avatar" });
  const atualizarSugestoes = () => {
    const a = ator(sel.value);
    const postura = posturaAtual(t, sel.value);
    rostinho.replaceChildren(a ? avatarDe(a, AVATAR.expressaoDePostura(postura), 56) : AVATAR.criar({ id: "analista", tipo: "parceiro", expressao: "neutra", tamanho: 56 }));
    sugestoes.replaceChildren(...perguntasSugeridas(t, sel.value).map((q) => el("button", { type: "button", class: "chip", onclick: () => mandar(q) }, q)));
  };
  sel.addEventListener("change", atualizarSugestoes);
  atualizarSugestoes();
  await carregar();
  return el("div", { class: "cartao" }, el("h2", {}, "Conversar"),
    el("div", { class: "linha" }, rostinho, el("div", { class: "flex1" }, el("label", { for: "interlocutor" }, "Com quem?"), sel)),
    el("p", { class: "pequeno suave" }, "Toque numa pergunta ou escreva/fale a sua."), sugestoes, log, form, dica);
}

function posturaAtual(t, atorId) {
  const r = t.resultado || {};
  const reac = (r.reacoes || []).find((x) => x.ator_id === atorId);
  if (reac) return reac.postura_final;
  const d = (r.demandas || []).find((x) => x.solicitante === atorId);
  return d ? d.postura_prevista : (ator(atorId)?.postura_inicial ?? 0);
}

/** 3 perguntas por interlocutor, conforme o que aconteceu com o pedido dele. */
function perguntasSugeridas(t, atorId) {
  if (atorId === "relatorio") return ["Quem ficou mais insatisfeito?", "Qual é o maior risco agora?", "O que a simulação mostrou de inesperado?"];
  const d = (t.resultado?.demandas || []).find((x) => x.solicitante === atorId);
  if (d && d.valor === 0) return ["Por que você ficou insatisfeito?", "Dá para fazer parte do seu projeto com menos dinheiro?", "O que faria você apoiar a diretoria no próximo trimestre?"];
  if (d && d.valor < d.custo) return ["Com metade do valor, o que dá para entregar?", "O que você precisa para não desistir do projeto?", "Como vamos medir o resultado?"];
  if (d) return ["O que você vai entregar com esse dinheiro?", "Como vamos medir o resultado?", "O que pode dar errado?"];
  return ["O que você achou da decisão?", "Quem ficou de fora, na sua opinião?", "O que você faria diferente?"];
}

// ------------------------------------------------------------------ Sala do Conselho (experiência dos seniores)
const contrib = { nome: "", anonimo: false, entidade: "", anos: "", avatar: { genero: "f", idade: 70 }, tema: "", respostas: {}, consentimento: "" };
const AVATARES_SENIOR = [["f", 38], ["f", 56], ["f", 72], ["m", 38], ["m", 56], ["m", 72]];

async function telaConselho(n) {
  renderIndicadores(null);
  if (!estado.conselho) estado.conselho = await api("/api/conselho");
  const k = estado.conselho;
  const total = 3 + k.perguntas.length;
  const passo = el("p", { class: "pequeno suave" }, `Passo ${n} de ${total}`);
  const nav = (proximo, rotulo = "Próximo →", validar = () => true) => el("p", {},
    n > 1 ? el("button", { class: "secundario grande", onclick: () => telaConselho(n - 1) }, "← Voltar") : el("button", { class: "secundario grande", onclick: telaInicio }, "Cancelar"),
    el("button", { class: "grande", onclick: () => { if (validar()) proximo(); } }, rotulo));
  let corpo;
  if (n === 1) {
    const nome = el("input", { type: "text", id: "c-nome", maxlength: 80, value: contrib.nome, autocomplete: "name" });
    nome.addEventListener("input", () => { contrib.nome = nome.value; });
    const anon = el("input", { type: "checkbox", id: "c-anon", checked: contrib.anonimo });
    anon.addEventListener("change", () => { contrib.anonimo = anon.checked; nome.disabled = anon.checked; });
    nome.disabled = contrib.anonimo;
    const ent = el("input", { type: "text", id: "c-ent", maxlength: 120, value: contrib.entidade });
    ent.addEventListener("input", () => { contrib.entidade = ent.value; });
    const anos = el("input", { type: "number", id: "c-anos", min: 0, max: 80, inputmode: "numeric", value: contrib.anos, class: "qtd" });
    anos.addEventListener("input", () => { contrib.anos = anos.value; });
    const avatares = el("div", { class: "chips", role: "radiogroup", "aria-label": "Escolha um avatar" });
    const renderAv = () => avatares.replaceChildren(...AVATARES_SENIOR.map(([g, i]) => {
      const ativo = contrib.avatar.genero === g && contrib.avatar.idade === i;
      return el("button", { type: "button", class: `escolha-avatar ${ativo ? "ativo" : ""}`, role: "radio", "aria-checked": String(ativo),
        "aria-label": `Avatar ${g === "f" ? "feminino" : "masculino"}, cerca de ${i} anos`,
        onclick: () => { contrib.avatar = { genero: g, idade: i }; renderAv(); } },
        AVATAR.criar({ id: `senior-${g}-${i}`, tipo: "conselheiro", genero: g, idade: i, expressao: "favoravel", tamanho: 64 }));
    }));
    renderAv();
    corpo = [el("h2", {}, "Quem é você?"),
      el("label", { for: "c-nome" }, "Seu nome"), nome,
      el("label", { class: "checkbox" }, anon, " Prefiro ficar anônimo(a)"),
      el("label", { for: "c-ent" }, "Entidade onde atuou"), ent,
      el("label", { for: "c-anos" }, "Anos de associativismo"), anos,
      el("p", { class: "rotulo" }, "Escolha um avatar (não usamos foto)"), avatares,
      nav(() => telaConselho(2))];
  } else if (n === 2) {
    corpo = [el("h2", {}, "Sobre qual tema você quer falar?"),
      el("div", { class: "temas" }, k.temas.map((t) => el("button", { type: "button", class: `tema ${contrib.tema === t.id ? "ativo" : ""}`,
        "aria-pressed": String(contrib.tema === t.id), onclick: () => { contrib.tema = t.id; telaConselho(3); } },
        el("span", { class: "icone-grande", "aria-hidden": "true" }, t.icone), t.nome))),
      el("p", {}, el("button", { class: "secundario grande", onclick: () => telaConselho(1) }, "← Voltar"))];
  } else if (n <= 2 + k.perguntas.length) {
    const q = k.perguntas[n - 3];
    const area = el("textarea", { id: `c-${q.id}`, rows: 6, maxlength: 2000 });
    area.value = contrib.respostas[q.id] || "";
    area.addEventListener("input", () => { contrib.respostas[q.id] = area.value; });
    const mic = botaoVoz(area);
    if (mic.classList) mic.classList.add("grande", "voz-destaque");
    corpo = [el("h2", { class: "pergunta-grande" }, q.texto),
      el("p", { class: "suave" }, VOZ_OK ? "Toque em Falar e conte do seu jeito. Depois você pode corrigir o texto." : "Escreva do seu jeito."),
      mic, el("label", { for: `c-${q.id}` }, "Sua resposta"), area, avisoVoz(),
      nav(() => telaConselho(n + 1), "Próximo →"),
      el("p", {}, el("button", { class: "link", onclick: () => telaConselho(n + 1) }, "Pular esta pergunta"))];
  } else {
    const opc = (v, titulo, desc) => el("label", { class: "cartao-opcao" },
      el("input", { type: "radio", name: "consent", value: v, checked: contrib.consentimento === v,
        onchange: () => { contrib.consentimento = v; } }), el("strong", {}, titulo), el("span", { class: "pequeno" }, desc));
    const enviar = el("button", { class: "grande" }, "Enviar minha experiência");
    const caixa = el("div", { class: "cartao passo" });
    enviar.addEventListener("click", async () => {
      if (!contrib.consentimento) return mostrarErro(caixa, new Error("Escolha como podemos usar sua experiência."));
      enviar.disabled = true;
      try {
        await api("/api/conselho/contribuicoes", { method: "POST", body: { ...contrib, anos: contrib.anos ? Number(contrib.anos) : null } });
        localStorage.setItem("lej_conselheiro_rede", "1");
        telaObrigado();
      } catch (e) { mostrarErro(caixa, e); enviar.disabled = false; }
    });
    caixa.append(passo, el("h2", {}, "Como podemos usar sua experiência?"),
      opc("com_nome", "Pode usar com meu nome", "Aparece como: " + (contrib.anonimo || !contrib.nome ? "Dirigente da rede (anônimo)" : contrib.nome)),
      opc("anonimo", "Use como anônimo(a)", "Aparece como: Dirigente da rede (anônimo)"),
      el("p", { class: "pequeno suave" }, "Sua experiência fica em revisão até um facilitador aprovar. Ela ajuda novos dirigentes no jogo e nas simulações. Você pode pedir a remoção a qualquer momento."),
      el("p", {}, el("button", { class: "secundario grande", onclick: () => telaConselho(n - 1) }, "← Voltar"), enviar));
    tela("Sala do Conselho", caixa);
    return;
  }
  tela("Sala do Conselho", el("div", { class: "cartao passo" }, passo, corpo));
}

function telaObrigado() {
  tela("Obrigado!",
    el("div", { class: "cartao centro" },
      AVATAR.criar({ id: "obrigado", tipo: "conselheiro", genero: contrib.avatar.genero, idade: contrib.avatar.idade, expressao: "favoravel", tamanho: 96 }),
      el("p", { class: "destaque" }, "Sua experiência foi registrada e está em revisão."),
      typeof seloAnimado === "function" ? seloAnimado("conselheiro_rede") : "",
      el("button", { class: "grande", onclick: () => { location.href = "/"; } }, "Voltar ao início")));
}

function blocoExperiencias() {
  const exps = estado.campanha?.experiencias || [];
  if (!exps.length) return "";
  return el("section", { class: "cartao experiencia", "aria-label": "Experiência da rede" },
    el("h2", {}, "Experiência da rede"),
    exps.map((e) => el("div", { class: "linha exp" },
      AVATAR.criar({ id: e.id, tipo: "conselheiro", genero: e.avatar?.genero, idade: e.avatar?.idade, expressao: "favoravel", tamanho: 48 }),
      el("p", {}, e.citacao))));
}

async function abrirConselheiro() {
  if (!estado.conselho) estado.conselho = await api("/api/conselho");
  const camp = estado.campanha;
  const dlg = el("dialog", { class: "dialogo", "aria-labelledby": "titulo-conselheiro" });
  const log = el("div", { class: "chat", role: "log", "aria-live": "polite" });
  const restantes = el("p", { class: "pequeno suave" });
  const campo = el("input", { type: "text", id: "conselheiro-msg", maxlength: 600, placeholder: "Sua pergunta ao conselheiro" });
  const sugest = el("div", { class: "chips" });
  const atualizar = (h) => {
    log.replaceChildren(...h.mensagens.flatMap((m) => [el("div", { class: "msg jogador" }, m.pergunta), el("div", { class: "msg agente" }, m.resposta)]));
    restantes.textContent = h.restantes > 0 ? `Você ainda pode fazer ${h.restantes} pergunta(s) neste trimestre.` : "O conselheiro já respondeu as 3 perguntas deste trimestre.";
    sugest.replaceChildren(...(h.restantes > 0 ? estado.conselho.sugestoes.map((q) => el("button", { type: "button", class: "chip", onclick: () => perguntar(q) }, q)) : []));
    campo.disabled = h.restantes <= 0;
    log.scrollTop = log.scrollHeight;
  };
  const perguntar = async (q) => {
    if (!q.trim()) return;
    log.append(el("div", { class: "msg jogador" }, q), el("div", { class: "msg agente suave", id: "pensando" }, "…"));
    try {
      const r = await api(`/api/campanhas/${camp.id}/conselheiro`, { method: "POST", body: { pergunta: q } });
      estado.escolhas.consultou_conselheiro = 1;
      estado.escolhas.experiencias_citadas = r.citacoes;
      atualizar(await api(`/api/campanhas/${camp.id}/conselheiro`));
      if (typeof registrarSelo === "function") registrarSelo("ouviu_experiencia");
    } catch (e) { $("#pensando")?.remove(); mostrarErro(dlg, e); }
  };
  const form = el("form", { onsubmit: (ev) => { ev.preventDefault(); const v = campo.value; campo.value = ""; perguntar(v); } },
    el("label", { for: "conselheiro-msg" }, "Pergunte ao conselheiro"), el("div", { class: "linha" }, campo, botaoVoz(campo), el("button", { type: "submit" }, "Enviar")));
  dlg.append(el("div", { class: "linha" },
      AVATAR.criar({ id: "conselheiro", tipo: "conselheiro", genero: "m", idade: 70, expressao: "favoravel", tamanho: 64 }),
      el("div", {}, el("h2", { id: "titulo-conselheiro" }, "Conselheiro sênior"),
        el("p", { class: "pequeno" }, "Ele não dá a resposta pronta: ajuda a pensar com a experiência da rede."))),
    sugest, log, restantes, form,
    el("p", {}, el("button", { class: "secundario", onclick: () => { dlg.close(); dlg.remove(); } }, "Fechar")));
  document.body.append(dlg);
  dlg.showModal();
  atualizar(await api(`/api/campanhas/${camp.id}/conselheiro`));
}

// ------------------------------------------------------------------ final
async function telaFinal() {
  const camp = estado.campanha;
  renderIndicadores(camp.indicadores);
  tela("Campanha concluída",
    el("p", {}, `Você liderou a associação por ${camp.total} ${camp.total > 1 ? "trimestres" : "trimestre"}.`),
    el("table", {}, el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Trimestre"),
      estado.cfg.indicadores.map((i) => el("th", { scope: "col" }, i.nome)))),
      el("tbody", {}, camp.historico.map((h) => el("tr", {}, el("th", { scope: "row" }, `${h.indice + 1}`),
        estado.cfg.indicadores.map((i) => el("td", {}, Number(h.depois[i.id]).toFixed(0), " ", delta(h.depois[i.id] - h.antes[i.id]))))))),
    el("p", {}, el("button", { onclick: () => novaCampanha(camp.perfil) }, "Jogar de novo"),
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
      const [p, c, contribs] = await Promise.all([f("/api/facilitador/partidas"), f("/api/facilitador/cenarios"),
        f("/api/facilitador/contribuicoes")]);
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
        el("h2", {}, "Sala do Conselho: experiências para revisar"),
        contribs.contribuicoes.length ? el("ul", { class: "contribuicoes", role: "list" }, contribs.contribuicoes.map((x) => el("li", { class: "cartao" },
          el("div", { class: "linha" }, AVATAR.criar({ id: x.id, tipo: "conselheiro", genero: x.avatar?.genero, idade: x.avatar?.idade, expressao: "favoravel", tamanho: 48 }),
            el("div", {}, el("strong", {}, x.nome), ` · ${x.tema_nome} · ${x.anos ?? "?"} anos · `, el("span", { class: "etiqueta" }, x.status),
              x.ficticia ? el("span", { class: "etiqueta" }, "exemplo fictício") : "")),
          el("dl", {}, Object.entries(x.respostas).filter(([, v]) => v).map(([k2, v]) => [el("dt", {}, k2), el("dd", {}, v)])),
          x.status !== "aprovada" ? el("button", { onclick: async () => { await f(`/api/facilitador/contribuicoes/${x.id}/status`, { method: "POST", body: { status: "aprovada" } }); carregar(); } }, "Aprovar") : "",
          x.status !== "rejeitada" ? el("button", { class: "secundario", onclick: async () => { await f(`/api/facilitador/contribuicoes/${x.id}/status`, { method: "POST", body: { status: "rejeitada" } }); carregar(); } }, "Rejeitar") : "")))
          : el("p", {}, "Nenhuma contribuição ainda."),
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
  if (location.pathname.startsWith("/conselho")) return telaConselho(1);
  if (estado.token && estado.campanhaId) return abrirCampanha(estado.campanhaId);
  telaInicio();
})();
