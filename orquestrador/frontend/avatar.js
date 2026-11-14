/* Avatares profissionais próprios (SVG gerado no navegador; licença do projeto, AGPL-3.0). Nunca rostos reais.
   Busto em traje de trabalho, fundo neutro da paleta, expressão discreta; a postura também aparece num
   indicador ao lado (cor + ícone), para não depender só da cor nem só da expressão. */
"use strict";

const AVATAR = (() => {
  const PELES = ["#F1D3BF", "#E2B48F", "#C68D64", "#9A6440", "#6B4428"];
  const CABELOS = ["#2A211C", "#3E2E24", "#5B4031", "#8A6A4F", "#1E1E1E"];
  const GRISALHO = ["#C9CDD2", "#A9AFB7"];
  const TRAJES = ["#1F3A5F", "#2F3B4C", "#3B4A5E", "#25313F", "#4A3F3A", "#1D4F45"];   // tons sóbrios
  const CAMISAS = ["#FFFFFF", "#EBF3FA", "#E6F3F0", "#F2F2F2"];
  const FUNDO = "#EBF3FA";  // --cacb-primaria-clara
  const ICONE_PAPEL = { associado: "store", diretoria: "briefcase", conselho: "scale", funcionarios: "users", poder_publico: "landmark",
    imprensa: "newspaper", sindicato: "megaphone", consumidores: "users", entidade_concorrente: "building-2", federacao: "landmark",
    parceiro: "handshake", fornecedor: "store" };
  const NOME_EXPR = { favoravel: "favorável", neutra: "neutra", desconfiada: "desconfiada", insatisfeita: "insatisfeita" };
  const ICONE_EXPR = { favoravel: "circle-check", neutra: "minus", desconfiada: "circle-help", insatisfeita: "x" };

  function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return Math.abs(h); }
  function expressaoDePostura(p) { const n = Number(p); return n >= 1 ? "favoravel" : n === 0 ? "neutra" : n === -1 ? "desconfiada" : "insatisfeita"; }

  // Expressões discretas: só a curva da boca e o ângulo das sobrancelhas mudam um pouco.
  function boca(expr) {
    const s = 'stroke="#6B3A2E" stroke-width="2.2" fill="none" stroke-linecap="round"';
    return { favoravel: `<path d="M44 63 Q50 67 56 63" ${s}/>`, neutra: `<path d="M44.5 64 L55.5 64" ${s}/>`,
      desconfiada: `<path d="M44.5 64.5 Q51 63 56 65" ${s}/>`, insatisfeita: `<path d="M44 66 Q50 62 56 66" ${s}/>` }[expr];
  }
  function sobrancelhas(expr, cor) {
    const s = `stroke="${cor}" stroke-width="2.4" stroke-linecap="round" fill="none"`;
    return { favoravel: `<path d="M38 44 Q42 42.5 46 44" ${s}/><path d="M54 44 Q58 42.5 62 44" ${s}/>`,
      neutra: `<path d="M38 44 L46 44" ${s}/><path d="M54 44 L62 44" ${s}/>`,
      desconfiada: `<path d="M38 44.5 L46 44.5" ${s}/><path d="M54 43 L62 41.5" ${s}/>`,
      insatisfeita: `<path d="M38 42.5 L46 45" ${s}/><path d="M54 45 L62 42.5" ${s}/>` }[expr];
  }
  function cabelo(genero, idade, h, cor) {
    const e = h % 3;
    if (genero === "f") {
      if (e === 0) return `<path d="M30 52 Q28 24 50 23 Q72 24 70 52 L70 70 Q66 62 66 48 Q58 36 42 38 Q34 44 34 62 L30 70 Z" fill="${cor}"/>`;
      if (e === 1) return `<path d="M31 48 Q30 25 50 24 Q70 25 69 48 Q66 34 50 33 Q36 33 31 48 Z" fill="${cor}"/><ellipse cx="50" cy="24" rx="8" ry="6" fill="${cor}"/>`;
      return `<path d="M30 50 Q29 24 50 24 Q71 24 70 50 Q70 58 67 60 Q67 40 50 34 Q33 40 33 60 Q30 58 30 50 Z" fill="${cor}"/>`;
    }
    if (idade >= 60 && e === 0) return `<path d="M31 46 Q31 36 36 33 L35 48 Z M69 46 Q69 36 64 33 L65 48 Z" fill="${cor}"/>`;
    if (e === 1) return `<path d="M31 44 Q30 25 50 25 Q70 25 69 44 Q64 33 50 33 Q36 33 31 44 Z" fill="${cor}"/>`;
    return `<path d="M31 46 Q29 24 51 24 Q70 25 69 45 Q66 35 56 32 Q45 37 35 35 Q32 39 31 46 Z" fill="${cor}"/>`;
  }
  function traje(genero, h, cor, camisa) {
    // blazer com lapelas; camisa e gravata (masc.) ou gola (fem.)
    const base = `<path d="M14 100 Q16 80 36 76 L50 84 L64 76 Q84 80 86 100 Z" fill="${cor}"/>`;
    const camisaV = `<path d="M40 76 L50 92 L60 76 L57 74 L50 82 L43 74 Z" fill="${camisa}"/>`;
    const lapelas = `<path d="M36 76 L46 96 L42 80 Z M64 76 L54 96 L58 80 Z" fill="#00000022"/>`;
    const gravata = genero === "m" && h % 2 === 0 ? `<path d="M48.5 82 L51.5 82 L53 94 L50 97 L47 94 Z" fill="#00437C"/>` : "";
    return base + camisaV + lapelas + gravata;
  }

  /** Retorna um <span> com o SVG do avatar e o indicador de postura. opts: {id, nome, tipo, genero, idade, expressao, tamanho, semStatus} */
  function criar(opts) {
    const h = hash(opts.id || opts.nome || "x");
    const expr = opts.expressao || "neutra";
    const tam = opts.tamanho || 56;
    let corpo;
    if (!opts.genero) {
      // instituição: monograma com ícone de traço do papel
      const ic = (typeof ICONES_SVG !== "undefined" && ICONES_SVG[ICONE_PAPEL[opts.tipo] || "building-2"]) || "";
      corpo = `<rect width="100" height="100" rx="50" fill="${FUNDO}"/>
        <g transform="translate(26 26) scale(2)" fill="none" stroke="#0067BE" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ic}</g>`;
    } else {
      const pele = PELES[h % PELES.length];
      const idade = Number(opts.idade || 40);
      const corCabelo = idade >= 60 ? GRISALHO[h % 2] : CABELOS[(h >> 3) % CABELOS.length];
      const oculos = idade >= 55 || h % 5 === 0;
      corpo = `<rect width="100" height="100" rx="50" fill="${FUNDO}"/>
        <clipPath id="c${h}"><rect width="100" height="100" rx="50"/></clipPath>
        <g clip-path="url(#c${h})">
          ${traje(opts.genero, h, TRAJES[(h >> 5) % TRAJES.length], CAMISAS[(h >> 7) % CAMISAS.length])}
          <rect x="44" y="64" width="12" height="14" rx="4" fill="${pele}"/>
          <ellipse cx="50" cy="50" rx="18" ry="21" fill="${pele}"/>
          ${cabelo(opts.genero, idade, h, corCabelo)}
          ${sobrancelhas(expr, idade >= 60 ? "#8F969E" : "#3A2A20")}
          <circle cx="42" cy="51" r="2.1" fill="#26303B"/><circle cx="58" cy="51" r="2.1" fill="#26303B"/>
          ${oculos ? '<rect x="36" y="46.5" width="12" height="9" rx="3" fill="none" stroke="#3A4452" stroke-width="1.5"/><rect x="52" y="46.5" width="12" height="9" rx="3" fill="none" stroke="#3A4452" stroke-width="1.5"/><path d="M48 50 L52 50" stroke="#3A4452" stroke-width="1.5"/>' : ""}
          ${boca(expr)}
        </g>`;
    }
    const svg = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${tam}" height="${tam}">${corpo}</svg>`, "image/svg+xml").documentElement;
    svg.setAttribute("aria-hidden", "true");
    const caixa = document.createElement("span");
    caixa.className = "avatar-caixa";
    caixa.setAttribute("role", "img");
    caixa.setAttribute("aria-label", `${opts.nome || "Pessoa"}${opts.semStatus ? "" : `, postura ${NOME_EXPR[expr]}`}`);
    caixa.append(svg);
    if (!opts.semStatus && typeof icone === "function") {
      const st = document.createElement("span");
      st.className = `status ${expr}`;
      st.append(icone(ICONE_EXPR[expr], 11));
      caixa.append(st);
    }
    return caixa;
  }

  return { criar, expressaoDePostura, NOME_EXPR, ICONE_PAPEL };
})();
