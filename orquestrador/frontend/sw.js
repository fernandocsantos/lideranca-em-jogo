/* Service worker: interface e recursos locais em cache (offline); API com rede primeiro e cache de reserva. */
const VERSAO = "lej-v3-6";
const CASCA = ["/", "/static/styles.css", "/static/app.js", "/static/avatar.js", "/static/icones.js", "/static/sons.js",
  "/static/relatorio.js", "/static/vivencias.js", "/static/ensaio.js", "/static/icon.svg", "/manifest.webmanifest",
  "/static/vendor/fontes/inter-latin.woff2", "/static/vendor/fontes/inter-latin-ext.woff2",
  "/static/vendor/js/jspdf.umd.min.js", "/static/vendor/js/jspdf.plugin.autotable.min.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => Promise.all(CASCA.map((u) => c.add(u).catch(() => null)))));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;               // ações (POST) sempre vão à rede
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) {         // rede primeiro; sem rede, último dado visto
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const cp = r.clone(); caches.open(VERSAO).then((c) => c.put(req, cp)); }
      return r;
    }).catch(() => caches.match(req).then((r) => r || new Response(JSON.stringify({ detail: "Sem conexão com o servidor do jogo." }),
      { status: 503, headers: { "Content-Type": "application/json" } }))));
    return;
  }
  // rede primeiro (atualizações aparecem na hora); sem rede, a cópia em cache
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const cp = res.clone(); caches.open(VERSAO).then((c) => c.put(req, cp)); }
    return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match("/"))));
});
