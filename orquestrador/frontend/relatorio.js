/* Relatório de gestão: Ata Padronizada (7 seções) por trimestre + consolidado.
   PDF institucional (jsPDF + autotable, embutidos) na paleta CACB, CSV e texto. Gerado no navegador: funciona offline. */
"use strict";

const RELATORIO = (() => {
  const AZUL = [0, 103, 190], AMARELO = [255, 184, 28], VERDE = [0, 131, 104], TEXTO = [26, 34, 48], SUAVE = [75, 85, 101];
  const POST = { "-2": "insatisfeita", "-1": "desconfiada", "0": "neutra", "1": "favorável", "2": "favorável" };
  const NIVEL = { alto: "alto", medio: "médio", baixo: "baixo" };
  const reais = (v) => "R$ " + Math.round(Number(v) || 0).toLocaleString("pt-BR");
  const pdfTxt = (s) => String(s ?? "").replace(/[−–—]/g, "-").replace(/→/g, "->").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...");
  let dados = null;

  async function carregar(camp, comApelido) {
    dados = await api(`/api/campanhas/${camp.id}/relatorio?apelido=${comApelido ? 1 : 0}`);
    return dados;
  }

  // ---------------------------------------------------------------- texto
  function texto(d) {
    const L = [];
    L.push(d.titulo.toUpperCase(), `${d.perfil} · ${d.associacao}`, `Gerado em ${d.gerado_em}${d.apelido ? ` · Presidência: ${d.apelido}` : ""}`, "");
    for (const a of d.atas) {
      L.push(`ATA PADRONIZADA DE DECISÃO — TRIMESTRE ${a.trimestre}: ${a.titulo}${a.consolidada ? "" : " (não consolidada)"}`);
      L.push("1. Contexto", `   ${a.contexto.associacao} (${a.contexto.perfil}, ${a.contexto.associados} associados)`, `   Fato novo: ${a.contexto.fato_novo}`,
        ...a.contexto.restricoes.map((r) => `   - ${r}`));
      L.push("2. Prioridades", `   Opções: ${a.prioridades.opcoes.join("; ")}`, `   Escolhida: ${a.prioridades.escolhida}`, `   Critérios: ${a.prioridades.criterios.join("; ") || "-"}`,
        `   Trade-offs: ${a.prioridades.trade_offs.join("; ") || "-"}`, `   Envolvidos antes de decidir: ${a.prioridades.envolvidos.join(", ") || "-"}`);
      L.push("3. Orçamento", ...a.orcamento.linhas.map((l) => `   ${l.linha}: ${reais(l.ano_anterior)} -> ${reais(l.proposto)} (${l.variacao >= 0 ? "+" : ""}${reais(l.variacao)}${l.variacao_pct !== null ? `, ${l.variacao_pct}%` : ""})`),
        `   Total ${reais(a.orcamento.total)} de ${reais(a.orcamento.teto)}; saldo ${reais(a.orcamento.saldo)}`, `   Justificativa dos cortes: ${a.orcamento.justificativa_cortes.join("; ") || "-"}`);
      L.push("4. Resultados", `   Meta: ${a.resultados.meta || "-"}`, `   Responsável: ${a.resultados.responsavel || "-"} · Revisão: ${a.resultados.revisao || "-"} · Indicador: ${a.resultados.indicador || "-"}`);
      L.push("5. Previsão e riscos", ...a.previsao.reacoes.map((r) => `   ${r.nome}: ${POST[r.postura]}${r.reacao ? ` — ${r.reacao}` : ""}`),
        ...a.previsao.riscos.map((r, i) => `   Risco ${i + 1}: ${r.descricao} (probabilidade ${NIVEL[r.probabilidade]}, impacto ${NIVEL[r.impacto]})`),
        `   Sinais de alerta: ${a.previsao.sinais_alerta.join("; ") || "-"}`, `   O que mudaria a previsão: ${a.previsao.o_que_mudaria.join("; ") || "-"}`, `   ${a.previsao.aviso}`);
      L.push("6. Indicadores", ...a.indicadores.map((i) => `   ${i.indicador}: ${Math.round(i.antes)} -> ${Math.round(i.depois)} (${i.variacao >= 0 ? "+" : ""}${i.variacao})`));
      L.push("7. Competências", `   Certificações: ${d.certificacoes.map((c) => c.nome).join(", ") || "-"}`, ...a.competencias.aprendizados.map((x) => `   - ${x}`), "");
    }
    const c = d.consolidado;
    L.push("CONSOLIDADO DO MANDATO", ...c.quadro.map((q) => `   T${q.trimestre}: prioridade ${q.prioridade}; ${reais(q.total)} de ${reais(q.teto)}; meta: ${q.meta || "-"}; ${q.riscos} risco(s)`),
      "   Padrões de decisão:", ...c.padroes.map((p) => `   - ${p}`),
      "   Tentativas refeitas:", ...(c.refeitas.length ? c.refeitas.map((r) => `   - T${r.trimestre}: ${r.tentativas} tentativas; ${r.mudancas.join(" | ")}`) : ["   - nenhuma"]),
      "", d.aviso);
    return L.join("\n");
  }

  // ---------------------------------------------------------------- CSV
  function csv(d) {
    const cab = ["trimestre", "titulo", "consolidada", "linha", "ano_anterior", "proposto", "variacao_rs", "variacao_pct", "total", "teto", "prioridade",
      "criterios", "envolvidos", "justificativa_cortes", "meta", "responsavel", "revisao", "indicador_acompanhamento", "riscos", "modo"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = [cab.join(";")];
    for (const a of d.atas) for (const l of a.orcamento.linhas) {
      linhas.push([a.trimestre, a.titulo, a.consolidada ? "sim" : "não", l.linha, l.ano_anterior, l.proposto, l.variacao, l.variacao_pct ?? "", a.orcamento.total, a.orcamento.teto,
        a.prioridades.escolhida, a.prioridades.criterios.join(" | "), a.prioridades.envolvidos.join(" | "), a.orcamento.justificativa_cortes.join(" | "), a.resultados.meta,
        a.resultados.responsavel, a.resultados.revisao ?? "", a.resultados.indicador, a.previsao.riscos.map((r) => `${r.descricao} (P ${r.probabilidade}/I ${r.impacto})`).join(" | "), a.modo].map(esc).join(";"));
    }
    return "﻿" + linhas.join("\r\n");
  }

  function baixar(nome, conteudo, tipo) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    a.download = nome; document.body.append(a); a.click(); a.remove();
  }

  // ---------------------------------------------------------------- PDF
  function pdf(d) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const M = 16, W = 210 - 2 * M;
    let y = 0;
    const desenharCabecalho = () => {
      doc.setFillColor(...AZUL); doc.rect(0, 0, 210, 14, "F");
      doc.setFillColor(...AMARELO); doc.rect(0, 14, 150, 1.4, "F");
      doc.setFillColor(...VERDE); doc.rect(150, 14, 60, 1.4, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text("LIDERANÇA EM JOGO", M, 9); doc.setFont("helvetica", "normal");
      doc.text(pdfTxt(`Relatório de gestão · ${d.gerado_em}`), 210 - M, 9, { align: "right" });
    };
    const cabecalho = () => { y = 24; };  // o cabeçalho é desenhado em todas as páginas no final
    const novaPagina = () => { doc.addPage(); cabecalho(); };
    const espaco = (h) => { if (y + h > 280) novaPagina(); };
    const titulo = (t, tam = 13) => { espaco(12); doc.setTextColor(...AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(tam); doc.text(pdfTxt(t), M, y); y += tam * 0.5 + 2; };
    const secao = (n, t) => { espaco(10); doc.setDrawColor(...AZUL); doc.setLineWidth(0.3); doc.line(M, y, M + W, y); y += 5;
      doc.setTextColor(...TEXTO); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.text(pdfTxt(`${n}. ${t}`), M, y); y += 5.5; };
    const par = (t, { suave = false, tam = 9.5 } = {}) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(tam); doc.setTextColor(...(suave ? SUAVE : TEXTO));
      const ls = doc.splitTextToSize(pdfTxt(t), W);
      for (const l of ls) { espaco(5); doc.text(l, M, y); y += 4.6; }
    };
    const rotulo = (r, v) => par(`${r}: ${v || "-"}`);
    const tabela = (cab, linhas, opts = {}) => {
      doc.autoTable({ startY: y, head: [cab.map(pdfTxt)], body: linhas.map((l) => l.map(pdfTxt)), margin: { left: M, right: M, top: 24 },
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.6, textColor: TEXTO }, headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [235, 243, 250] }, ...opts });
      y = doc.lastAutoTable.finalY + 5;
    };
    const mapa = (riscos) => {
      espaco(42);
      const x0 = M + 22, cel = 22, alt = 9;
      const niv = ["alto", "medio", "baixo"], imp = ["baixo", "medio", "alto"];
      const cor = (ip, ii) => { const s = Math.min(3, Math.max(1, Math.round(((2 - ip) + ii) / 2) + 1)); return s === 1 ? [230, 243, 240] : s === 2 ? [255, 244, 221] : [253, 236, 234]; };
      doc.setFontSize(7.5); doc.setTextColor(...SUAVE);
      imp.forEach((v, i) => doc.text(pdfTxt(`Impacto ${NIVEL[v]}`), x0 + i * cel + cel / 2, y, { align: "center" }));
      y += 2;
      niv.forEach((p, ip) => {
        doc.setTextColor(...SUAVE); doc.text(pdfTxt(`Prob. ${NIVEL[p]}`), M, y + alt / 2 + 1);
        imp.forEach((v, ii) => {
          doc.setFillColor(...cor(ip, ii)); doc.rect(x0 + ii * cel, y, cel - 1, alt - 1, "F");
          const nums = riscos.map((r, k) => (r.probabilidade === p && r.impacto === v ? String(k + 1) : null)).filter(Boolean).join(", ");
          if (nums) { doc.setTextColor(...TEXTO); doc.setFont("helvetica", "bold"); doc.text(nums, x0 + ii * cel + cel / 2 - 0.5, y + alt / 2 + 0.8, { align: "center" }); doc.setFont("helvetica", "normal"); }
        });
        y += alt;
      });
      y += 3;
    };

    cabecalho();
    doc.setTextColor(...TEXTO); doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text(pdfTxt(d.titulo), M, y + 4); y += 12;
    par(`${d.associacao}`); par(`Perfil fictício: ${d.perfil}${d.apelido ? ` · Presidência: ${d.apelido}` : ""}`, { suave: true });
    par(d.frase, { suave: true, tam: 8.5 }); y += 2;

    d.atas.forEach((a) => {
      if (y > 60) novaPagina();
      titulo(`Ata Padronizada de Decisão — Trimestre ${a.trimestre}`);
      par(`${a.titulo} · ${a.data}${a.consolidada ? "" : " · tentativa não consolidada"}${a.modo === "contingencia" ? " · simulação simplificada" : ""}`, { suave: true });
      secao(1, "Contexto");
      rotulo("Associação", `${a.contexto.associacao} (${a.contexto.perfil}; ${a.contexto.associados} associados)`);
      rotulo("Fato novo", a.contexto.fato_novo); a.contexto.restricoes.forEach((r) => par(`• ${r}`));
      secao(2, "Prioridades");
      rotulo("Opções consideradas", a.prioridades.opcoes.join("; ")); rotulo("Prioridade escolhida", a.prioridades.escolhida);
      rotulo("Critérios", a.prioridades.criterios.join("; ")); rotulo("Trade-offs assumidos", a.prioridades.trade_offs.join("; "));
      rotulo("Envolvidos antes de decidir", a.prioridades.envolvidos.join(", "));
      secao(3, "Orçamento");
      tabela(["Linha", "Ano anterior", "Proposto", "Variação R$", "Variação %"], a.orcamento.linhas.map((l) => [l.linha, reais(l.ano_anterior), reais(l.proposto),
        `${l.variacao >= 0 ? "+" : ""}${reais(l.variacao)}`, l.variacao_pct === null ? "-" : `${l.variacao_pct}%`]),
        { columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } } });
      rotulo("Total × teto", `${reais(a.orcamento.total)} de ${reais(a.orcamento.teto)} · saldo ${reais(a.orcamento.saldo)}`);
      rotulo("Justificativa dos cortes", a.orcamento.justificativa_cortes.join("; "));
      secao(4, "Resultados");
      rotulo("Meta", a.resultados.meta); rotulo("Responsável", a.resultados.responsavel);
      rotulo("Data de revisão", a.resultados.revisao ? a.resultados.revisao.split("-").reverse().join("/") : ""); rotulo("Indicador de acompanhamento", a.resultados.indicador);
      if (a.resultados.previsao_meta) rotulo("Previsão da meta", `${a.resultados.previsao_meta.previsto} de ${a.resultados.previsao_meta.alvo} (${a.resultados.previsao_meta.pct}%), ${a.resultados.previsao_meta.situacao}`);
      secao(5, "Previsão e riscos (simulação multiagente)");
      if (a.previsao.reacoes.length) tabela(["Stakeholder", "Postura prevista", "Reação"], a.previsao.reacoes.map((r) => [r.nome, POST[r.postura], r.reacao || "-"]), { columnStyles: { 2: { cellWidth: 95 } } });
      if (a.previsao.riscos.length) {
        tabela(["#", "Risco", "Probabilidade", "Impacto"], a.previsao.riscos.map((r, i) => [String(i + 1), r.descricao, NIVEL[r.probabilidade], NIVEL[r.impacto]]), { columnStyles: { 1: { cellWidth: 110 } } });
        mapa(a.previsao.riscos);
      } else par("Riscos: a simulação ainda não terminou para esta tentativa.", { suave: true });
      rotulo("Sinais de alerta", a.previsao.sinais_alerta.join("; ")); rotulo("O que mudaria a previsão", a.previsao.o_que_mudaria.join("; "));
      par(a.previsao.aviso, { suave: true, tam: 8.5 });
      secao(6, "Indicadores");
      tabela(["Indicador", "Antes", "Depois", "Variação"], a.indicadores.map((i) => [i.indicador, String(Math.round(i.antes)), String(Math.round(i.depois)), `${i.variacao >= 0 ? "+" : ""}${i.variacao}`]),
        { columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } } });
      secao(7, "Competências demonstradas");
      rotulo("Certificações", d.certificacoes.map((c) => c.nome).join(", "));
      par("Aprendizados para a próxima reunião:"); a.competencias.aprendizados.forEach((x) => par(`• ${x}`));
    });

    if (d.consolidado.quadro.length) {
    novaPagina();
    titulo("Consolidado do mandato");
    tabela(["Trim.", "Prioridade", "Total / teto", "Meta", "Riscos"], d.consolidado.quadro.map((q) => [String(q.trimestre), q.prioridade, `${reais(q.total)} / ${reais(q.teto)}`, q.meta || "-", String(q.riscos)]));
    const ks = Object.keys(d.consolidado.nomes_indicadores);
    tabela(["Indicador", ...d.consolidado.evolucao.map((e) => (e.trimestre ? `T${e.trimestre}` : "Início"))],
      ks.map((k) => [d.consolidado.nomes_indicadores[k], ...d.consolidado.evolucao.map((e) => String(Math.round(e[k])))]));
    secao("A", "Padrões de decisão"); d.consolidado.padroes.forEach((p) => par(`• ${p}`));
    secao("B", "Tentativas refeitas e o que mudou");
    if (d.consolidado.refeitas.length) d.consolidado.refeitas.forEach((r) => par(`• Trimestre ${r.trimestre}: ${r.tentativas} tentativas — ${r.mudancas.join(" | ")}`));
    else par("Nenhuma tentativa refeita.");
    }
    y += 3; par(d.aviso, { suave: true });

    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); desenharCabecalho(); doc.setFontSize(8); doc.setTextColor(...SUAVE);
      doc.text(pdfTxt(`Associação fictícia · exercício de formação · ${d.perfil}`), M, 290);
      doc.text(`Página ${i} de ${n}`, 210 - M, 290, { align: "right" });
    }
    return doc;
  }

  // ---------------------------------------------------------------- tela
  async function tela(camp) {
    const caixa = el("div", {});
    const chk = el("input", { type: "checkbox", id: "rel-apelido" });
    const render = async () => {
      let d;
      try { d = await carregar(camp, chk.checked); } catch (e) { caixa.replaceChildren(el("div", { class: "erro" }, e.message)); return; }
      if (!d.atas.length) { caixa.replaceChildren(el("p", { class: "suave" }, "As Atas aparecem aqui depois do primeiro trimestre decidido.")); return; }
      const ultima = d.atas.at(-1);
      caixa.replaceChildren(
        el("div", { class: "acoes" },
          el("button", { class: "botao", onclick: () => { try { pdf(d).save("relatorio-de-gestao.pdf"); SOM.tocar("confirmar"); avisoCurto("PDF gerado."); } catch (e) { avisoCurto("Não foi possível gerar o PDF: " + e.message); } } }, icone("download", 18), "Baixar relatório (PDF)"),
          el("button", { class: "botao secundario", onclick: () => { baixar("atas-do-mandato.csv", csv(d), "text/csv;charset=utf-8"); avisoCurto("CSV baixado."); } }, icone("download", 18), "Baixar dados (CSV)"),
          el("button", { class: "botao secundario", onclick: async () => { await navigator.clipboard?.writeText(texto(d)); avisoCurto("Texto copiado."); } }, icone("copy", 18), "Copiar texto")),
        el("p", { class: "rotulo-secao" }, "Consolidado do mandato"),
        el("div", { class: "cartao tabela-rolagem", style: "padding:0" }, el("table", {},
          el("thead", {}, el("tr", {}, el("th", {}, "Trim."), el("th", {}, "Prioridade"), el("th", { class: "num" }, "Total"), el("th", {}, "Meta"))),
          el("tbody", {}, d.consolidado.quadro.map((q) => el("tr", {}, el("td", {}, String(q.trimestre)), el("td", {}, q.prioridade), el("td", { class: "num" }, reais(q.total)), el("td", { class: "pequeno" }, q.meta || "—")))))),
        d.consolidado.padroes.length ? el("div", { class: "cartao" }, el("h3", { style: "margin-top:0" }, "Padrões de decisão"), el("ul", { class: "pequeno" }, d.consolidado.padroes.map((p) => el("li", {}, p)))) : "",
        d.consolidado.refeitas.length ? el("div", { class: "cartao" }, el("h3", { style: "margin-top:0" }, "Tentativas refeitas"),
          el("ul", { class: "pequeno" }, d.consolidado.refeitas.map((r) => el("li", {}, `Trimestre ${r.trimestre}: ${r.tentativas} tentativas — ${r.mudancas.join(" | ")}`)))) : "",
        el("p", { class: "rotulo-secao" }, "Atas Padronizadas"),
        d.atas.map((a) => el("details", { class: "cartao", open: a === ultima },
          el("summary", {}, el("strong", {}, `Trimestre ${a.trimestre}: ${a.titulo}`), a.consolidada ? "" : el("span", { class: "etiqueta alerta", style: "margin-left:.4rem" }, "não consolidada")),
          el("h3", {}, "1. Contexto"), el("p", { class: "pequeno" }, a.contexto.fato_novo), el("ul", { class: "pequeno" }, a.contexto.restricoes.map((r) => el("li", {}, r))),
          el("h3", {}, "2. Prioridades"), el("p", { class: "pequeno" }, `Escolhida: ${a.prioridades.escolhida}. Critérios: ${a.prioridades.criterios.join("; ") || "—"}. Envolvidos: ${a.prioridades.envolvidos.join(", ") || "—"}.`),
          el("h3", {}, "3. Orçamento"), el("div", { class: "tabela-rolagem" }, el("table", {}, el("thead", {}, el("tr", {}, ["Linha", "Ano ant.", "Proposto", "Var."].map((h, i) => el("th", { class: i ? "num" : "" }, h)))),
            el("tbody", {}, a.orcamento.linhas.map((l) => el("tr", {}, el("td", {}, l.linha), el("td", { class: "num" }, reais(l.ano_anterior)), el("td", { class: "num" }, reais(l.proposto)),
              el("td", { class: `num ${l.variacao < 0 ? "desce" : l.variacao > 0 ? "sobe" : ""}` }, `${l.variacao >= 0 ? "+" : "−"}${reais(Math.abs(l.variacao))}`)))))),
          el("p", { class: "pequeno" }, `Total ${reais(a.orcamento.total)} de ${reais(a.orcamento.teto)} · cortes: ${a.orcamento.justificativa_cortes.join("; ") || "—"}`),
          el("h3", {}, "4. Resultados"), el("p", { class: "pequeno" }, `${a.resultados.meta || "Sem meta"} · responsável: ${a.resultados.responsavel || "—"} · revisão: ${a.resultados.revisao ? a.resultados.revisao.split("-").reverse().join("/") : "—"} · indicador: ${a.resultados.indicador || "—"}`),
          el("h3", {}, "5. Previsão e riscos"), a.previsao.riscos.length ? mapaRiscos(a.previsao.riscos) : el("p", { class: "pequeno suave" }, "Simulação ainda em andamento."),
          el("ol", { class: "pequeno" }, a.previsao.riscos.map((r) => el("li", {}, `${r.descricao} (P ${NIVEL[r.probabilidade]}, I ${NIVEL[r.impacto]})`))),
          a.previsao.sinais_alerta.length ? el("p", { class: "pequeno" }, `Sinais de alerta: ${a.previsao.sinais_alerta.join("; ")}`) : "",
          el("p", { class: "aviso-fixo" }, a.previsao.aviso),
          el("h3", {}, "6. Indicadores"), el("p", { class: "pequeno" }, a.indicadores.map((i) => `${i.indicador} ${Math.round(i.antes)}→${Math.round(i.depois)}`).join(" · ")),
          el("h3", {}, "7. Competências"), el("ul", { class: "pequeno" }, a.competencias.aprendizados.map((x) => el("li", {}, x))))));
    };
    chk.addEventListener("change", render);
    await render();
    return el("div", {}, el("label", { class: "opcao" }, chk, el("span", {}, "Incluir meu apelido no relatório")), caixa);
  }

  return { tela, pdf, csv, texto, carregar };
})();
