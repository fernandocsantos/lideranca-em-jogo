/* Legado — fluxo da missão em 5 etapas: Pauta → Relatos → Mesa de decisões → Ata → Resultado.
   A prévia da Mesa é cálculo em código (sem IA); o resultado vem da simulação com agentes de IA (MiroFish),
   com contingência em cache ou por regras ("modo offline"). Texto dinâmico sempre via textContent. */
"use strict";

const ETAPAS = ["Pauta", "Relatos", "Mesa", "Ata", "Resultado"];
const CRITERIOS = ["Maior impacto nas vendas", "Mais associados beneficiados", "Urgência", "Menor risco financeiro", "Cabe nas horas da equipe"];
const CORTES = ["Menor impacto no curto prazo", "Pode esperar o próximo trimestre", "Há alternativa mais barata", "Falta de horas da equipe", "Baixa adesão no passado"];
const CANAIS = ["Assembleia", "WhatsApp", "Reunião setorial", "Jornal local"];
const PRAZOS = ["o fim do trimestre", "30 dias", "60 dias", "90 dias"];
const REVISOES = ["30 dias", "60 dias", "90 dias"];
const RESPONSAVEIS = ["Presidência", "Diretoria executiva", "Gerência", "Comissão de associados"];
const MOTIVOS_ALTERNATIVA = ["Cabe nas horas da equipe", "Atende mais associados", "Menor risco", "Melhor impacto previsto"];
const LETRAS = ["A", "B", "C"];
const AVISO_SIM = "Simulação para apoio à decisão; não é garantia de resultado";

// ------------------------------------------------------------------ roteiro da demonstração
function passoRoteiro() {
  if (localStorage.getItem("lej_roteiro") !== "1" || !estado.cfg.roteiro_demo) return null;
  return estado.cfg.roteiro_demo.trimestres[estado.campanha?.indice_atual ?? 0] || null;
}
function faixaRoteiro(texto, acao, rotulo) {
  if (!passoRoteiro()) return "";
  return el("div", { class: "info roteiro" }, icone("play", 18), el("span", {}, el("strong", {}, "Roteiro da demonstração: "), texto, " ",
    acao ? el("button", { type: "button", class: "botao secundario mini", onclick: acao }, rotulo) : ""));
}

// ------------------------------------------------------------------ estado da missão
function iniciarTrimestre(alocInicial, escolhasIniciais) {
  const c = estado.campanha.cenario;
  estado.base = Object.fromEntries(c.demandas.map((d) => [d.id, d.ano_anterior ?? 0]));
  estado.aloc = { ...estado.base, ...(alocInicial || {}) };
  estado.escolhas = escolhasIniciais ? JSON.parse(JSON.stringify(escolhasIniciais)) : {};
  estado.escolhas.cortes_linhas ||= {};
  estado.escolhas.alternativas ||= [];
  estado.previa = null;
  estado.reuniaoFim = null;
  telaPauta();
}
function barraEtapas(i) {
  return el("ol", { class: "etapas", "aria-label": `Etapa ${i + 1} de ${ETAPAS.length}: ${ETAPAS[i]}` },
    ETAPAS.map((n, k) => el("li", { class: k < i ? "feito" : k === i ? "atual" : "", "aria-current": k === i ? "step" : null },
      el("span", { class: "n" }, k < i ? icone("circle-check", 14) : String(k + 1)), el("span", { class: "rot" }, n))));
}
function visiveis(c) { return c.demandas.filter((d) => !d.requer_consulta || estado.escolhas.consultou_associados); }
function somaAloc() { return Object.values(estado.aloc).reduce((a, b) => a + Number(b || 0), 0); }
function horasLinha(d, v) { return d.custo && d.horas ? Math.round((d.horas * v) / d.custo) : 0; }
function horasUsadas(c) {
  return c.demandas.reduce((a, d) => a + horasLinha(d, estado.aloc[d.id] || 0), 0)
    + (estado.escolhas.consultou_associados && c.relato ? c.relato.consulta_horas : 0);
}
function cortadas(c) { return c.demandas.filter((d) => (estado.aloc[d.id] || 0) < (estado.base[d.id] || 0)); }
function corteJustificado(id) { const j = estado.escolhas.cortes_linhas[id]; return !!(j && (j.motivos?.length || (j.texto || "").trim())); }

// ------------------------------------------------------------------ 1. Pauta
function telaPauta() {
  const camp = estado.campanha, c = camp.cenario;
  topo(c.titulo, `Missão ${camp.indice_atual + 1} de ${camp.total}`, telaPainel); abas(null);
  const anterior = camp.historico.at(-1);
  const rot = passoRoteiro();
  const fala = c.fala_abertura && ator(c.fala_abertura.ator_id);
  tela(
    barraEtapas(0),
    rot ? faixaRoteiro(rot.continuidade ? `escolha "${rot.continuidade[0].toUpperCase() + rot.continuidade.slice(1)}" abaixo.` : "leia a pauta e siga para os relatos.") : "",
    el("div", { class: "cartao cartao-principal" },
      el("div", { class: "cabecalho-doc" }, el("span", {}, "Pauta"), el("span", {}, c.associacao.nome.match(/\(([^)]+)\)/)?.[1] || ""), el("span", {}, `Missão ${camp.indice_atual + 1}`)),
      fala ? el("div", { class: "fala-abertura" }, Ator(fala, { tamanho: 56, expressao: "neutra" }), el("p", { class: "balao" }, `“${c.fala_abertura.texto}”`)) : "",
      el("div", { class: "orcamento-destaque", role: "group", "aria-label": `Orçamento: de ${brl(c.orcamento)} para ${brl(c.disponivel)}` },
        el("span", { class: "rotulo" }, "Orçamento do trimestre"),
        c.evento && c.orcamento !== c.disponivel ? [el("span", { class: "antes" }, brl(c.orcamento)), icone("move-right", 22)] : "",
        el("span", { class: "depois" }, brl(c.disponivel)),
        c.horas_equipe ? el("span", { class: "horas" }, icone("clock", 16), `${c.horas_equipe} h da equipe`) : ""),
      c.frase_abertura ? el("p", { class: "frase-abertura" }, c.frase_abertura) : "",
      el("p", { class: "narrativa" }, c.narrativa || c.texto.split(/\n\n/)[0]),
      el("button", { class: "botao fantasma", style: "padding-left:0", onclick: () => abrirPainel("Contexto completo",
        ...c.texto.split(/\n\n+/).map((p) => el("p", {}, p)), el("p", {}, el("strong", {}, "O que está em jogo: "), c.em_jogo),
        el("p", { class: "pequeno suave" }, `${c.associacao.nome} · ${c.associacao.cidade} · ${c.associacao.associados} associados. ${c.associacao.situacao_financeira}`)) },
        icone("book-open", 18), "Ler contexto completo")),
    c.continua_de && anterior ? blocoTrimestreAnterior(c, anterior) : "",
    el("p", { class: "rotulo-secao" }, "Demandas"),
    el("div", { class: "cartoes-demanda" }, c.demandas.filter((d) => !d.requer_consulta).map((d) => el("div", { class: "cartao demanda" },
      el("strong", {}, d.titulo), el("p", { class: "pequeno" }, d.beneficio),
      el("div", { class: "numeros-demanda" }, el("span", {}, el("span", { class: "rotulo-mono" }, "Ano anterior"), brl(estado.base[d.id] || d.custo)),
        d.horas ? el("span", {}, el("span", { class: "rotulo-mono" }, "Horas"), `${d.horas} h`) : ""),
      Ator(ator(d.solicitante), { tamanho: 32 })))),
    el("p", { class: "rotulo-secao" }, "Restrições"),
    el("ul", { class: "regras cartao" }, c.regras.map((r) => el("li", {}, icone(ICONE_REGRA[r.icone] || "info", 18), el("span", {}, r.texto)))),
    el("div", { class: "acoes" }, el("button", { class: "botao bloco principal", onclick: () => { SOM.tocar("transicao"); telaRelatos(); } }, "Ver os relatos", icone("chevron-right", 18))));
}

function blocoTrimestreAnterior(c, anterior) {
  const ir = (escolha, aloc) => { estado.escolhas.continuidade = escolha; estado.aloc = { ...estado.base, ...aloc }; SOM.tocar("confirmar"); telaRelatos(); };
  const meta = anterior.meta;
  return el("div", { class: "cartao cartao-destaque" },
    el("h3", {}, "Resultado da missão anterior"),
    meta ? el("div", {}, el("p", { class: "pequeno" }, el("strong", {}, "Meta: "), meta.texto),
      el("div", { class: "barra", role: "meter", "aria-valuemin": 0, "aria-valuemax": meta.alvo, "aria-valuenow": meta.previsto, "aria-label": `Previsto ${meta.previsto} de ${meta.alvo}` },
        el("span", { style: `width:${Math.min(100, meta.pct)}%` })),
      el("p", { class: "pequeno" }, `Previsto: ${meta.previsto} de ${meta.alvo} (${meta.pct}%) · ${meta.situacao}`)) : el("p", { class: "pequeno suave" }, "Sem meta mensurável na missão anterior."),
    el("p", { class: "pequeno" }, "Manter, ajustar ou rever a decisão? A Mesa parte do que foi executado."),
    el("div", { class: "acoes" },
      el("button", { class: "botao", onclick: () => ir("manter", {}) }, "Manter"),
      el("button", { class: "botao secundario", onclick: () => ir("ajustar", {}) }, "Ajustar"),
      el("button", { class: "botao secundario", onclick: () => ir("rever", Object.fromEntries(c.demandas.map((d) => [d.id, 0]))) }, "Rever")));
}

// ------------------------------------------------------------------ 2. Relatos (o relato vira exercício)
function telaRelatos() {
  const c = estado.campanha.cenario, e = estado.escolhas;
  topo("Relatos", c.titulo, telaPauta); abas(null);
  const rot = passoRoteiro();
  const corpo = el("div", {});
  const helena = c.relato ? { id: "relato_" + c.relato.autor, nome: c.relato.autor, funcao: c.relato.funcao, tipo: "diretoria", genero: "f", idade: 64, postura_inicial: 1 } : null;
  const render = () => {
    const liberada = c.relato?.consulta_libera && c.demandas.find((d) => d.id === c.relato.consulta_libera);
    const podeSeguir = !c.relato || !!e.interpretacao;
    corpo.replaceChildren(
      c.relato ? el("div", { class: "cartao cartao-principal" },
        el("div", { class: "cabecalho-doc" }, el("span", {}, "Relato da rede"), el("span", {}, "anonimizado"), el("span", {}, "fictício")),
        Ator(helena, { tamanho: 56 }),
        el("blockquote", { class: "relato-grande" }, c.relato.texto),
        el("h3", {}, c.relato.pergunta),
        el("div", { class: "chips grandes", role: "radiogroup", "aria-label": c.relato.pergunta }, c.relato.opcoes.map((o) =>
          el("button", { type: "button", class: "chip", role: "radio", "aria-checked": String(e.interpretacao === o.id),
            onclick: () => { e.interpretacao = o.id; e.interpretou_relato = 1; SOM.tocar("confirmar"); render(); } },
          e.interpretacao === o.id ? icone("circle-check", 16) : "", o.texto)))) : "",
      c.relato ? el("div", { class: "cartao" },
        el("h3", { style: "margin-top:0" }, "Consultar os associados"),
        e.consultou_associados
          ? [el("div", { class: "info" }, icone("message-square", 18), el("span", {}, c.relato.consulta_achado)),
            liberada ? el("p", { class: "pequeno" }, icone("circle-check", 14), ` Liberada na Mesa: ${liberada.titulo} (${brl(liberada.custo)} · ${liberada.horas} h).`) : ""]
          : [el("p", { class: "pequeno suave" }, `Uma consulta rápida por WhatsApp custa ${c.relato.consulta_horas} h da equipe. Pular é permitido, mas aparece no feedback.`),
            el("div", { class: "acoes" }, el("button", { class: "botao principal", onclick: () => { e.consultou_associados = true; SOM.tocar("confirmar"); render(); } },
              icone("users", 18), `Consultar os associados (${c.relato.consulta_horas} h)`),
              e.pulou_consulta ? el("span", { class: "etiqueta neutra" }, "Consulta pulada") : el("button", { class: "botao secundario", onclick: () => { e.pulou_consulta = true; render(); } }, "Seguir sem consultar"))]) : "",
      blocoRelatosBanco(c),
      el("div", { class: "acoes" }, el("button", { class: "botao bloco principal", disabled: !podeSeguir, onclick: () => { SOM.tocar("transicao"); telaMesa(); } },
        podeSeguir ? "Abrir a Mesa de decisões" : "Escolha uma interpretação para seguir", icone("chevron-right", 18))));
  };
  tela(barraEtapas(1),
    rot?.relato ? faixaRoteiro("interprete o relato e consulte os associados.", () => {
      e.interpretacao = rot.relato.interpretacao; e.interpretou_relato = 1; if (rot.relato.consultar) e.consultou_associados = true; render(); }, "Aplicar") : "",
    corpo);
  render();
}

function blocoRelatosBanco(c) {
  const rel = c.relatos_rede || [];
  if (!rel.length) return "";
  estado.escolhas.considerou_vivencias = 1;
  return el("div", {},
    el("p", { class: "rotulo-secao" }, "O que a rede relata"),
    c.vivencias_base ? el("p", { class: "pequeno suave" }, `Construído a partir de ${c.vivencias_base} vivências da rede.`) : "",
    rel.map((r) => el("div", { class: "relato" }, el("div", {}, r.trecho), el("div", { class: "quem" }, `${r.perfil}${r.ficticia ? " · exemplo fictício" : ""}`))),
    el("p", { class: "pequeno suave" }, "Vivências anonimizadas e aprovadas por curadoria."));
}

// ------------------------------------------------------------------ 3. Mesa de decisões
let previaPendente = null;
function pedirPrevia(alocacao, aplicar) {
  clearTimeout(previaPendente);
  previaPendente = setTimeout(async () => {
    try { const p = await api(`/api/campanhas/${estado.campanhaId}/previa`, { method: "POST", body: { alocacao, escolhas: estado.escolhas } }); aplicar(p); }
    catch (_) { /* a tela mostra os totais; o servidor valida no envio */ }
  }, 70);
}

async function previaDe(aloc) {
  try { return await api(`/api/campanhas/${estado.campanhaId}/previa`, { method: "POST", body: { alocacao: aloc, escolhas: estado.escolhas } }); }
  catch (_) { return null; }
}
function resumoAlternativa(c, aloc, previa) {
  const nomesInd = Object.fromEntries(estado.cfg.indicadores.map((i) => [i.id, i.nome]));
  const tend = previa?.tendencia || {};
  const atendidos = c.demandas.filter((d) => aloc[d.id] > 0).map((d) => d.titulo + (aloc[d.id] < d.custo ? " (parcial)" : ""));
  const horas = c.demandas.reduce((a, d) => a + horasLinha(d, aloc[d.id] || 0), 0) + (estado.escolhas.consultou_associados && c.relato ? c.relato.consulta_horas : 0);
  return { aloc: { ...aloc }, total: Object.values(aloc).reduce((a, b) => a + b, 0), horas, atendidos,
    sobe: Object.keys(tend).filter((k) => tend[k] === "sobe").map((k) => nomesInd[k]), desce: Object.keys(tend).filter((k) => tend[k] === "desce").map((k) => nomesInd[k]) };
}

function telaMesa() {
  const camp = estado.campanha, c = camp.cenario, e = estado.escolhas;
  topo("Mesa de decisões", c.titulo, telaRelatos); abas(null);
  const teto = c.disponivel, horasEq = c.horas_equipe;
  const totais = el("div", { class: "totais-mesa", "aria-live": "polite" });
  const inds = el("div", {});
  const altBox = el("div", {});
  const linhas = {};
  let alerta = null;
  const seguir = el("button", { class: "botao bloco principal", onclick: () => { SOM.tocar("transicao"); telaAta(); } });

  const atualizarTotais = () => {
    const t = somaAloc(), h = horasUsadas(c), dif = t - teto, difh = horasEq ? h - horasEq : 0;
    const medidor = (rot, valor, limite, fmt, excede) => el("div", { class: `medidor ${excede > 0 ? "estouro" : ""}` },
      el("div", { class: "linha entre" }, el("span", { class: "rotulo-mono" }, rot), el("span", {}, el("strong", {}, fmt(valor)), ` de ${fmt(limite)}`)),
      el("div", { class: "barra-teto", role: "img", "aria-label": `${rot}: ${fmt(valor)} de ${fmt(limite)}` }, el("span", { style: `width:${Math.min(100, (valor / (limite || 1)) * 100)}%` })),
      el("div", { class: `status-mesa ${excede > 0 ? "estouro" : "ok"}` }, icone(excede > 0 ? "triangle-alert" : "circle-check", 16),
        excede > 0 ? `Passou ${fmt(excede)}` : rot === "Saldo" ? (valor === limite ? "Orçamento fechado" : `Sobram ${fmt(limite - valor)}`) : `Sobram ${fmt(limite - valor)}`));
    totais.replaceChildren(
      medidor("Saldo", t, teto, brl, dif),
      horasEq ? medidor("Horas da equipe", h, horasEq, (x) => `${x} h`, difh) : "");
    const estourou = dif > 0 || difh > 0;
    if (alerta === false && estourou) SOM.tocar("alerta");
    if (alerta === true && !estourou) SOM.tocar("fechado");
    alerta = estourou;
    const faltam = cortadas(c).filter((d) => !corteJustificado(d.id));
    seguir.disabled = estourou || faltam.length > 0;
    seguir.replaceChildren(dif > 0 ? `Corte ${brl(dif)} para continuar` : difh > 0 ? `Libere ${difh} h da equipe para continuar`
      : faltam.length ? `Justifique o corte em ${faltam[0].titulo}` : "Seguir para a Ata", icone("chevron-right", 18));
  };
  const aplicarPrevia = (p) => {
    estado.previa = p;
    inds.replaceChildren(blocosIndicadores(camp.indicadores, null, p.tendencia));
    for (const d of p.demandas) { const l = linhas[d.id]; if (l) l.avatar.replaceChildren(avatarDe(ator(d.solicitante), d.expressao, 40)); }
  };
  const blocoCorte = (d) => {
    const j = (e.cortes_linhas[d.id] ||= { motivos: [], texto: "" });
    const txt = el("input", { type: "text", maxlength: 200, placeholder: "Comentário (opcional)", "aria-label": `Comentário sobre o corte em ${d.titulo}`, value: j.texto || "" });
    txt.addEventListener("input", () => { j.texto = txt.value; atualizarTotais(); });
    return el("div", { class: "justifica-corte" }, el("span", { class: "rotulo-mono" }, "Por que cortar?"),
      chips(CORTES, j.motivos, { aoMudar: atualizarTotais }), txt);
  };
  const definir = (d, valor, comSom = true) => {
    let v = Math.max(0, Math.min(d.custo, Math.round(valor / 500) * 500));
    if (v > 0 && d.grupo) for (const o of c.demandas) if (o.id !== d.id && o.grupo === d.grupo && estado.aloc[o.id] > 0) {
      estado.aloc[o.id] = 0; if (linhas[o.id]) atualizarLinha(o); avisoCurto(`${o.titulo} zerada: escolha uma só alternativa.`);
    }
    const mudou = v !== estado.aloc[d.id];
    estado.aloc[d.id] = v;
    atualizarLinha(d);
    if (comSom && mudou) SOM.tocar("passo");
    atualizarTotais();
    pedirPrevia(estado.aloc, aplicarPrevia);
  };
  const atualizarLinha = (d) => {
    const l = linhas[d.id]; if (!l) return;
    const v = estado.aloc[d.id] || 0, df = v - (estado.base[d.id] || 0);
    l.valor.textContent = brl(v);
    l.horas.textContent = d.horas ? `${horasLinha(d, v)} de ${d.horas} h` : "";
    l.menos.disabled = v <= 0; l.mais.disabled = v >= d.custo;
    l.status.className = `status-linha ${df < 0 ? "corte" : df > 0 ? "aumento" : "igual"}`;
    l.status.textContent = df === 0 ? "sem mudança" : df < 0 ? `corte de ${brl(-df)}` : `aumento de ${brl(df)}`;
    l.barra.style.width = `${(v / d.custo) * 100}%`;
    const precisa = df < 0;
    if (precisa && !l.corte.firstChild) l.corte.append(blocoCorte(d));
    if (!precisa) { l.corte.replaceChildren(); delete e.cortes_linhas[d.id]; }
  };
  const cartaoLinhas = el("div", { class: "cartao cartao-principal", style: "padding:.2rem 1rem" }, visiveis(c).map((d) => {
    const a = ator(d.solicitante);
    const l = { valor: el("output", { "aria-live": "polite" }), horas: el("span", { class: "horas-linha" }), status: el("span", {}), barra: el("span", {}), avatar: el("span", {}), corte: el("div", {}) };
    l.menos = el("button", { type: "button", "aria-label": `Diminuir ${d.titulo} em R$ 500`, onclick: () => definir(d, (estado.aloc[d.id] || 0) - 500) }, icone("minus", 20));
    l.mais = el("button", { type: "button", "aria-label": `Aumentar ${d.titulo} em R$ 500`, onclick: () => definir(d, (estado.aloc[d.id] || 0) + 500) }, icone("plus", 20));
    l.avatar.append(avatarDe(a, AVATAR.expressaoDePostura(a?.postura_inicial ?? 0), 40));
    linhas[d.id] = l;
    return el("div", { class: "linha-mesa" },
      l.avatar,
      el("div", {}, el("div", { class: "nome" }, d.titulo, d.grupo ? el("span", { class: "etiqueta neutra", style: "margin-left:.4rem" }, d.requer_consulta ? "nova alternativa" : "alternativa") : ""),
        el("div", { class: "meta-linha" }, `Pedido: ${brl(d.custo)} · ano anterior: ${brl(estado.base[d.id] || 0)} · ${d.horas ? d.horas + " h" : ""}`),
        el("div", { class: "meta-linha" }, nomeFuncao(a)),
        el("button", { class: "botao fantasma mini-link", onclick: () => abrirPainel(d.titulo, el("p", {}, d.beneficio),
          el("p", { class: "pequeno suave" }, `Quem pede: ${nomeFuncao(a)}.`), el("p", { class: "pequeno suave" }, `Afeta: ${(d.afeta || []).join(", ") || "—"}.`)) }, "Detalhes")),
      el("div", { class: "mini-barra", "aria-hidden": "true" }, l.barra, el("i", { style: `left:${((estado.base[d.id] || 0) / d.custo) * 100}%` })),
      el("div", { class: "controle" }, el("div", { class: "passo" }, l.menos, l.valor, l.mais), l.status, l.horas),
      l.corte);
  }));

  const renderAlternativas = () => {
    const alts = e.alternativas;
    const livre = LETRAS.find((x) => !alts.some((a) => a.rotulo === x));
    altBox.replaceChildren(el("div", { class: "cartao" },
      el("h3", { style: "margin-top:0" }, "Alternativas"),
      el("p", { class: "pequeno suave" }, "Salve até 3 versões da divisão e compare lado a lado antes de escolher."),
      alts.length ? el("div", { class: "chips" }, alts.map((a) => el("span", { class: `chip ${e.alternativa_escolhida === a.rotulo ? "ativo" : ""}` },
        `${a.rotulo}: ${brl(a.total)} · ${a.horas} h`, el("button", { type: "button", class: "x", "aria-label": `Apagar alternativa ${a.rotulo}`,
          onclick: () => { e.alternativas = alts.filter((x) => x !== a); if (e.alternativa_escolhida === a.rotulo) delete e.alternativa_escolhida; renderAlternativas(); } }, icone("x", 14))))) : "",
      el("div", { class: "acoes" },
        livre ? el("button", { class: "botao secundario", onclick: async () => {
          alts.push({ rotulo: livre, ...resumoAlternativa(c, estado.aloc, await previaDe(estado.aloc)) }); SOM.tocar("confirmar"); avisoCurto(`Alternativa ${livre} salva.`); renderAlternativas(); } },
          icone("plus", 16), `Salvar como alternativa ${livre}`) : "",
        alts.length >= 2 ? el("button", { class: "botao principal", onclick: () => compararAlternativas(c, () => { for (const d of visiveis(c)) atualizarLinha(d); atualizarTotais(); pedirPrevia(estado.aloc, aplicarPrevia); renderAlternativas(); }) },
          icone("scale", 16), "Comparar alternativas") : "")));
  };

  const rot = passoRoteiro();
  tela(barraEtapas(2),
    rot ? faixaRoteiro("aplique a divisão do roteiro (salva as alternativas A e B).", async () => {
      for (const [k, alt] of (rot.alternativas || []).entries()) {
        const a = Object.fromEntries(c.demandas.map((d) => [d.id, visiveis(c).includes(d) ? alt[d.id] || 0 : 0]));
        e.alternativas = e.alternativas.filter((x) => x.rotulo !== LETRAS[k]);
        e.alternativas.push({ rotulo: LETRAS[k], ...resumoAlternativa(c, a, await previaDe(a)) });
      }
      e.alternativas.sort((x, y) => x.rotulo.localeCompare(y.rotulo));
      for (const d of visiveis(c)) { estado.aloc[d.id] = rot.alocacao[d.id] || 0; atualizarLinha(d); }
      for (const [id, j] of Object.entries(rot.cortes_linhas || {})) if (linhas[id]) { e.cortes_linhas[id] = { motivos: [...j], texto: "" }; linhas[id].corte.replaceChildren(blocoCorte(c.demandas.find((d) => d.id === id))); }
      if (rot.alternativas?.length) { e.alternativa_escolhida = LETRAS[rot.escolher ?? 0]; e.motivo_alternativa = rot.motivo_alternativa || []; }
      SOM.tocar("passo"); atualizarTotais(); pedirPrevia(estado.aloc, aplicarPrevia); renderAlternativas();
    }, "Aplicar") : "",
    el("p", { class: "pequeno suave", style: "margin:0 0 .4rem" }, "Distribua os investimentos de R$ 500 em R$ 500. Os indicadores mostram uma prévia de impacto."),
    totais, inds, cartaoLinhas, altBox,
    el("div", { class: "acoes" }, el("button", { class: "botao secundario", onclick: () => { for (const d of visiveis(c)) definir(d, estado.base[d.id] || 0, false); } },
      icone("refresh-ccw", 18), "Voltar ao ano anterior"), seguir));
  for (const d of visiveis(c)) atualizarLinha(d);
  alerta = somaAloc() > teto || (horasEq && horasUsadas(c) > horasEq);
  atualizarTotais();
  renderAlternativas();
  pedirPrevia(estado.aloc, aplicarPrevia);
}

function compararAlternativas(c, aoEscolher) {
  const e = estado.escolhas, alts = e.alternativas;
  e.motivo_alternativa ||= [];
  const linha = (rot, f) => el("tr", {}, el("th", { scope: "row" }, rot), alts.map((a) => el("td", {}, f(a))));
  abrirPainel("Comparar alternativas",
    el("div", { class: "tabela-rolagem" }, el("table", { class: "comparacao" },
      el("thead", {}, el("tr", {}, el("th", {}, ""), alts.map((a) => el("th", { scope: "col" }, `Alternativa ${a.rotulo}`)))),
      el("tbody", {},
        linha("Custo", (a) => `${brl(a.total)} de ${brl(c.disponivel)}`),
        linha("Horas da equipe", (a) => `${a.horas} de ${c.horas_equipe} h`),
        linha("Quem é atendido", (a) => el("ul", { class: "pequeno" }, a.atendidos.map((x) => el("li", {}, x)))),
        linha("Prévia de impacto", (a) => el("div", { class: "pequeno" }, a.sobe.length ? el("div", { class: "sobe" }, "Sobe: ", a.sobe.join(", ")) : "",
          a.desce.length ? el("div", { class: "desce" }, "Cai: ", a.desce.join(", ")) : "", !a.sobe.length && !a.desce.length ? "Estável" : "")),
        linha("", (a) => el("button", { class: "botao mini", onclick: () => {
          for (const d of c.demandas) estado.aloc[d.id] = a.aloc[d.id] || 0;
          e.alternativa_escolhida = a.rotulo; SOM.tocar("confirmar"); fecharPainel(); avisoCurto(`Seguindo com a alternativa ${a.rotulo}.`); aoEscolher();
        } }, `Seguir com ${a.rotulo}`))))),
    el("p", { class: "rotulo-secao" }, "Por que escolher uma delas?"), chips(MOTIVOS_ALTERNATIVA, e.motivo_alternativa));
}

// ------------------------------------------------------------------ 4. Ata
function construtor() {
  if (!estado.escolhas.construtor) {
    const k = estado.escolhas.construtor = { motivos: [], motivoLivre: "", canais: [], qtd: "", oque: [], oqueLivre: "", prazo: [], revisao: [], responsavel: [],
      expectativa: [], indicadores: {} };
    const rot = passoRoteiro();
    if (rot?.construtor) for (const [ch, v] of Object.entries(rot.construtor)) k[ch] = Array.isArray(v) ? [...v] : (typeof v === "object" ? { ...v } : v);
  }
  return estado.escolhas.construtor;
}
function textoMeta(k) {
  const oque = (k.oqueLivre || "").trim() || k.oque[0] || "";
  if (!k.qtd || !oque || !k.prazo[0]) return "";
  return `${k.qtd} ${oque} até ${k.prazo[0]}`;
}
function financiadas(c) { return c.demandas.filter((d) => estado.aloc[d.id] > 0).sort((a, b) => estado.aloc[b.id] - estado.aloc[a.id]); }

function telaAta() {
  const c = estado.campanha.cenario, k = construtor();
  topo("Ata", c.titulo, telaMesa); abas(null);
  for (const d of financiadas(c)) if (!(d.id in k.indicadores)) k.indicadores[d.id] = d.indicador_sugerido || "";
  const corpo = el("div", {});
  const render = () => {
    const ok1 = k.motivos.length || k.motivoLivre.trim();
    const ok2 = !!textoMeta(k) && k.revisao.length && k.responsavel.length;
    const ok3 = k.expectativa.length > 0;
    const ok4 = financiadas(c).every((d) => (k.indicadores[d.id] || "").trim());
    const passo = (n, ok, titulo, ...conteudo) => el("div", { class: "cartao" }, el("div", { class: "passo-num" },
      el("span", { class: `n ${ok ? "ok" : ""}`, "aria-label": ok ? `Passo ${n} concluído` : `Passo ${n}` }, ok ? icone("circle-check", 16) : String(n)),
      el("div", { class: "corpo" }, el("h3", { style: "margin-top:.15rem" }, titulo), ...conteudo)));
    const area = el("textarea", { id: "j-livre", rows: 2, maxlength: 400, placeholder: "Fale ou escreva (opcional)" });
    area.value = k.motivoLivre; area.addEventListener("input", () => { k.motivoLivre = area.value; }); area.addEventListener("change", render);
    const qtd = el("input", { type: "number", id: "meta-qtd", min: 1, max: 100000, inputmode: "numeric", value: k.qtd, style: "max-width:140px" });
    qtd.addEventListener("input", () => { k.qtd = qtd.value; }); qtd.addEventListener("change", render);
    const sugestoes = [...new Set(financiadas(c).map((d) => d.meta_sugerida).filter(Boolean))];
    const expIds = estado.cfg.expectativas.map((x) => x.texto);
    corpo.replaceChildren(
      passo(1, ok1, "Justificativa geral", el("p", { class: "pequeno suave" }, "Até 2 critérios."), chips(CRITERIOS, k.motivos, { aoMudar: render }),
        el("label", { for: "j-livre" }, "Em suas palavras"), area, botaoVoz(area)),
      passo(2, ok2, "Meta e revisão", el("p", { class: "pequeno suave" }, "[quantidade] [o quê] até [quando]"),
        el("label", { for: "meta-qtd" }, "Quantidade"), qtd,
        el("p", { class: "rotulo-secao" }, "O quê"), sugestoes.length ? chips(sugestoes, k.oque, { multiplo: false, aoMudar: render }) : "",
        el("p", { class: "rotulo-secao" }, "Até quando"), chips(PRAZOS, k.prazo, { multiplo: false, aoMudar: render }),
        el("p", { class: "rotulo-secao" }, "Data de revisão: reavaliar em"), chips(REVISOES, k.revisao, { multiplo: false, aoMudar: render }),
        el("p", { class: "rotulo-secao" }, "Responsável"), chips(RESPONSAVEIS, k.responsavel, { multiplo: false, aoMudar: render })),
      passo(3, ok3, "O que você espera que aconteça?", el("p", { class: "pequeno suave" }, "Até 2. A simulação vai confirmar ou não."), chips(expIds, k.expectativa, { aoMudar: render })),
      passo(4, ok4, "Indicadores sugeridos", el("p", { class: "pequeno suave" }, "Um por prioridade financiada. Confirme ou edite."),
        financiadas(c).map((d) => { const inp = el("input", { type: "text", maxlength: 120, "aria-label": `Indicador de ${d.titulo}`, value: k.indicadores[d.id] || "" });
          inp.addEventListener("input", () => { k.indicadores[d.id] = inp.value; }); inp.addEventListener("change", render);
          return el("div", { class: "indicador-sugerido" }, el("span", { class: "rotulo-mono" }, d.titulo), inp); })),
      avisoVoz(),
      el("div", { class: "acoes" }, el("button", { class: "botao bloco principal", disabled: !(ok1 && ok2 && ok3 && ok4), onclick: () => { SOM.tocar("confirmar"); telaAtaGerada(); } },
        ok1 && ok2 && ok3 && ok4 ? "Gerar a ata" : "Preencha os 4 passos para gerar a ata", icone("file-check", 18))));
  };
  tela(barraEtapas(3), passoRoteiro() ? faixaRoteiro("os passos já vêm preenchidos; confira e gere a ata.") : "", corpo);
  render();
}

function gerarAta() {
  const c = estado.campanha.cenario, k = construtor(), e = estado.escolhas;
  const fin = financiadas(c).map((d) => `${d.titulo} (${brl(estado.aloc[d.id])}${estado.aloc[d.id] < d.custo ? ` de ${brl(d.custo)}` : ""})`);
  const adi = visiveis(c).filter((d) => !estado.aloc[d.id] && (estado.base[d.id] || !d.grupo)).map((d) => d.titulo);
  const cortes = cortadas(c).map((d) => { const j = e.cortes_linhas[d.id] || {}; return `${d.titulo} −${brl((estado.base[d.id] || 0) - estado.aloc[d.id])} (${[...(j.motivos || []).map(min1), (j.texto || "").trim()].filter(Boolean).join("; ")})`; });
  const saldo = c.disponivel - somaAloc();
  const crit = [...k.motivos.map(min1), k.motivoLivre.trim().replace(/[.!]+$/, "")].filter(Boolean);
  const op = c.relato ? Object.fromEntries(c.relato.opcoes.map((o) => [o.id, o.texto])) : {};
  return [
    `Prioridades: ${fin.join("; ") || "nenhuma demanda financiada"}` + (adi.length ? `. Adiadas: ${adi.join(", ")}` : "") + (saldo > 0 ? `. Saldo guardado: ${brl(saldo)}` : "") + ".",
    c.horas_equipe ? `Horas da equipe: ${horasUsadas(c)} de ${c.horas_equipe} h.` : "",
    e.alternativa_escolhida ? `Alternativa escolhida: ${e.alternativa_escolhida} (entre ${e.alternativas.map((a) => a.rotulo).join(", ")})` + (e.motivo_alternativa?.length ? `, porque ${e.motivo_alternativa.map(min1).join("; ")}.` : ".") : "",
    cortes.length ? `Cortes: ${cortes.join("; ")}.` : "Cortes: nenhum em relação ao ano anterior.",
    c.relato ? `Relato considerado: ${c.relato.autor} (${c.relato.funcao}); interpretação: ${min1(op[e.interpretacao] || "não registrada")}; consulta aos associados: ${e.consultou_associados ? c.relato.consulta_achado : "não feita"}` : "",
    `Justificativa: ${crit.join("; ") || "(não informada)"}.`,
    `Meta: ${textoMeta(k) || "(não definida)"}` + (k.revisao[0] ? `; revisão em ${k.revisao[0]}` : "") + (k.responsavel[0] ? `; responsável: ${min1(k.responsavel[0])}` : "") + ".",
    `Indicadores: ${financiadas(c).map((d) => `${d.titulo}: ${k.indicadores[d.id]}`).join("; ")}.`,
    `Expectativa: ${k.expectativa.map(min1).join("; ") || "(não registrada)"}.`,
  ].filter(Boolean).join("\n");
}

function telaAtaGerada() {
  const k = construtor();
  topo("Ata", "Conferir e confirmar", telaAta); abas(null);
  const area = el("textarea", { id: "ata", maxlength: estado.cfg.decisao.max_caracteres, rows: 11, class: "ata" });
  area.value = k.ataEditada || gerarAta();
  area.addEventListener("input", () => { k.ataEditada = area.value; });
  tela(barraEtapas(3), el("div", { class: "cartao cartao-principal" },
    el("div", { class: "cabecalho-doc" }, el("span", {}, "Ata da decisão"), el("span", {}, estado.campanha.cenario.titulo), el("span", {}, new Date().toLocaleDateString("pt-BR"))),
    el("label", { for: "ata", class: "sr" }, "Ata da decisão"), area,
    el("div", { class: "linha" }, botaoVoz(area), el("button", { type: "button", class: "botao fantasma", onclick: () => { k.ataEditada = ""; area.value = gerarAta(); } }, icone("refresh-ccw", 16), "Refazer")),
    el("div", { class: "acoes" }, el("button", { class: "botao bloco principal", onclick: () => { SOM.tocar("confirmar"); telaHipoteses(area.value); } }, icone("file-check", 18), "Confirmar a ata"))));
}

// ------------------------------------------------------------------ hipóteses da simulação
function telaHipoteses(textoAta) {
  const c = estado.campanha.cenario, e = estado.escolhas;
  e.hipoteses_trocadas ||= [];
  topo("Hipóteses da simulação", c.titulo, telaAtaGerada); abas(null);
  const corpo = el("div", {});
  const botao = el("button", { class: "botao bloco principal" }, icone("play", 18), "Rodar a simulação com agentes de IA");
  const render = () => corpo.replaceChildren(
    el("div", { class: "cartao cartao-principal" },
      el("h2", { style: "margin-top:0" }, "Hipóteses da simulação"),
      el("p", { class: "suave" }, "São as premissas que os agentes de IA vão usar. Você pode ajustar até 2. Elas aparecem também no resultado e no Plano."),
      el("ul", { class: "hipoteses" }, c.hipoteses.map((h) => {
        const trocada = e.hipoteses_trocadas.includes(h.id);
        const bloqueada = !trocada && e.hipoteses_trocadas.length >= 2;
        return el("li", { class: trocada ? "ajustada" : "" },
          el("div", {}, el("strong", {}, trocada ? h.alternativa : h.texto), el("div", { class: "pequeno suave" }, trocada ? `Padrão: ${h.texto}` : `Alternativa: ${h.alternativa}`)),
          el("button", { type: "button", class: "botao secundario mini", disabled: bloqueada, "aria-pressed": String(trocada), onclick: () => {
            e.hipoteses_trocadas = trocada ? e.hipoteses_trocadas.filter((x) => x !== h.id) : [...e.hipoteses_trocadas, h.id]; SOM.tocar("passo"); render(); } },
            trocada ? "Usar a padrão" : "Ajustar"));
      })),
      el("p", { class: "aviso-fixo" }, AVISO_SIM + ".")),
    botao);
  botao.addEventListener("click", async () => {
    botao.disabled = true;
    try {
      const r = await api(`/api/campanhas/${estado.campanhaId}/tentativas`, { method: "POST", body: { decisao: textoAta, alocacao: estado.aloc, escolhas: montarEscolhas() } });
      SOM.tocar("inicio_simulacao");
      telaResultado(r.tentativa_id);
    } catch (err) { mostrarErro(corpo, err); botao.disabled = false; }
  });
  tela(barraEtapas(3), passoRoteiro() ? faixaRoteiro("veja as hipóteses e rode a simulação.") : "", corpo);
  render();
}

function montarEscolhas() {
  const c = estado.campanha.cenario, k = construtor(), e = estado.escolhas;
  const expMap = Object.fromEntries(estado.cfg.expectativas.map((x) => [x.texto, x.id]));
  const ind = Object.fromEntries(financiadas(c).map((d) => [d.id, (k.indicadores[d.id] || "").trim()]));
  return {
    construtor: k, motivos: [...k.motivos, k.motivoLivre].filter(Boolean), justificativa: k.motivoLivre,
    cortes_linhas: e.cortes_linhas, interpretacao: e.interpretacao || null, interpretou_relato: e.interpretacao ? 1 : 0,
    consultou_associados: !!e.consultou_associados, considerou_vivencias: e.considerou_vivencias ? 1 : 0,
    alternativas: e.alternativas, alternativa_escolhida: e.alternativa_escolhida || null, motivo_alternativa: e.motivo_alternativa || [],
    meta: textoMeta(k), meta_mensuravel: textoMeta(k) ? 1 : 0, revisao_dias: Number((k.revisao[0] || "").split(" ")[0]) || null,
    revisao_programada: k.revisao.length ? 1 : 0, responsavel: k.responsavel[0] || "",
    indicadores_sugeridos: ind, indicador_acompanhamento: Object.values(ind)[0] || "",
    expectativa: [...k.expectativa], expectativa_ids: k.expectativa.map((t) => expMap[t]).filter(Boolean),
    hipoteses_trocadas: e.hipoteses_trocadas || [], ano_anterior: { ...estado.base }, continuidade: e.continuidade,
    resumo_completo: (k.motivos.length || k.motivoLivre) && textoMeta(k) && k.revisao.length ? 1 : 0,
  };
}

// ------------------------------------------------------------------ 5. Resultado
const CARIMBO_CLASSE = { "SUCESSO": "sucesso", "SUCESSO PARCIAL": "parcial", "FRACASSO": "fracasso" };

async function telaResultado(tid) {
  const t = await api(`/api/tentativas/${tid}`);
  const camp = estado.campanha, c = camp.cenario;
  topo("Resultado", c?.titulo || "", telaPainel); abas(null);
  if (!t.resultado) return tela(el("div", { class: "info" }, icone("refresh-ccw", 18), el("span", {}, "Processando…")));
  const caixa = { carimbo: el("div", {}), status: el("div", { "aria-live": "polite" }), blocos: el("div", {}), sim: el("div", {}), conversa: el("div", {}) };
  const offline = () => t.modo === "contingencia" || (t.aviso || "").includes("reaproveitadas");
  tela(barraEtapas(4),
    caixa.carimbo, caixa.status,
    el("div", { class: "linha", style: "gap:.4rem;flex-wrap:wrap" },
      el("span", { class: `etiqueta ${t.revisao_humana === "validada" ? "ok" : "alerta"}` }, icone("shield-check", 12), `Revisão humana: ${t.revisao_humana === "validada" ? "validada pelo facilitador" : "pendente"}`),
      offline() ? el("span", { class: "etiqueta neutra" }, icone("info", 12), "Modo offline: simulação em cache ou por regras") : ""),
    caixa.blocos, caixa.sim, caixa.conversa,
    el("details", { class: "cartao" }, el("summary", {}, el("strong", {}, "Ata da decisão")), el("pre", { class: "ata" }, t.decisao)),
    el("div", { class: "acoes" },
      el("button", { class: "botao secundario", onclick: async () => {
        estado.campanha = await api(`/api/campanhas/${camp.id}`);
        const esc = { ...(t.escolhas || {}) }; delete esc.construtor?.ataEditada;
        iniciarTrimestre(t.alocacao, esc); telaMesa(); avisoCurto("Tentativa anterior guardada para comparar.");
      } }, icone("refresh-ccw", 18), "Experimentar outro caminho"),
      el("button", { class: "botao principal", onclick: async () => {
        try {
          estado.campanha = await api(`/api/campanhas/${camp.id}/avancar`, { method: "POST", body: { tentativa_id: t.id } });
          await carimboMissaoCumprida();
          if (estado.campanha.status === "concluida") return telaFimJornada();
          telaRecapitulando();
        } catch (e) { mostrarErro(main(), e); } } }, camp.indice_atual + 1 >= camp.total ? "Concluir o mandato" : "Próxima missão", icone("chevron-right", 18))),
    blocoTentativas(camp, t));
  verificarSelos();
  let revelado = false;
  const atualizar = (tt) => {
    const rr = tt.resultado;
    const av = rr.avaliacao;
    if (av) caixa.carimbo.replaceChildren(carimbo(av));
    caixa.blocos.replaceChildren(blocosResultado(c, tt, rr));
    if (rr.fase !== "completo") {
      caixa.status.replaceChildren(el("div", { class: "info" }, el("span", { class: "girando", style: "display:inline-flex" }, icone("refresh-ccw", 18)),
        el("span", {}, `Os agentes de IA estão simulando as reações (${tt.progresso || 0}%). O carimbo pode mudar quando terminarem.`)));
    } else {
      caixa.status.replaceChildren();
      if (!revelado) { revelado = true; SOM.tocar("fim_simulacao"); setTimeout(() => SOM.tocar(av ? `carimbo_${CARIMBO_CLASSE[av.carimbo]}` : "revelar"), 350); }
      caixa.sim.replaceChildren(blocoSimulacao(c, rr));
    }
    if (!caixa.conversa.dataset.ok) { caixa.conversa.dataset.ok = "1"; painelConversa(tt).then((p) => caixa.conversa.replaceChildren(p)); }
    return rr.fase === "completo";
  };
  if (!atualizar(t)) {
    estado.timer = setInterval(async () => {
      try { const tt = await api(`/api/tentativas/${tid}`); Object.assign(t, tt); if (atualizar(tt)) { clearInterval(estado.timer); verificarSelos(); } } catch (_) {}
    }, 3000);
  }
}

// recompensa: carimbo "MISSÃO CUMPRIDA" com animação curta e som (o texto também fica na tela)
function carimboMissaoCumprida() {
  return new Promise((resolve) => {
    SOM.tocar("missao_cumprida");
    const caixa = el("div", { class: "carimbo-missao", role: "status" }, el("div", { class: "carimbo grande" }, "MISSÃO CUMPRIDA"));
    document.body.append(caixa);
    const fim = () => { caixa.remove(); resolve(); };
    caixa.addEventListener("click", fim);
    setTimeout(fim, matchMedia("(prefers-reduced-motion: reduce)").matches ? 900 : 1500);
  });
}

// ------------------------------------------------------------------ fim da jornada: "Deixe seu legado"
async function telaFimJornada() {
  topo("Mandato concluído", PRODUTO, telaPainel); abas(null);
  let rel = null, sel = { selos: [] };
  try { [rel, sel] = await Promise.all([api(`/api/campanhas/${estado.campanhaId}/relatorio`), api(`/api/campanhas/${estado.campanhaId}/selos`)]); } catch (_) {}
  const geral = rel?.carimbo_geral;
  tela(el("div", { class: "cartao cartao-principal fim-jornada" },
    el("span", { class: "etiqueta-mono" }, "Fechamento do mandato"),
    geral ? el("div", { class: `carimbo-resultado ${CARIMBO_CLASSE[geral]}` }, el("div", { class: "carimbo" }, geral),
      el("p", { class: "motivo" }, `Média das ${rel.missoes.length} missões${rel.desempenho?.geral ? ` · desempenho acadêmico ${rel.desempenho.geral}` : ""}`)) : "",
    el("h2", {}, "Certificações de competência"), credenciais(sel.selos.filter((x) => x.ganho).length ? sel.selos : sel.selos),
    el("p", { class: "slogan" }, SLOGAN),
    el("button", { class: "botao principal bloco grande", onclick: () => { SOM.tocar("transicao"); iniciarContribuicao(); } }, icone("library", 20), "Deixe seu legado: compartilhe o que você aprendeu"),
    el("div", { class: "acoes" }, el("button", { class: "botao secundario", onclick: () => irPara("relatorio") }, icone("download", 18), "Baixar o Plano de decisão"),
      el("button", { class: "botao fantasma", onclick: telaPainel }, "Voltar ao Painel"))));
}

function carimbo(av) {
  return el("div", { class: `carimbo-resultado ${CARIMBO_CLASSE[av.carimbo]}`, role: "status" },
    el("div", { class: "carimbo" }, av.carimbo), el("p", { class: "motivo" }, av.motivo),
    el("button", { class: "botao secundario mini", onclick: () => abrirDesempenho(av) }, icone("award", 16), `Desempenho acadêmico: ${av.desempenho.geral}`));
}

function abrirDesempenho(av) {
  abrirPainel("Desempenho acadêmico",
    el("div", { class: "conceito-geral" }, el("span", { class: "rotulo-mono" }, "Conceito geral"), el("span", { class: `conceito c${av.desempenho.geral}` }, av.desempenho.geral)),
    el("table", { class: "desempenho" }, el("tbody", {}, av.desempenho.criterios.map((x) => el("tr", {},
      el("th", { scope: "row" }, x.nome), el("td", {}, el("span", { class: `conceito c${x.conceito}` }, x.conceito)), el("td", { class: "pequeno" }, x.explicacao))))),
    el("p", { class: "pequeno suave" }, "A = 4, B = 3, C = 2, D = 1. O conceito geral é a média dos critérios. Regras em config/avaliacao.yaml."));
}

function blocosResultado(c, t, rr) {
  const av = rr.avaliacao || {};
  const aloc = t.alocacao || {}, base = t.escolhas?.ano_anterior || {};
  const fin = c.demandas.filter((d) => aloc[d.id] > 0), adi = c.demandas.filter((d) => !aloc[d.id] && (base[d.id] || 0) > 0);
  const nomeInd = Object.fromEntries(estado.cfg.indicadores.map((i) => [i.id, i.nome]));
  const ind = rr.indicadores || {};
  const pesoLista = (itens) => el("ul", { class: "pesos" }, itens.map((p) => el("li", { class: p.sentido }, icone(p.sentido === "positivo" ? "trending-up" : "trending-down", 16),
    el("span", {}, el("strong", {}, p.fator), p.efeito ? ` — ${p.efeito}` : ""))));
  return el("div", {},
    el("div", { class: "grade-resultado" },
      el("div", { class: "cartao" }, el("p", { class: "rotulo-mono" }, "Prioridades"),
        el("ul", { class: "pequeno" }, fin.map((d) => el("li", {}, d.titulo)), adi.map((d) => el("li", { class: "suave" }, `${d.titulo} (adiada)`)))),
      el("div", { class: "cartao" }, el("p", { class: "rotulo-mono" }, "Orçamento: planejado × executado"),
        el("table", { class: "pequeno" }, el("tbody", {}, fin.map((d) => el("tr", {}, el("td", {}, d.titulo), el("td", { class: "num" }, brl(aloc[d.id])), el("td", { class: "num" }, brl(aloc[d.id]))))),
          el("tfoot", {}, el("tr", {}, el("th", {}, "Total"), el("th", { class: "num" }, brl(rr.disponivel - rr.saldo)), el("th", { class: "num" }, brl(rr.disponivel - rr.saldo))))),
        el("p", { class: "pequeno suave" }, `Teto ${brl(rr.disponivel)} · saldo ${brl(rr.saldo)}` + (rr.horas_equipe ? ` · ${rr.horas_usadas} de ${rr.horas_equipe} h da equipe` : ""))),
      el("div", { class: "cartao" }, el("p", { class: "rotulo-mono" }, "Resultados"),
        rr.meta ? [el("p", { class: "pequeno" }, rr.meta.texto), el("div", { class: "barra", role: "meter", "aria-valuemin": 0, "aria-valuemax": rr.meta.alvo, "aria-valuenow": rr.meta.previsto, "aria-label": `Previsto ${rr.meta.previsto} de ${rr.meta.alvo}` },
          el("span", { style: `width:${Math.min(100, rr.meta.pct)}%` })), el("p", { class: "pequeno" }, `Previsto: ${rr.meta.previsto} de ${rr.meta.alvo} (${rr.meta.pct}%) · ${rr.meta.situacao}`)]
          : el("p", { class: "pequeno suave" }, "Sem meta mensurável."),
        el("ul", { class: "pequeno lista-ind" }, Object.keys(ind.depois || {}).map((k) => el("li", {}, nomeInd[k], " ", delta(ind.variacao[k])))))),
    av.pesos ? el("div", { class: "grade-resultado" },
      el("div", { class: "cartao" }, el("p", { class: "rotulo-mono" }, "O que mais pesou"), pesoLista(av.pesos.mais)),
      av.pesos.menos.length ? el("div", { class: "cartao" }, el("p", { class: "rotulo-mono" }, "O que menos pesou"), pesoLista(av.pesos.menos)) : "") : "",
    (av.feedback_relato || []).length || (av.expectativas || []).length ? el("div", { class: "cartao" }, el("p", { class: "rotulo-mono" }, "Feedback"),
      el("ul", { class: "pequeno" }, (av.feedback_relato || []).map((f) => el("li", {}, f)),
        (av.expectativas || []).map((x) => el("li", {}, `Você esperava: "${x.texto}". `, el("strong", {}, x.confirmada ? "A simulação confirmou." : "A simulação não confirmou."))))) : "",
    (av.hipoteses || []).length ? el("details", { class: "cartao pequeno" }, el("summary", {}, el("strong", {}, "Hipóteses usadas na simulação")),
      el("ul", {}, av.hipoteses.map((h) => el("li", {}, h.texto, h.ajustada ? el("span", { class: "etiqueta neutra", style: "margin-left:.3rem" }, "ajustada") : "")))) : "");
}

function blocoSimulacao(c, rr) {
  const reacoes = (rr.momentos || []).map((m) => ({ ...m, a: ator(m.ator_id) || { id: m.ator_id, nome: m.nome, tipo: m.tipo } }));
  const postura = (id) => (rr.reacoes || []).find((x) => x.ator_id === id)?.postura_final ?? 0;
  const balao = (m) => el("li", { class: "balao-reacao" }, Ator(m.a, { tamanho: 44, expressao: AVATAR.expressaoDePostura(postura(m.ator_id)), status: true }), el("p", { class: "balao" }, m.fala));
  const riscos = rr.riscos || [];
  return el("div", {},
    reacoes.length ? el("div", { class: "cartao" }, el("h3", { style: "margin-top:0" }, "Reações dos stakeholders"),
      el("ul", { class: "baloes" }, reacoes.slice(0, 4).map(balao)),
      (rr.reacoes || []).length > 4 ? el("button", { class: "botao fantasma", onclick: () => abrirPainel("Todas as reações",
        el("ul", { class: "baloes" }, (rr.reacoes || []).map((r) => el("li", { class: "balao-reacao" },
          Ator(ator(r.ator_id) || { nome: r.nome, tipo: r.tipo }, { tamanho: 40, expressao: AVATAR.expressaoDePostura(r.postura_final), status: true }),
          el("p", { class: "balao" }, r.reacao || POSTURA[r.postura_final] || ""))))) }, "Ver todas") : "",
      rr.resumo ? el("details", {}, el("summary", { class: "pequeno" }, "Resumo da simulação"), el("p", { class: "pequeno" }, rr.resumo)) : "") : "",
    riscos.length ? el("div", { class: "cartao" }, el("h3", { style: "margin-top:0" }, "Riscos apontados pelos agentes"), mapaRiscos(riscos),
      el("ol", { class: "pequeno" }, riscos.map((x) => el("li", {}, `${x.descricao} (probabilidade ${x.probabilidade}, impacto ${x.impacto})`))),
      (rr.sinais_alerta || []).length ? [el("p", { class: "rotulo-mono" }, "Sinais de alerta"), el("ul", { class: "pequeno" }, rr.sinais_alerta.map((s) => el("li", {}, s)))] : "") : "",
    el("p", { class: "aviso-fixo" }, AVISO_SIM + "."));
}

function blocoTentativas(camp, atual) {
  const ts = (camp.tentativas || []).filter((x) => x.id !== atual.id);
  if (!ts.length) return "";
  return el("details", { class: "cartao" }, el("summary", {}, el("strong", {}, `Outros caminhos desta missão (${ts.length})`)),
    el("ul", { class: "pequeno" }, ts.map((x) => el("li", {}, `${new Date(x.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · `,
      Object.entries(x.alocacao || {}).filter(([, v]) => v > 0).map(([k, v]) => `${camp.cenario.demandas.find((d) => d.id === k)?.titulo || k}: ${brl(v)}`).join("; "), " ",
      el("button", { class: "botao fantasma mini-link", onclick: () => telaResultado(x.id) }, "Ver")))));
}
