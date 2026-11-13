// Service worker da Adega do Pezão.
// Objetivo: o app abrir e funcionar mesmo com a internet do celular caindo.
// - Páginas: tenta a rede primeiro; sem rede, usa a última versão guardada.
// - Arquivos do build (/_next/static): nunca mudam de conteúdo, então vêm do cache.

const VERSAO = "pezao-v3";
const PAGINAS = ["/", "/caixa", "/produtos", "/relatorios", "/ajustes"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(VERSAO)
      .then((cache) => cache.addAll(PAGINAS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || /\.(png|ico|svg|woff2?)$/.test(url.pathname)) {
    evento.respondWith(
      caches.match(req).then(
        (salvo) =>
          salvo ||
          fetch(req).then((resp) => {
            const copia = resp.clone();
            caches.open(VERSAO).then((cache) => cache.put(req, copia));
            return resp;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate" || req.headers.get("RSC")) {
    evento.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp.ok) {
            const copia = resp.clone();
            caches.open(VERSAO).then((cache) => cache.put(req, copia));
          }
          return resp;
        })
        .catch(() =>
          caches
            .match(req)
            .then((salvo) => salvo || caches.match(url.pathname))
            .then((salvo) => salvo || caches.match("/caixa")),
        ),
    );
  }
});
