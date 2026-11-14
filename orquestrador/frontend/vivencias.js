/* Banco de Vivências da Rede: entrada guiada com mascaramento, consentimento LGPD e código de exclusão;
   curadoria, personas sintéticas e geração de cenários no painel do facilitador. */
"use strict";

const viv = { cfg: null, perfil: {}, tipo: "", tema: "", respostas: {}, mascaradas: null, subst: {} };
const NOMES_PERFIL = { papel: "Seu papel", segmento: "Segmento", porte: "Porte do negócio ou da entidade", regiao: "Região", tempo: "Tempo de atuação" };
const NOMES_SUBST = { pessoa: "nome(s) de pessoa", empresa: "empresa(s) ou entidade(s)", local: "local(is)", cpf: "CPF", cnpj: "CNPJ", telefone: "telefone(s)",
  email: "e-mail(s)", cep: "CEP", placa: "placa(s)", data: "data(s) exata(s)", valor: "valor(es) em faixa", endereco: "endereço(s)", url: "link(s)" };

async function telaVivencias() {
  topo("Banco de Vivências"); abas("vivencias");
  if (!viv.cfg) viv.cfg = await api("/api/vivencias/config");
  const pub = await api("/api/vivencias/publicas").catch(() => ({ vivencias: [] }));
  const codigo = el("input", { type: "text", id: "cod-exc", maxlength: 40, placeholder: "Ex.: 1A2B-3C4D-5E6F" });
  tela(
    el("div", { class: "cartao cartao-destaque" }, el("h2", { style: "margin-top:0" }, "Compartilhe uma vivência"),
      el("p", { class: "suave" }, "Relatos de associados, voluntários, lideranças, gestores e parceiros viram situações-problema e perfis sintéticos para formar novas lideranças."),
      el("ul", { class: "regras" },
        el("li", {}, icone("lock", 18), el("span", {}, "Não pedimos nome, CPF/CNPJ, contato, nome da entidade nem cidade exata.")),
        el("li", {}, icone("shield-check", 18), el("span", {}, "Antes de salvar, o texto é mascarado e você confere. Guardamos só a versão mascarada, nunca o original nem o áudio.")),
        el("li", {}, icone("eye", 18), el("span", {}, "Uma curadoria revisa antes de qualquer uso."))),
      el("div", { class: "acoes" }, el("button", { class: "botao bloco", onclick: () => { Object.assign(viv, { perfil: {}, tipo: "", tema: "", respostas: {}, mascaradas: null, subst: {} }); passoViv(1); } },
        icone("plus", 18), "Registrar uma vivência"))),
    el("p", { class: "rotulo-secao" }, `O que a rede relata (${pub.vivencias.length})`),
    pub.vivencias.map((v) => el("div", { class: "relato" }, el("div", {}, v.trecho), el("div", { class: "quem" }, `${v.tema} · ${v.perfil}${v.ficticia ? " · exemplo fictício" : ""}`))),
    el("details", { class: "cartao" }, el("summary", {}, el("strong", {}, "Excluir uma vivência que enviei")),
      el("label", { for: "cod-exc" }, "Código de exclusão"), codigo,
      el("div", { class: "acoes" }, el("button", { class: "botao secundario", onclick: async () => {
        try { await api("/api/vivencias/excluir", { method: "POST", body: { codigo: codigo.value } }); avisoCurto("Vivência excluída."); SOM.tocar("confirmar"); codigo.value = ""; }
        catch (e) { mostrarErro(main(), e); } } }, "Excluir"))));
}

function passoViv(n) {
  const k = viv.cfg;
  const tipo = k.tipos[viv.tipo];
  const perguntas = tipo ? tipo.perguntas : [];
  const total = 2 + (perguntas.length || 3) + 2;
  topo("Registrar vivência", `Passo ${n} de ${total}`, () => (n > 1 ? passoViv(n - 1) : telaVivencias())); abas(null);
  const avancar = (ok, rotulo = "Continuar") => el("div", { class: "acoes" }, el("button", { class: "botao bloco", onclick: () => {
    if (!ok()) return avisoCurto("Complete este passo para continuar."); SOM.tocar("confirmar"); passoViv(n + 1); } }, rotulo, icone("chevron-right", 18)));
  if (n === 1) {
    const apelido = el("input", { type: "text", id: "viv-apelido", maxlength: 30, value: localStorage.getItem("lej_viv_apelido") || "" });
    apelido.addEventListener("input", () => localStorage.setItem("lej_viv_apelido", apelido.value));
    return tela(el("div", { class: "cartao" }, el("h2", { style: "margin-top:0" }, "Seu perfil (em faixas amplas)"),
      Object.entries(k.perfil).map(([campo, opcoes]) => {
        const sel = viv.perfil[campo] ? [viv.perfil[campo]] : [];
        return el("div", {}, el("p", { class: "rotulo-secao" }, NOMES_PERFIL[campo]), chips(opcoes, sel, { multiplo: false, aoMudar: () => { viv.perfil[campo] = sel[0]; } }));
      }),
      el("label", { for: "viv-apelido" }, "Apelido (opcional, fica só neste aparelho)"), apelido),
      avancar(() => Object.keys(k.perfil).every((c) => viv.perfil[c])));
  }
  if (n === 2) {
    return tela(el("div", { class: "cartao" }, el("h2", { style: "margin-top:0" }, "O que você quer registrar?"),
      Object.entries(k.tipos).map(([id, t]) => el("label", { class: "opcao" }, el("input", { type: "radio", name: "tipo", value: id, checked: viv.tipo === id, onchange: () => { viv.tipo = id; } }),
        el("span", {}, el("strong", {}, t.nome), el("br"), el("span", { class: "pequeno suave" }, t.perguntas.map((q) => q.texto).join(" · "))))),
      el("p", { class: "rotulo-secao" }, "Tema"),
      Object.entries(k.temas).map(([id, nome]) => el("label", { class: "opcao" }, el("input", { type: "radio", name: "tema", value: id, checked: viv.tema === id, onchange: () => { viv.tema = id; } }), el("span", {}, nome)))),
      avancar(() => viv.tipo && viv.tema));
  }
  const idxPerg = n - 3;
  if (idxPerg < perguntas.length) {
    const q = perguntas[idxPerg];
    const area = el("textarea", { id: `viv-${q.id}`, rows: 6, maxlength: 2000 });
    area.value = viv.respostas[q.id] || "";
    area.addEventListener("input", () => { viv.respostas[q.id] = area.value; viv.mascaradas = null; });
    return tela(el("div", { class: "cartao" }, el("p", { class: "rotulo-secao", style: "margin-top:0" }, tipo.nome),
      el("h2", {}, q.texto), el("p", { class: "pequeno suave" }, "Fale ou escreva. Evite nomes e detalhes que identifiquem pessoas, empresas ou a cidade; o sistema também mascara automaticamente."),
      botaoVoz(area), el("label", { for: `viv-${q.id}` }, "Resposta"), area, avisoVoz()),
      el("div", { class: "acoes" }, el("button", { class: "botao secundario", onclick: () => passoViv(n + 1) }, "Pular"),
        el("button", { class: "botao", onclick: () => { SOM.tocar("confirmar"); passoViv(n + 1); } }, "Continuar", icone("chevron-right", 18))));
  }
  if (idxPerg === perguntas.length) return conferirViv(n, perguntas);
  return consentirViv(perguntas);
}

async function conferirViv(n, perguntas) {
  const preenchidas = Object.fromEntries(perguntas.filter((q) => (viv.respostas[q.id] || "").trim()).map((q) => [q.id, viv.respostas[q.id]]));
  if (!Object.keys(preenchidas).length) { avisoCurto("Responda pelo menos uma pergunta."); return passoViv(3); }
  if (!viv.mascaradas) {
    const r = await api("/api/vivencias/mascarar", { method: "POST", body: { respostas: preenchidas } });
    viv.mascaradas = r.respostas; viv.subst = r.substituicoes;
  }
  const resumo = Object.entries(viv.subst).map(([t, q]) => `${q} ${NOMES_SUBST[t] || t}`).join(", ");
  tela(el("div", { class: "cartao" }, el("h2", { style: "margin-top:0" }, "Confira a versão mascarada"),
    el("div", { class: resumo ? "info" : "aviso" }, icone("shield-check", 18), el("span", {}, resumo ? `Trocamos: ${resumo}.` : "Não encontramos dados pessoais. Confira mesmo assim.")),
    el("p", { class: "pequeno suave" }, "Só este texto será guardado. Você pode editar para tirar qualquer detalhe que ainda identifique alguém."),
    perguntas.filter((q) => viv.mascaradas[q.id] !== undefined).map((q) => {
      const a = el("textarea", { id: `m-${q.id}`, rows: 4 });
      a.value = viv.mascaradas[q.id];
      a.addEventListener("input", () => { viv.mascaradas[q.id] = a.value; });
      return el("div", {}, el("label", { for: `m-${q.id}` }, q.texto), a);
    })),
    el("div", { class: "acoes" }, el("button", { class: "botao bloco", onclick: () => { SOM.tocar("confirmar"); passoViv(n + 1); } }, "Está correto", icone("chevron-right", 18))));
}

function consentirViv() {
  const c = viv.cfg.consentimento;
  const marcas = { finalidade: false, retencao: false, compartilhamento: false };
  const caixa = (id, texto) => el("label", { class: "opcao" }, el("input", { type: "checkbox", onchange: (ev) => { marcas[id] = ev.target.checked; } }), el("span", { class: "pequeno" }, texto));
  const enviar = el("button", { class: "botao bloco" }, icone("file-check", 18), "Enviar vivência mascarada");
  const quadro = el("div", { class: "cartao" }, el("h2", { style: "margin-top:0" }, "Consentimento (LGPD)"),
    caixa("finalidade", `Concordo com a finalidade: ${c.finalidade}`),
    caixa("retencao", `A versão mascarada fica guardada por até ${c.retencao_meses} meses. ${c.base_legal}`),
    caixa("compartilhamento", c.compartilhamento),
    el("p", { class: "pequeno suave" }, c.direitos), enviar);
  enviar.addEventListener("click", async () => {
    try {
      const r = await api("/api/vivencias", { method: "POST", body: { perfil: viv.perfil, tipo: viv.tipo, tema: viv.tema, respostas: viv.mascaradas, consentimento: marcas } });
      SOM.tocar("fechado");
      topo("Vivência enviada"); abas("vivencias");
      tela(el("div", { class: "cartao cartao-destaque" }, el("h2", { style: "margin-top:0" }, "Obrigado pela contribuição"),
        el("p", {}, "Ela fica em revisão até a curadoria aprovar."),
        r.risco.nivel !== "baixo" ? el("div", { class: "aviso" }, icone("triangle-alert", 18), el("span", {}, `A curadoria vai olhar com atenção: ${r.risco.motivos.join("; ")}.`)) : "",
        el("p", { class: "rotulo-secao" }, "Seu código de exclusão"),
        el("p", { style: "font-size:1.6rem;font-weight:700;letter-spacing:.08em" }, r.codigo_exclusao),
        el("p", { class: "pequeno suave" }, "Anote ou copie. Com ele você pede a remoção a qualquer momento, sem se identificar. Não conseguimos recuperá-lo."),
        el("div", { class: "acoes" }, el("button", { class: "botao secundario", onclick: async () => { await navigator.clipboard?.writeText(r.codigo_exclusao); avisoCurto("Código copiado."); } }, icone("copy", 18), "Copiar código"),
          el("button", { class: "botao", onclick: telaVivencias }, "Concluir"))));
      verificarSelos();
    } catch (e) { mostrarErro(quadro, e); }
  });
  tela(quadro);
}

async function secoesFacilitadorExtras(f, recarregar) {
  const d = await f("/api/facilitador/vivencias");
  const rot = { em_revisao: "em revisão", aprovada: "aprovada", rejeitada: "rejeitada" };
  return [
    el("p", { class: "rotulo-secao" }, "Banco de Vivências: curadoria"),
    el("div", { class: "acoes" },
      el("button", { class: "botao secundario", onclick: async (ev) => { ev.currentTarget.disabled = true; try { const r = await f("/api/facilitador/personas/gerar", { method: "POST" });
        avisoCurto(`${r.criadas.length} persona(s) sintética(s) criada(s); mínimo de ${r.minimo} vivências por grupo.`); } catch (e) { avisoCurto(e.message); } recarregar(); } }, icone("users", 18), "Gerar personas sintéticas"),
      el("button", { class: "botao secundario", onclick: async (ev) => { ev.currentTarget.disabled = true; try { const r = await f("/api/facilitador/cenarios/gerar-de-vivencias", { method: "POST" });
        avisoCurto(r.erro || `Cenário "${r.titulo}" gerado de ${r.vivencias_base} vivências; aguarda aprovação.`); } catch (e) { avisoCurto(e.message); } recarregar(); } }, icone("file-text", 18), "Gerar cenário a partir de vivências")),
    d.vivencias.map((v) => el("div", { class: "cartao" },
      el("div", { class: "linha entre" }, el("strong", { class: "pequeno" }, `${v.perfil_texto} · ${v.tipo}`),
        el("span", {}, el("span", { class: `etiqueta ${v.status === "aprovada" ? "ok" : v.status === "rejeitada" ? "neutra" : "alerta"}` }, rot[v.status] || v.status), " ",
          v.ficticia ? el("span", { class: "etiqueta neutra" }, "fictícia") : "",
          el("span", { class: `etiqueta ${v.risco.nivel === "alto" ? "erro" : v.risco.nivel === "medio" ? "alerta" : "ok"}` }, `risco ${v.risco.nivel}`))),
      el("p", { class: "pequeno" }, Object.values(v.respostas).filter(Boolean).join(" · ")),
      v.risco.motivos.length ? el("p", { class: "pequeno suave" }, `Risco: ${v.risco.motivos.join("; ")}`) : "",
      v.status !== "aprovada" ? el("div", { class: "acoes" },
        el("button", { class: "botao", disabled: v.risco.nivel === "alto", onclick: async () => { try { await f(`/api/facilitador/vivencias/${v.id}/status`, { method: "POST", body: { status: "aprovada" } }); recarregar(); } catch (e) { avisoCurto(e.message); } } },
          v.risco.nivel === "alto" ? "Bloqueada (risco alto)" : "Aprovar"),
        el("button", { class: "botao secundario", onclick: async () => { await f(`/api/facilitador/vivencias/${v.id}/status`, { method: "POST", body: { status: "rejeitada" } }); recarregar(); } }, "Rejeitar")) : "")),
    d.personas.length ? [el("p", { class: "rotulo-secao" }, "Personas sintéticas"),
      d.personas.map((p) => el("div", { class: "cartao pequeno" }, el("strong", {}, `${p.nome} — ${p.papel}`), el("p", {}, p.persona), el("p", { class: "suave" }, `Composta de ${p.fontes} vivências; nome fictício.`)))] : "",
    d.bloqueios.length ? [el("p", { class: "rotulo-secao" }, "Envios bloqueados por dados pessoais"),
      el("ul", { class: "pequeno" }, d.bloqueios.map((b) => el("li", {}, `${b.criado_em.slice(0, 16).replace("T", " ")} · ${b.destino} · padrões: ${b.tipos}`)))] : "",
  ];
}
