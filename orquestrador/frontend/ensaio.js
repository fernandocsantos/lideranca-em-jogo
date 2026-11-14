/* Modo Ensaio: a liderança ensaia uma decisão REAL com os mesmos formulários guiados.
   O texto é mascarado no servidor, que simula e devolve o resultado SEM gravar; o ensaio fica só neste aparelho. */
"use strict";

const ens = { dados: null };
const ENSAIOS_KEY = "lej_ensaios";
const ensaiosSalvos = () => JSON.parse(localStorage.getItem(ENSAIOS_KEY) || "[]");
const salvarEnsaios = (l) => localStorage.setItem(ENSAIOS_KEY, JSON.stringify(l.slice(0, 10)));

// Exemplo FICTÍCIO pré-gravado: funciona offline e com o simulador fora do ar.
const ENSAIO_EXEMPLO = {
  id: "exemplo", criado_em: "2026-11-14", exemplo: true,
  entrada: { titulo: "Reduzir o evento de fim de ano para reforçar o atendimento", teto: 40000,
    linhas: [{ nome: "Evento de fim de ano", ano_anterior: 30000, proposto: 15000 }, { nome: "Atendimento ao associado", ano_anterior: 10000, proposto: 20000 }],
    criterios: ["Menor risco financeiro", "Mais associados beneficiados"], stakeholders: ["Diretoria", "Associados do varejo", "Imprensa local"],
    meta: "Reduzir a inadimplência de 18% para 12% em 90 dias", responsavel: "Diretoria executiva", comunicacao: ["Assembleia", "WhatsApp"] },
  resultado: { resumo: "A diretoria apoia o reforço no atendimento, mas lojistas do centro veem o evento menor como perda de vendas. A imprensa local tende a noticiar a mudança como corte. Explicar o critério e a revisão em 90 dias reduz o desgaste.",
    reacoes: [{ stakeholder: "Diretoria", postura: 1, reacao: "Aprova se houver meta e data de revisão." }, { stakeholder: "Associados do varejo", postura: -1, reacao: "Teme perder vendas de dezembro com um evento menor." },
      { stakeholder: "Imprensa local", postura: 0, reacao: "Vai noticiar o corte; quer números e porta-voz." }],
    riscos: [{ descricao: "Lojistas do centro reduzirem a participação", probabilidade: "medio", impacto: "alto" }, { descricao: "Notícia negativa sobre o corte do evento", probabilidade: "medio", impacto: "medio" },
      { descricao: "Inadimplência não cair por falta de contato ativo", probabilidade: "baixo", impacto: "alto" }],
    sinais_alerta: ["Queda nas inscrições do evento", "Reclamações no grupo de associados"], o_que_mudaria: ["Um patrocinador para o evento"],
    recomendacoes: ["Conversar com os lojistas do centro antes do anúncio", "Divulgar a meta de inadimplência e a data de revisão"],
    orcamento: { total: 35000, teto: 40000, saldo: 5000 }, aviso: "Simulação para apoio à decisão; não é garantia de resultado.", motor: "exemplo pré-gravado" },
};

async function telaEnsaio() {
  topo("Modo Ensaio"); abas("ensaio");
  const lista = ensaiosSalvos();
  tela(
    el("div", { class: "cartao cartao-destaque" }, el("h2", { style: "margin-top:0" }, "Ensaie uma decisão real"),
      el("p", { class: "suave" }, "Descreva uma decisão que você vai tomar. A simulação antecipa reações de stakeholders e riscos, para reduzir o risco da atuação real."),
      el("ul", { class: "regras" },
        el("li", {}, icone("shield-check", 18), el("span", {}, "O texto é mascarado antes de qualquer envio (nomes, contatos, empresas, cidades).")),
        el("li", {}, icone("lock", 18), el("span", {}, "O servidor não guarda o ensaio. O resultado fica só neste aparelho e você pode apagá-lo."))),
      el("div", { class: "acoes" }, el("button", { class: "botao", onclick: () => formEnsaio() }, icone("plus", 18), "Novo ensaio"),
        el("button", { class: "botao secundario", onclick: () => resultadoEnsaio(ENSAIO_EXEMPLO) }, icone("play", 18), "Ver ensaio de exemplo"))),
    el("p", { class: "rotulo-secao" }, `Ensaios neste aparelho (${lista.length})`),
    lista.length ? lista.map((e) => el("div", { class: "cartao linha entre" }, el("div", {}, el("strong", {}, e.entrada.titulo || "Ensaio"), el("div", { class: "pequeno suave" }, e.criado_em)),
      el("div", { class: "linha" }, el("button", { class: "botao secundario", onclick: () => resultadoEnsaio(e) }, "Abrir"),
        el("button", { class: "botao-icone", "aria-label": "Apagar ensaio", onclick: () => { salvarEnsaios(ensaiosSalvos().filter((x) => x.id !== e.id)); telaEnsaio(); } }, icone("x", 20)))))
      : el("p", { class: "pequeno suave" }, "Nenhum ensaio salvo."));
}

async function formEnsaio() {
  topo("Novo ensaio", "Decisão real", telaEnsaio); abas(null);
  const st = await api("/api/ensaio/stakeholders").catch(() => ({ stakeholders: ["Diretoria", "Associados", "Prefeitura", "Imprensa local"], personas: [] }));
  const d = ens.dados = { titulo: "", contexto: "", teto: 0, linhas: [{ nome: "", ano_anterior: 0, proposto: 0 }, { nome: "", ano_anterior: 0, proposto: 0 }],
    opcoes: [], criterios: [], stakeholders: [], meta: "", responsavel: [], comunicacao: [] };
  const corpo = el("div", {});
  const total = el("div", { class: "total-mesa", style: "position:static" });
  const atualizarTotal = () => {
    const t = d.linhas.reduce((a, l) => a + Number(l.proposto || 0), 0), dif = t - Number(d.teto || 0);
    total.replaceChildren(el("div", { class: "numeros" }, el("span", {}, el("span", { class: "grande" }, brl(t)), el("span", { class: "suave" }, ` de ${brl(d.teto)}`)),
      d.teto ? (dif > 0 ? el("span", { class: "status-mesa estouro" }, icone("triangle-alert", 16), `Falta cortar ${brl(dif)}`) : el("span", { class: "status-mesa ok" }, icone("circle-check", 16), dif === 0 ? "Orçamento fechado" : `Sobram ${brl(-dif)}`)) : ""));
  };
  const campoTexto = (rot, id, chave, area = false) => {
    const c = el(area ? "textarea" : "input", area ? { id, rows: 4, maxlength: 2000 } : { type: "text", id, maxlength: 200 });
    c.value = d[chave]; c.addEventListener("input", () => { d[chave] = c.value; });
    return el("div", {}, el("label", { for: id }, rot), c, area ? botaoVoz(c) : "");
  };
  const renderLinhas = () => el("div", {}, d.linhas.map((l, i) => {
    const nome = el("input", { type: "text", "aria-label": `Linha ${i + 1}: nome`, placeholder: "Ex.: evento de fim de ano", value: l.nome });
    nome.addEventListener("input", () => { l.nome = nome.value; });
    const num = (k, rot) => { const n = el("input", { type: "number", min: 0, step: 500, inputmode: "numeric", "aria-label": `Linha ${i + 1}: ${rot}`, value: l[k] || "" });
      n.addEventListener("input", () => { l[k] = Number(n.value || 0); atualizarTotal(); }); return el("label", { class: "pequeno", style: "font-weight:400;margin:.3rem 0" }, rot, n); };
    return el("div", { class: "linha-mesa", style: "grid-template-columns:1fr" }, nome, el("div", { class: "linha" }, num("ano_anterior", "Ano anterior (R$)"), num("proposto", "Proposto (R$)")));
  }));
  const linhasBox = el("div", {});
  const redesenharLinhas = () => linhasBox.replaceChildren(renderLinhas(), el("button", { type: "button", class: "botao fantasma", onclick: () => { d.linhas.push({ nome: "", ano_anterior: 0, proposto: 0 }); redesenharLinhas(); } }, icone("plus", 16), "Adicionar linha"));
  redesenharLinhas();
  const teto = el("input", { type: "number", id: "ens-teto", min: 0, step: 500, inputmode: "numeric" });
  teto.addEventListener("input", () => { d.teto = Number(teto.value || 0); atualizarTotal(); });
  const opcaoLivre = el("input", { type: "text", id: "ens-opcao", maxlength: 200, placeholder: "Ex.: manter o evento e cortar a comunicação" });
  const passo = (n, t, ...c) => el("div", { class: "cartao" }, el("div", { class: "passo-num" }, el("span", { class: "n" }, String(n)), el("div", { class: "corpo" }, el("h3", { style: "margin-top:.15rem" }, t), ...c)));
  const botao = el("button", { class: "botao bloco" }, icone("flask-conical", 18), "Ensaiar decisão");
  botao.addEventListener("click", async () => {
    if (opcaoLivre.value.trim()) d.opcoes = [...d.opcoes, opcaoLivre.value.trim()];
    botao.disabled = true; botao.replaceChildren(el("span", { class: "girando", style: "display:inline-flex" }, icone("refresh-ccw", 18)), "Simulando…");
    SOM.tocar("inicio_simulacao");
    try {
      const corpoReq = { ...d, linhas: d.linhas.filter((l) => l.nome || l.proposto), responsavel: d.responsavel[0] || "" };
      const r = await api("/api/ensaio/simular", { method: "POST", body: corpoReq });
      const e = { id: String(Date.now()), criado_em: new Date().toLocaleString("pt-BR"), entrada: r.entrada_mascarada, resultado: r };
      salvarEnsaios([e, ...ensaiosSalvos()]);
      SOM.tocar("fim_simulacao");
      resultadoEnsaio(e);
    } catch (err) { mostrarErro(corpo, err); botao.disabled = false; botao.replaceChildren(icone("flask-conical", 18), "Ensaiar decisão"); }
  });
  corpo.append(
    passo(1, "Qual decisão você vai tomar?", campoTexto("Título", "ens-titulo", "titulo"), campoTexto("Contexto (fale ou escreva; será mascarado)", "ens-ctx", "contexto", true)),
    passo(2, "Orçamento", el("label", { for: "ens-teto" }, "Teto disponível (R$)"), teto, linhasBox, total),
    passo(3, "Opções e critérios", el("label", { for: "ens-opcao" }, "Outra opção considerada"), opcaoLivre,
      el("p", { class: "rotulo-secao" }, "Critérios"), chips(CRITERIOS, d.criterios)),
    passo(4, "Quem será afetado ou ouvido?", chips(st.stakeholders, d.stakeholders, { max: 8 }),
      st.personas.length ? el("p", { class: "pequeno suave" }, `${st.personas.length} persona(s) sintética(s) do Banco de Vivências entram na simulação quando o grupo combina.`) : ""),
    passo(5, "Meta e comunicação", campoTexto("Meta (quantidade, o quê, prazo)", "ens-meta", "meta"),
      el("p", { class: "rotulo-secao" }, "Responsável"), chips(RESPONSAVEIS, d.responsavel, { multiplo: false }),
      el("p", { class: "rotulo-secao" }, "Comunicação"), chips(CANAIS, d.comunicacao)),
    avisoVoz(), botao);
  atualizarTotal();
  tela(corpo);
}

function resultadoEnsaio(e) {
  const r = e.resultado, en = e.entrada;
  topo("Resultado do ensaio", e.exemplo ? "Exemplo pré-gravado" : e.criado_em, telaEnsaio); abas(null);
  const tipoDe = (s) => (/prefeit|câmara|poder/i.test(s) ? "poder_publico" : /imprensa/i.test(s) ? "imprensa" : /diretoria|conselho/i.test(s) ? "diretoria" : /parceir|sebrae|banco/i.test(s) ? "parceiro" : "associado");
  tela(
    e.exemplo ? el("div", { class: "info" }, icone("info", 18), el("span", {}, "Exemplo fictício pré-gravado: funciona sem internet e com o simulador fora do ar.")) : "",
    el("div", { class: "cartao" }, el("div", { class: "cabecalho-doc" }, el("span", {}, "Ata do ensaio"), el("span", {}, en.titulo || ""), el("span", {}, "")),
      el("p", {}, r.resumo),
      el("div", { class: "tabela-rolagem" }, el("table", {}, el("thead", {}, el("tr", {}, ["Linha", "Ano anterior", "Proposto", "Variação"].map((h, i) => el("th", { class: i ? "num" : "" }, h)))),
        el("tbody", {}, (en.linhas || []).map((l) => el("tr", {}, el("td", {}, l.nome), el("td", { class: "num" }, brl(l.ano_anterior)), el("td", { class: "num" }, brl(l.proposto)),
          el("td", { class: `num ${l.proposto < l.ano_anterior ? "desce" : l.proposto > l.ano_anterior ? "sobe" : ""}` }, `${l.proposto >= l.ano_anterior ? "+" : "−"}${brl(Math.abs(l.proposto - l.ano_anterior))}`)))))),
      el("p", { class: "pequeno" }, `Total ${brl(r.orcamento.total)} de ${brl(r.orcamento.teto)} · saldo ${brl(r.orcamento.saldo)}`)),
    el("div", { class: "cartao" }, el("h3", { style: "margin-top:0" }, "Reações previstas"),
      el("ol", { class: "linha-tempo" }, r.reacoes.map((x) => el("li", {}, AVATAR.criar({ id: x.stakeholder, nome: x.stakeholder, tipo: tipoDe(x.stakeholder), expressao: AVATAR.expressaoDePostura(x.postura), tamanho: 40 }),
        el("div", {}, el("strong", {}, x.stakeholder), el("div", { class: "pequeno" }, x.reacao)))))),
    el("div", { class: "cartao" }, el("h3", { style: "margin-top:0" }, "Mapa de riscos"), mapaRiscos(r.riscos),
      el("ol", { class: "pequeno" }, r.riscos.map((x) => el("li", {}, `${x.descricao} (probabilidade ${x.probabilidade}, impacto ${x.impacto})`))),
      el("h3", {}, "Sinais de alerta"), el("ul", { class: "pequeno" }, r.sinais_alerta.map((x) => el("li", {}, x))),
      el("h3", {}, "O que mudaria a previsão"), el("ul", { class: "pequeno" }, r.o_que_mudaria.map((x) => el("li", {}, x))),
      el("h3", {}, "Ajustes recomendados antes de decidir"), el("ul", { class: "pequeno" }, r.recomendacoes.map((x) => el("li", {}, x))),
      el("p", { class: "aviso-fixo" }, `${r.aviso} Motor: ${r.motor}.`)),
    el("div", { class: "acoes" },
      el("button", { class: "botao", onclick: () => { pdfEnsaio(e).save("ensaio-de-decisao.pdf"); avisoCurto("PDF gerado."); } }, icone("download", 18), "Baixar ata do ensaio (PDF)"),
      el("button", { class: "botao secundario", onclick: telaEnsaio }, "Voltar")));
}

function pdfEnsaio(e) {
  const en = e.entrada, r = e.resultado;
  const linhas = (en.linhas || []).map((l) => ({ linha: l.nome, ano_anterior: l.ano_anterior, planejado: l.proposto, executado: l.proposto, variacao: l.proposto - l.ano_anterior, horas: null,
    justificativa: "" }));
  const d = { titulo: "Plano de decisão — Legado", gerado_em: new Date().toLocaleString("pt-BR"), associacao: "", perfil: "Modo Reunião: decisão real anonimizada",
    apelido: null, selo: e.exemplo ? "Demonstração com dados fictícios" : "Situação real anonimizada", slogan: "Seu mandato passa. O que você ensina continua cuidando de quem empreende.",
    descricao: "Plano gerado no Modo Reunião. O texto foi anonimizado antes da simulação e nada foi guardado no servidor.",
    secoes: ["Contexto e restrições", "Prioridades", "Orçamento e horas", "Alternativas comparadas", "Relatos considerados", "Resultados", "Aprendizados para a próxima decisão", "Simulação"],
    aviso: r.aviso, certificacoes: [], resumo: [], desempenho: null,
    missoes: [{ missao: 1, rotulo: "Reunião", titulo: en.titulo || "Decisão", data: "", carimbo: null, motivo: r.resumo,
      secoes: {
        contexto: { orcamento_antes: r.orcamento.teto, orcamento_depois: r.orcamento.teto, horas_equipe: 0, horas_usadas: 0, fato_novo: en.contexto || "", restricoes: [] },
        prioridades: { escolhidas: linhas.filter((l) => l.planejado > 0).map((l) => `${l.linha} (R$ ${l.planejado.toLocaleString("pt-BR")})`), adiadas: linhas.filter((l) => !l.planejado).map((l) => l.linha), criterios: en.criterios || [] },
        orcamento: { linhas, total: r.orcamento.total, teto: r.orcamento.teto, saldo: r.orcamento.saldo },
        alternativas: { comparadas: [], escolhida: null, motivo: [] },
        relatos: { relato: null, outros: [] },
        resultados: { meta: en.meta || "", responsavel: en.responsavel || "", revisao: null, indicadores_sugeridos: [], previsao_meta: null },
        aprendizados: r.recomendacoes || [],
        simulacao: { hipoteses: [], riscos: r.riscos, sinais_alerta: r.sinais_alerta, reacoes: r.reacoes.map((x) => ({ nome: x.stakeholder, reacao: x.reacao })),
          revisao_humana: "pendente", modo: r.motor, aviso: r.aviso } } }] };
  return RELATORIO.pdf(d);
}
