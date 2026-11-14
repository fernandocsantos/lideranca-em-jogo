/* Efeitos sonoros de interface, sintetizados com Web Audio API (sem arquivos: funcionam offline).
   Só momentos-chave; o som nunca é o único sinal (tudo também aparece na tela). Preferência e volume salvos. */
"use strict";

const SOM = (() => {
  let ctx = null;
  let ultimoPasso = 0;
  const ligado = () => localStorage.getItem("lej_som") !== "0";
  const volume = () => Number(localStorage.getItem("lej_volume") ?? 0.35);

  function contexto() {
    if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // nota com envelope suave; tipo "sine"/"triangle" para timbre discreto
  function nota(freq, ini, dur, { tipo = "sine", ganho = 1, deslize = null } = {}) {
    const c = contexto(); if (!c) return;
    const t0 = c.currentTime + ini;
    const o = c.createOscillator(), g = c.createGain();
    o.type = tipo; o.frequency.setValueAtTime(freq, t0);
    if (deslize) o.frequency.exponentialRampToValueAtTime(deslize, t0 + dur);
    const v = Math.max(0.0001, volume() * 0.25 * ganho);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  const SONS = {
    confirmar: () => { nota(660, 0, 0.09, { tipo: "triangle", ganho: 0.6 }); nota(880, 0.06, 0.12, { tipo: "triangle", ganho: 0.5 }); },
    passo: () => { const agora = performance.now(); if (agora - ultimoPasso < 45) return; ultimoPasso = agora; nota(1400, 0, 0.03, { tipo: "sine", ganho: 0.35 }); },
    alerta: () => { nota(440, 0, 0.14, { tipo: "triangle", ganho: 0.7 }); nota(330, 0.12, 0.2, { tipo: "triangle", ganho: 0.7 }); },
    fechado: () => { [523.25, 659.25, 783.99].forEach((f, i) => nota(f, i * 0.06, 0.38 - i * 0.04, { tipo: "sine", ganho: 0.55 })); },
    inicio_simulacao: () => { nota(392, 0, 0.35, { tipo: "sine", ganho: 0.45, deslize: 587 }); },
    fim_simulacao: () => { nota(587, 0, 0.3, { tipo: "sine", ganho: 0.45, deslize: 440 }); },
    revelar: () => { nota(784, 0, 0.18, { tipo: "sine", ganho: 0.5 }); nota(1046.5, 0.1, 0.3, { tipo: "sine", ganho: 0.4 }); },
    transicao: () => { nota(523.25, 0, 0.08, { tipo: "sine", ganho: 0.3 }); nota(659.25, 0.05, 0.1, { tipo: "sine", ganho: 0.25 }); },
    carimbo_sucesso: () => { nota(196, 0, 0.12, { tipo: "triangle", ganho: 0.8 }); [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => nota(f, 0.1 + i * 0.07, 0.45, { tipo: "sine", ganho: 0.4 })); },
    carimbo_parcial: () => { nota(196, 0, 0.12, { tipo: "triangle", ganho: 0.8 }); [523.25, 659.25, 698.46].forEach((f, i) => nota(f, 0.1 + i * 0.08, 0.4, { tipo: "sine", ganho: 0.4 })); },
    carimbo_fracasso: () => { nota(196, 0, 0.12, { tipo: "triangle", ganho: 0.8 }); nota(392, 0.12, 0.25, { tipo: "triangle", ganho: 0.45 }); nota(311.13, 0.32, 0.4, { tipo: "triangle", ganho: 0.45 }); },
    missao_cumprida: () => { nota(220, 0, 0.1, { tipo: "triangle", ganho: 0.8 }); [392, 523.25, 659.25, 783.99].forEach((f, i) => nota(f, 0.12 + i * 0.09, 0.6, { tipo: "sine", ganho: 0.42 })); },
    certificacao: () => { [392, 493.88, 587.33, 783.99].forEach((f, i) => nota(f, i * 0.07, 0.5, { tipo: "sine", ganho: 0.45 })); nota(1567.98, 0.32, 0.4, { tipo: "sine", ganho: 0.18 }); },
  };

  function tocar(nome) {
    if (!ligado() || document.hidden) return;
    try { SONS[nome]?.(); } catch (_) { /* áudio indisponível: segue em silêncio */ }
  }
  function alternar() { localStorage.setItem("lej_som", ligado() ? "0" : "1"); }
  function definirVolume(v) { localStorage.setItem("lej_volume", String(Math.max(0, Math.min(1, v)))); }

  return { tocar, ligado, alternar, volume, definirVolume, nomes: Object.keys(SONS) };
})();
