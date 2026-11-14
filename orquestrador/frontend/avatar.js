/* Avatares ilustrados próprios (SVG gerado no navegador). Licença do projeto (AGPL-3.0); sem rostos reais.
   Pessoas: rosto com tom de pele, cabelo, idade (grisalho a partir de 60) e 4 expressões ligadas à postura.
   Instituições (sem gênero definido): círculo com o ícone do papel e um "humor" em emoji.
   Nenhum texto do usuário entra no SVG: só números e cores calculados aqui. */
"use strict";

const AVATAR = (() => {
  const PELES = ["#f6d7c3", "#e9b996", "#c98e66", "#a0673f", "#6e4527"];
  const CABELOS = ["#2b1d14", "#4a3020", "#7a4a26", "#b07a3c", "#1c1c1c"];
  const FUNDOS = { associado: "#dbeafe", diretoria: "#ede9fe", conselho: "#fce7f3", funcionarios: "#dcfce7",
    poder_publico: "#fef3c7", imprensa: "#e0f2fe", sindicato: "#fee2e2", consumidores: "#f3e8ff",
    entidade_concorrente: "#e5e7eb", federacao: "#fef9c3", parceiro: "#ccfbf1", conselheiro: "#fde68a" };
  const ICONES = { associado: "🏪", diretoria: "💼", conselho: "⚖️", funcionarios: "🗂️", poder_publico: "🏛️",
    imprensa: "📰", sindicato: "✊", consumidores: "👥", entidade_concorrente: "🏢", federacao: "🏛️",
    parceiro: "🤝", conselheiro: "🦉" };
  const HUMOR = { favoravel: "🙂", neutra: "😐", desconfiada: "🤨", insatisfeita: "😠" };
  const NOME_EXPR = { favoravel: "favorável", neutra: "neutra", desconfiada: "desconfiada", insatisfeita: "insatisfeita" };

  function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return Math.abs(h); }

  function expressaoDePostura(p) {
    const n = Number(p);
    return n >= 1 ? "favoravel" : n === 0 ? "neutra" : n === -1 ? "desconfiada" : "insatisfeita";
  }

  function boca(expr) {
    switch (expr) {
      case "favoravel": return '<path d="M38 66 Q50 76 62 66" stroke="#5a2d20" stroke-width="3" fill="none" stroke-linecap="round"/>';
      case "desconfiada": return '<path d="M40 69 Q52 66 61 71" stroke="#5a2d20" stroke-width="3" fill="none" stroke-linecap="round"/>';
      case "insatisfeita": return '<path d="M38 72 Q50 63 62 72" stroke="#5a2d20" stroke-width="3" fill="none" stroke-linecap="round"/>';
      default: return '<line x1="40" y1="69" x2="60" y2="69" stroke="#5a2d20" stroke-width="3" stroke-linecap="round"/>';
    }
  }

  function sobrancelhas(expr, cor) {
    const e = `stroke="${cor}" stroke-width="3" stroke-linecap="round"`;
    switch (expr) {
      case "favoravel": return `<path d="M33 41 Q38 37 43 40" ${e} fill="none"/><path d="M57 40 Q62 37 67 41" ${e} fill="none"/>`;
      case "desconfiada": return `<line x1="33" y1="41" x2="43" y2="42" ${e}/><line x1="57" y1="38" x2="67" y2="35" ${e}/>`;
      case "insatisfeita": return `<line x1="33" y1="38" x2="44" y2="43" ${e}/><line x1="56" y1="43" x2="67" y2="38" ${e}/>`;
      default: return `<line x1="33" y1="40" x2="43" y2="40" ${e}/><line x1="57" y1="40" x2="67" y2="40" ${e}/>`;
    }
  }

  function cabelo(genero, idade, h, cor) {
    const estilo = h % 3;
    if (genero === "f") {
      if (estilo === 0) return `<path d="M22 52 Q20 18 50 16 Q80 18 78 52 L78 78 Q70 70 70 50 Q50 34 30 50 Q30 70 22 78 Z" fill="${cor}"/>`;
      if (estilo === 1) return `<circle cx="50" cy="18" r="9" fill="${cor}"/><path d="M24 48 Q22 20 50 19 Q78 20 76 48 Q66 30 50 31 Q34 30 24 48 Z" fill="${cor}"/>`;
      return `<path d="M23 50 Q22 18 50 17 Q78 18 77 50 Q77 64 72 66 Q72 40 50 32 Q28 40 28 66 Q23 64 23 50 Z" fill="${cor}"/>`;
    }
    if (idade >= 60 && estilo === 0) return `<path d="M25 44 Q26 32 32 30 L30 46 Z M75 44 Q74 32 68 30 L70 46 Z" fill="${cor}"/>`; // calvície
    if (estilo === 1) return `<path d="M25 42 Q24 18 50 18 Q76 18 75 42 Q68 28 50 28 Q32 28 25 42 Z" fill="${cor}"/>`;
    return `<path d="M24 44 Q22 16 52 17 Q78 19 76 44 Q72 30 58 27 Q44 34 30 32 Q26 36 24 44 Z" fill="${cor}"/>`;
  }

  /** Retorna um elemento <svg>. opts: {id, tipo, genero, idade, expressao, tamanho} */
  function criar(opts) {
    const h = hash(opts.id || opts.nome || "x");
    const expr = opts.expressao || "neutra";
    const tam = opts.tamanho || 64;
    const fundo = FUNDOS[opts.tipo] || "#e5e7eb";
    const icone = ICONES[opts.tipo] || "🙂";
    let corpo;
    if (!opts.genero) {
      corpo = `<circle cx="50" cy="50" r="48" fill="${fundo}"/>
        <text x="50" y="62" text-anchor="middle" font-size="40">${icone}</text>
        <circle cx="80" cy="80" r="15" fill="#fff" stroke="#9ca3af"/>
        <text x="80" y="86" text-anchor="middle" font-size="18">${HUMOR[expr]}</text>`;
    } else {
      const pele = PELES[h % PELES.length];
      const idade = Number(opts.idade || 40);
      const corCabelo = idade >= 60 ? (h % 2 ? "#d1d5db" : "#9ca3af") : CABELOS[(h >> 3) % CABELOS.length];
      const oculos = idade >= 55 || h % 5 === 0;
      const roupa = ["#1d4ed8", "#047857", "#7c3aed", "#b45309", "#be123c", "#334155"][(h >> 5) % 6];
      corpo = `<circle cx="50" cy="50" r="48" fill="${fundo}"/>
        <path d="M18 98 Q20 78 50 78 Q80 78 82 98 Z" fill="${roupa}"/>
        <rect x="43" y="68" width="14" height="12" fill="${pele}"/>
        <ellipse cx="50" cy="50" rx="24" ry="27" fill="${pele}"/>
        ${cabelo(opts.genero, idade, h, corCabelo)}
        ${sobrancelhas(expr, idade >= 60 ? "#9ca3af" : "#3b2416")}
        <circle cx="39" cy="50" r="3" fill="#1f2937"/><circle cx="61" cy="50" r="3" fill="#1f2937"/>
        ${oculos ? '<circle cx="39" cy="50" r="7" fill="none" stroke="#374151" stroke-width="2"/><circle cx="61" cy="50" r="7" fill="none" stroke="#374151" stroke-width="2"/><line x1="46" y1="50" x2="54" y2="50" stroke="#374151" stroke-width="2"/>' : ""}
        ${idade >= 60 ? '<path d="M33 60 Q36 62 38 60 M62 60 Q64 62 67 60" stroke="#00000033" stroke-width="1.5" fill="none"/>' : ""}
        ${boca(expr)}
        <circle cx="82" cy="82" r="13" fill="#fff" stroke="#9ca3af"/>
        <text x="82" y="88" text-anchor="middle" font-size="15">${icone}</text>`;
    }
    const svg = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${tam}" height="${tam}" role="img">${corpo}</svg>`,
      "image/svg+xml").documentElement;
    svg.setAttribute("class", `avatar expr-${expr}`);
    return svg;
  }

  return { criar, expressaoDePostura, NOME_EXPR, ICONES, HUMOR };
})();
