/* Plano de decisão — Legado: resumo em tópicos, 8 seções fixas por missão e desempenho acadêmico consolidado.
   PDF institucional (jsPDF + autotable, embutidos) na paleta CACB, CSV e texto. Gerado no navegador: funciona offline. */
"use strict";

const RELATORIO = (() => {
  const AZUL = [0, 103, 190], AMARELO = [255, 184, 28], VERDE = [0, 131, 104], TEXTO = [26, 34, 48], SUAVE = [75, 85, 101], PRETO = [26, 34, 48];
  const NIVEL = { alto: "alto", medio: "médio", baixo: "baixo" };
  const reais = (v) => "R$ " + Math.round(Number(v) || 0).toLocaleString("pt-BR");
  const pdfTxt = (s) => String(s ?? "").replace(/[−–—]/g, "-").replace(/→/g, "->").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/×/g, "x");
  const dataBR = (iso) => (iso ? iso.split("-").reverse().join("/") : "-");
  let dados = null;
  let LOGO = null;  // logo em data URL para o cabeçalho do PDF (carregado uma vez; fica em cache offline)
  fetch("/static/marca/legado-64.png").then((r) => r.blob()).then((b) => { const fr = new FileReader(); fr.onload = () => { LOGO = fr.result; }; fr.readAsDataURL(b); }).catch(() => null);

  async function carregar(camp, comApelido) {
    dados = await api(`/api/campanhas/${camp.id}/relatorio?apelido=${comApelido ? 1 : 0}`);
    return dados;
  }

  // ---------------------------------------------------------------- texto
  function texto(d) {
    const L = [d.titulo.toUpperCase(), `${d.selo}`, `${d.perfil} · ${d.associacao}`, `Gerado em ${d.gerado_em}${d.apelido ? ` · ${d.apelido}` : ""}`, ""];
    L.push("RESUMO DAS SUAS DECISÕES");
    for (const r of d.resumo) L.push(`Missão ${r.missao}: ${r.titulo} — ${r.carimbo}`, `  • Priorizou: ${r.priorizou}`, `  • ${r.alocou_cortou}`, `  • ${r.alternativa}`, `  • Meta: ${r.meta}`);
    L.push("");
    for (const m of d.missoes) {
      const s = m.secoes;
      L.push(`MISSÃO ${m.missao}: ${m.titulo}${m.carimbo ? ` — ${m.carimbo}` : ""}${m.consolidada ? "" : " (não consolidada)"}`);
      L.push(`1. ${d.secoes[0]}`, `   Orçamento: ${reais(s.contexto.orcamento_antes)} -> ${reais(s.contexto.orcamento_depois)}; horas da equipe: ${s.contexto.horas_usadas} de ${s.contexto.horas_equipe} h`,
        ...s.contexto.restricoes.map((r) => `   - ${r}`));
      L.push(`2. ${d.secoes[1]}`, `   Escolhidas: ${s.prioridades.escolhidas.join("; ") || "-"}`, `   Adiadas: ${s.prioridades.adiadas.join("; ") || "-"}`, `   Critérios: ${s.prioridades.criterios.join("; ") || "-"}`);
      L.push(`3. ${d.secoes[2]}`, ...s.orcamento.linhas.map((l) => `   ${l.linha}: ano anterior ${reais(l.ano_anterior)}; planejado ${reais(l.planejado)}; executado ${reais(l.executado)}; ${l.horas} h${l.justificativa ? `; corte: ${l.justificativa}` : ""}`),
        `   Total ${reais(s.orcamento.total)} de ${reais(s.orcamento.teto)}; saldo ${reais(s.orcamento.saldo)}`);
      L.push(`4. ${d.secoes[3]}`, ...(s.alternativas.comparadas.length ? s.alternativas.comparadas.map((a) => `   ${a.rotulo}: ${reais(a.total)}, ${a.horas} h; atende ${a.atendidos.join(", ") || "-"}`) : ["   Sem comparação."]),
        s.alternativas.escolhida ? `   Escolhida: ${s.alternativas.escolhida}${s.alternativas.motivo.length ? `, porque ${s.alternativas.motivo.join("; ").toLowerCase()}` : ""}` : "");
      L.push(`5. ${d.secoes[4]}`, s.relatos.relato ? `   ${s.relatos.relato.autor} (${s.relatos.relato.funcao}): "${s.relatos.relato.texto}"` : "   Sem relato fixo.",
        s.relatos.relato ? `   Interpretação: ${s.relatos.relato.interpretacao}; consulta: ${s.relatos.relato.consulta}` : "", ...s.relatos.outros.map((o) => `   - ${o}`));
      L.push(`6. ${d.secoes[5]}`, `   Meta: ${s.resultados.meta || "-"}`, ...s.resultados.indicadores_sugeridos.map((i) => `   Indicador sugerido — ${i.prioridade}: ${i.indicador}`),
        `   Responsável: ${s.resultados.responsavel || "-"} · Revisão: ${dataBR(s.resultados.revisao)}`);
      L.push(`7. ${d.secoes[6]}`, ...s.aprendizados.map((x) => `   - ${x}`));
      L.push(`8. ${d.secoes[7]}`, ...s.simulacao.hipoteses.map((h) => `   Hipótese: ${h.texto}${h.ajustada ? " (ajustada)" : ""}`),
        ...s.simulacao.riscos.map((r, i) => `   Risco ${i + 1}: ${r.descricao} (probabilidade ${NIVEL[r.probabilidade]}, impacto ${NIVEL[r.impacto]})`),
        `   Revisão humana: ${s.simulacao.revisao_humana} · ${s.simulacao.modo}`, `   ${s.simulacao.aviso}`, "");
    }
    if (d.desempenho?.criterios?.length) L.push("DESEMPENHO ACADÊMICO CONSOLIDADO", ...d.desempenho.criterios.map((c) => `   ${c.nome}: ${Object.entries(c.conceitos).map(([k, v]) => `M${k} ${v}`).join(", ")} · média ${c.media}`),
      `   Conceito geral: ${d.desempenho.geral || "-"}`);
    L.push("", d.aviso, `${d.selo} · ${d.slogan}`);
    return L.filter((x) => x !== "").join("\n");
  }

  // ---------------------------------------------------------------- CSV
  function csv(d) {
    const cab = ["missao", "titulo", "carimbo", "consolidada", "linha", "ano_anterior", "planejado", "executado", "variacao_rs", "variacao_pct", "horas",
      "justificativa_corte", "total", "teto", "horas_usadas", "horas_equipe", "alternativa_escolhida", "criterios", "interpretacao_relato", "consulta",
      "meta", "indicadores_sugeridos", "responsavel", "revisao", "hipoteses", "riscos", "revisao_humana", "conceito_geral"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = [cab.join(";")];
    for (const m of d.missoes) {
      const s = m.secoes;
      for (const l of s.orcamento.linhas) linhas.push([m.missao, m.titulo, m.carimbo, m.consolidada ? "sim" : "não", l.linha, l.ano_anterior, l.planejado, l.executado, l.variacao,
        l.variacao_pct ?? "", l.horas, l.justificativa, s.orcamento.total, s.orcamento.teto, s.contexto.horas_usadas, s.contexto.horas_equipe, s.alternativas.escolhida || "",
        s.prioridades.criterios.join(" | "), s.relatos.relato?.interpretacao || "", s.relatos.relato?.consulta || "", s.resultados.meta,
        s.resultados.indicadores_sugeridos.map((i) => `${i.prioridade}: ${i.indicador}`).join(" | "), s.resultados.responsavel, s.resultados.revisao || "",
        s.simulacao.hipoteses.map((h) => h.texto).join(" | "), s.simulacao.riscos.map((r) => `${r.descricao} (P ${r.probabilidade}/I ${r.impacto})`).join(" | "),
        s.simulacao.revisao_humana, m.desempenho?.geral || ""].map(esc).join(";"));
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
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      let xm = M;
      if (LOGO) { doc.setFillColor(255, 255, 255); doc.roundedRect(M, 2.2, 9.6, 9.6, 1.5, 1.5, "F"); doc.addImage(LOGO, "PNG", M + 0.8, 3, 8, 8); xm = M + 12.5; }
      doc.text("LEGADO", xm, 9); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      doc.text(pdfTxt(`${d.titulo.replace("— Legado", "").trim()} · ${d.gerado_em}`), 210 - M, 9, { align: "right" });
    };
    const cabecalho = () => { y = 24; };
    const novaPagina = () => { doc.addPage(); cabecalho(); };
    const espaco = (h) => { if (y + h > 274) novaPagina(); };
    const titulo = (t, tam = 13) => { espaco(12); doc.setTextColor(...AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(tam); doc.text(pdfTxt(t), M, y); y += tam * 0.5 + 2; };
    const secao = (n, t) => { espaco(10); doc.setDrawColor(...PRETO); doc.setLineWidth(0.6); doc.line(M, y, M + W, y); y += 5;
      doc.setTextColor(...TEXTO); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.text(pdfTxt(`${n}. ${t}`), M, y); y += 5.5; };
    const par = (t, { suave = false, tam = 9.5, negrito = false } = {}) => {
      doc.setFont("helvetica", negrito ? "bold" : "normal"); doc.setFontSize(tam); doc.setTextColor(...(suave ? SUAVE : TEXTO));
      for (const l of doc.splitTextToSize(pdfTxt(t), W)) { espaco(5); doc.text(l, M, y); y += 4.6; }
    };
    const rotulo = (r, v) => par(`${r}: ${v || "-"}`);
    const tabela = (cab, linhas, opts = {}) => {
      if (!linhas.length) return;
      doc.autoTable({ startY: y, head: [cab.map(pdfTxt)], body: linhas.map((l) => l.map(pdfTxt)), margin: { left: M, right: M, top: 24, bottom: 22 },
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.6, textColor: TEXTO, lineColor: PRETO, lineWidth: 0.1 },
        headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold" }, alternateRowStyles: { fillColor: [235, 243, 250] }, ...opts });
      y = doc.lastAutoTable.finalY + 5;
    };
    const carimbo = (txt) => {
      if (!txt) return;
      const cor = txt === "SUCESSO" ? [0, 111, 88] : txt === "FRACASSO" ? [180, 35, 24] : [115, 83, 13];
      espaco(14); doc.setDrawColor(...cor); doc.setTextColor(...cor); doc.setLineWidth(0.9); doc.setFont("courier", "bold"); doc.setFontSize(13);
      const w = doc.getTextWidth(txt) + 8; doc.rect(M, y - 6, w, 9); doc.text(txt, M + 4, y); y += 8;
    };
    const mapa = (riscos) => {
      espaco(42);
      const x0 = M + 22, cel = 22, alt = 9, niv = ["alto", "medio", "baixo"], imp = ["baixo", "medio", "alto"];
      const cor = (ip, ii) => { const s = Math.min(3, Math.max(1, Math.round(((2 - ip) + ii) / 2) + 1)); return s === 1 ? [230, 243, 240] : s === 2 ? [255, 244, 221] : [253, 236, 234]; };
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...SUAVE);
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

    // capa e resumo
    cabecalho();
    doc.setTextColor(...TEXTO); doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text(pdfTxt(d.titulo), M, y + 4); y += 12;
    doc.setFillColor(...AMARELO); doc.setDrawColor(...PRETO); doc.setLineWidth(0.5);
    doc.setFont("courier", "bold"); doc.setFontSize(9); const sw = doc.getTextWidth(pdfTxt(d.selo.toUpperCase())) + 6;
    doc.rect(M, y - 4.5, sw, 6.5, "FD"); doc.setTextColor(...PRETO); doc.text(pdfTxt(d.selo.toUpperCase()), M + 3, y); y += 8;
    if (d.associacao) par(d.associacao);
    par(`Perfil fictício: ${d.perfil}${d.apelido ? ` · ${d.apelido}` : ""}`, { suave: true });
    par(d.descricao, { suave: true, tam: 9 }); y += 2;
    if (d.resumo?.length) {
      titulo("Resumo das suas decisões", 12);
      d.resumo.forEach((r) => {
        par(`Missão ${r.missao}: ${r.titulo} — ${r.carimbo}`, { negrito: true });
        [`Priorizou: ${r.priorizou}`, r.alocou_cortou, r.alternativa, `Meta: ${r.meta}`].forEach((x) => par(`  • ${x}`));
        y += 1;
      });
    }

    d.missoes.forEach((m) => {
      const s = m.secoes;
      novaPagina();
      titulo(`${m.rotulo || `Missão ${m.missao}`} — ${m.titulo}`);
      par(`${dataBR(m.data)}${m.consolidada === false ? " · tentativa não consolidada" : ""} · ${s.simulacao.modo}`, { suave: true });
      carimbo(m.carimbo); if (m.motivo) par(m.motivo, { suave: true });
      secao(1, d.secoes[0]);
      rotulo("Orçamento", s.contexto.orcamento_antes !== s.contexto.orcamento_depois ? `${reais(s.contexto.orcamento_antes)} -> ${reais(s.contexto.orcamento_depois)}` : reais(s.contexto.orcamento_depois));
      if (s.contexto.horas_equipe) rotulo("Horas da equipe", `${s.contexto.horas_usadas} de ${s.contexto.horas_equipe} h`);
      if (s.contexto.fato_novo) rotulo("Contexto", s.contexto.fato_novo);
      s.contexto.restricoes.forEach((r) => par(`• ${r}`));
      secao(2, d.secoes[1]);
      rotulo("Escolhidas", s.prioridades.escolhidas.join("; ")); rotulo("Adiadas", s.prioridades.adiadas.join("; ")); rotulo("Critérios", s.prioridades.criterios.join("; "));
      secao(3, d.secoes[2]);
      tabela(["Linha", "Ano anterior", "Planejado", "Executado", "Horas", "Justificativa do corte"], s.orcamento.linhas.map((l) => [l.linha, reais(l.ano_anterior), reais(l.planejado),
        reais(l.executado), l.horas === null || l.horas === undefined ? "-" : `${l.horas} h`, l.justificativa || "-"]), { columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { cellWidth: 52 } } });
      rotulo("Total × teto", `${reais(s.orcamento.total)} de ${reais(s.orcamento.teto)} · saldo ${reais(s.orcamento.saldo)}`);
      secao(4, d.secoes[3]);
      if (s.alternativas.comparadas.length) {
        tabela(["Alternativa", "Custo", "Horas", "Quem é atendido"], s.alternativas.comparadas.map((a) => [a.rotulo + (a.rotulo === s.alternativas.escolhida ? " (escolhida)" : ""), reais(a.total), `${a.horas} h`, a.atendidos.join("; ")]),
          { columnStyles: { 3: { cellWidth: 95 } } });
        rotulo("Por que", s.alternativas.motivo.join("; "));
      } else par("Nenhuma alternativa salva para comparação.", { suave: true });
      secao(5, d.secoes[4]);
      if (s.relatos.relato) {
        par(`${s.relatos.relato.autor} (${s.relatos.relato.funcao}): "${s.relatos.relato.texto}"`);
        rotulo("Interpretação feita", s.relatos.relato.interpretacao); rotulo("Consulta aos associados", s.relatos.relato.consulta);
      }
      s.relatos.outros.forEach((o) => par(`• ${o}`, { suave: true, tam: 8.5 }));
      if (!s.relatos.relato && !s.relatos.outros.length) par("Nenhum relato considerado.", { suave: true });
      secao(6, d.secoes[5]);
      rotulo("Meta", s.resultados.meta);
      tabela(["Prioridade", "Indicador sugerido"], s.resultados.indicadores_sugeridos.map((i) => [i.prioridade, i.indicador]));
      rotulo("Responsável", s.resultados.responsavel); rotulo("Data de revisão", dataBR(s.resultados.revisao));
      if (s.resultados.previsao_meta) rotulo("Previsão da meta", `${s.resultados.previsao_meta.previsto} de ${s.resultados.previsao_meta.alvo} (${s.resultados.previsao_meta.pct}%), ${s.resultados.previsao_meta.situacao}`);
      secao(7, d.secoes[6]);
      s.aprendizados.forEach((x) => par(`• ${x}`));
      secao(8, d.secoes[7]);
      if (s.simulacao.hipoteses.length) { par("Hipóteses usadas:", { negrito: true }); s.simulacao.hipoteses.forEach((h) => par(`• ${h.texto}${h.ajustada ? " (ajustada pelo jogador)" : ""}`)); }
      if ((s.simulacao.reacoes || []).length) tabela(["Stakeholder", "Reação prevista"], s.simulacao.reacoes.slice(0, 8).map((r) => [r.nome, r.reacao || "-"]), { columnStyles: { 1: { cellWidth: 110 } } });
      if (s.simulacao.riscos.length) {
        tabela(["#", "Risco apontado pelos agentes", "Probabilidade", "Impacto"], s.simulacao.riscos.map((r, i) => [String(i + 1), r.descricao, NIVEL[r.probabilidade], NIVEL[r.impacto]]), { columnStyles: { 1: { cellWidth: 110 } } });
        mapa(s.simulacao.riscos);
      } else par("Riscos: a simulação ainda não terminou para esta tentativa.", { suave: true });
      if (s.simulacao.sinais_alerta.length) rotulo("Sinais de alerta", s.simulacao.sinais_alerta.join("; "));
      rotulo("Revisão humana", s.simulacao.revisao_humana);
      par(s.simulacao.aviso, { suave: true, tam: 8.5 });
    });

    if (d.desempenho?.criterios?.length) {
      novaPagina();
      titulo("Desempenho acadêmico consolidado");
      const ms = d.missoes.map((m) => String(m.missao));
      tabela(["Critério", ...ms.map((n) => `Missão ${n}`), "Média"], d.desempenho.criterios.map((c) => [c.nome, ...ms.map((n) => c.conceitos[n] || "-"), c.media]));
      rotulo("Conceito geral", d.desempenho.geral);
      par("A = 4, B = 3, C = 2, D = 1. Critérios: expectativa × simulação, meta × resultado, dentro dos limites, justificativa completa e interpretação do relato.", { suave: true, tam: 8.5 });
      if (d.certificacoes?.length) { y += 2; rotulo("Certificações de competência", d.certificacoes.map((c) => c.nome).join(", ")); }
    }
    y += 3; par(d.aviso, { suave: true });

    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); desenharCabecalho();
      doc.setDrawColor(...PRETO); doc.setLineWidth(0.6); doc.line(M, 280, 210 - M, 280);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...TEXTO);
      doc.text(pdfTxt(d.selo.toUpperCase()), M, 285);
      doc.setFont("helvetica", "normal"); doc.setTextColor(...SUAVE);
      doc.text(pdfTxt(d.slogan), M, 289.5);
      doc.text(`Página ${i} de ${n}`, 210 - M, 285, { align: "right" });
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
      if (!d.missoes.length) { caixa.replaceChildren(el("p", { class: "suave" }, "O Plano aparece aqui depois da primeira missão decidida.")); return; }
      const ultima = d.missoes.at(-1);
      caixa.replaceChildren(
        el("div", { class: "acoes" },
          el("button", { class: "botao principal", onclick: () => { try { pdf(d).save("plano-de-decisao-legado.pdf"); SOM.tocar("confirmar"); avisoCurto("PDF gerado."); } catch (e) { avisoCurto("Não foi possível gerar o PDF: " + e.message); } } }, icone("download", 18), "Baixar plano (PDF)"),
          el("button", { class: "botao secundario", onclick: () => { baixar("plano-de-decisao.csv", csv(d), "text/csv;charset=utf-8"); avisoCurto("CSV baixado."); } }, icone("download", 18), "Baixar dados (CSV)"),
          el("button", { class: "botao secundario", onclick: async () => { await navigator.clipboard?.writeText(texto(d)); avisoCurto("Texto copiado."); } }, icone("copy", 18), "Copiar texto")),
        el("div", { class: "cartao cartao-principal" },
          el("span", { class: "selo-ficticio" }, d.selo),
          el("h2", {}, "Resumo das suas decisões"),
          d.resumo.map((r) => el("div", { class: "resumo-missao" }, el("div", { class: "linha entre" }, el("strong", {}, `Missão ${r.missao}: ${r.titulo}`), el("span", { class: "carimbo-mini" }, r.carimbo)),
            el("ul", { class: "pequeno" }, el("li", {}, `Priorizou: ${r.priorizou}`), el("li", {}, r.alocou_cortou), el("li", {}, r.alternativa), el("li", {}, `Meta: ${r.meta}`))))),
        d.missoes.map((m) => {
          const s = m.secoes;
          return el("details", { class: "cartao", open: m === ultima },
            el("summary", {}, el("strong", {}, `Missão ${m.missao}: ${m.titulo}`), m.consolidada ? "" : el("span", { class: "etiqueta alerta", style: "margin-left:.4rem" }, "não consolidada")),
            el("h3", {}, `1. ${d.secoes[0]}`), el("p", { class: "pequeno" }, `Orçamento ${reais(s.contexto.orcamento_antes)} → ${reais(s.contexto.orcamento_depois)} · ${s.contexto.horas_usadas} de ${s.contexto.horas_equipe} h da equipe`),
            el("h3", {}, `2. ${d.secoes[1]}`), el("p", { class: "pequeno" }, `Escolhidas: ${s.prioridades.escolhidas.join("; ") || "—"}. Adiadas: ${s.prioridades.adiadas.join("; ") || "—"}. Critérios: ${s.prioridades.criterios.join("; ") || "—"}.`),
            el("h3", {}, `3. ${d.secoes[2]}`), el("div", { class: "tabela-rolagem" }, el("table", {}, el("thead", {}, el("tr", {}, ["Linha", "Ano ant.", "Planejado", "Executado", "Horas", "Justificativa"].map((h, i) => el("th", { class: i && i < 5 ? "num" : "" }, h)))),
              el("tbody", {}, s.orcamento.linhas.map((l) => el("tr", {}, el("td", {}, l.linha), el("td", { class: "num" }, reais(l.ano_anterior)), el("td", { class: "num" }, reais(l.planejado)),
                el("td", { class: "num" }, reais(l.executado)), el("td", { class: "num" }, `${l.horas} h`), el("td", { class: "pequeno" }, l.justificativa || "—")))))),
            el("h3", {}, `4. ${d.secoes[3]}`), el("p", { class: "pequeno" }, s.alternativas.comparadas.length ? `${s.alternativas.comparadas.map((a) => `${a.rotulo}: ${reais(a.total)}, ${a.horas} h`).join(" · ")}. Escolhida: ${s.alternativas.escolhida || "—"}${s.alternativas.motivo.length ? `, porque ${s.alternativas.motivo.join("; ").toLowerCase()}` : ""}.` : "Sem comparação."),
            el("h3", {}, `5. ${d.secoes[4]}`), el("p", { class: "pequeno" }, s.relatos.relato ? `${s.relatos.relato.autor} (${s.relatos.relato.funcao}). Interpretação: ${s.relatos.relato.interpretacao}. Consulta: ${s.relatos.relato.consulta}.` : "Sem relato fixo."),
            el("h3", {}, `6. ${d.secoes[5]}`), el("p", { class: "pequeno" }, `${s.resultados.meta || "Sem meta"} · responsável: ${s.resultados.responsavel || "—"} · revisão: ${dataBR(s.resultados.revisao)}`),
            el("ul", { class: "pequeno" }, s.resultados.indicadores_sugeridos.map((i) => el("li", {}, `${i.prioridade}: ${i.indicador}`))),
            el("h3", {}, `7. ${d.secoes[6]}`), el("ul", { class: "pequeno" }, s.aprendizados.map((x) => el("li", {}, x))),
            el("h3", {}, `8. ${d.secoes[7]}`), el("ul", { class: "pequeno" }, s.simulacao.hipoteses.map((h) => el("li", {}, h.texto + (h.ajustada ? " (ajustada)" : "")))),
            s.simulacao.riscos.length ? mapaRiscos(s.simulacao.riscos) : el("p", { class: "pequeno suave" }, "Simulação ainda em andamento."),
            el("p", { class: "pequeno" }, `Revisão humana: ${s.simulacao.revisao_humana} · ${s.simulacao.modo}`),
            el("p", { class: "aviso-fixo" }, s.simulacao.aviso));
        }),
        d.desempenho?.criterios?.length ? el("div", { class: "cartao" }, el("h3", { style: "margin-top:0" }, "Desempenho acadêmico consolidado"),
          el("div", { class: "tabela-rolagem" }, el("table", {}, el("thead", {}, el("tr", {}, el("th", {}, "Critério"), d.missoes.map((m) => el("th", {}, `M${m.missao}`)), el("th", {}, "Média"))),
            el("tbody", {}, d.desempenho.criterios.map((c) => el("tr", {}, el("td", {}, c.nome), d.missoes.map((m) => el("td", {}, c.conceitos[String(m.missao)] || "—")), el("td", {}, el("strong", {}, c.media))))))),
          el("p", {}, "Conceito geral: ", el("strong", {}, d.desempenho.geral))) : "",
        el("p", { class: "pequeno suave", style: "text-align:center" }, `${d.selo} · ${d.slogan}`));
    };
    chk.addEventListener("change", render);
    await render();
    return el("div", {}, el("label", { class: "opcao" }, chk, el("span", {}, "Incluir meu apelido no plano")), caixa);
  }

  return { tela, pdf, csv, texto, carregar };
})();
