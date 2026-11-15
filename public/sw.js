// Service worker da Adega do Pezão.
// Objetivo: o app abrir e funcionar mesmo com a internet do celular caindo.
// - Páginas: tenta a rede primeiro; sem rede, usa a última versão guardada.
// - Arquivos do build (/_next/static): nunca mudam de conteúdo, então vêm do cache.

const VERSAO = "pezao-v5";
const PAGINAS = ["/", "/caixa", "/delivery", "/produtos", "/contas", "/relatorios", "/ajustes"];

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

// Aviso que chega com o app fechado (lembrete das contas). O conteúdo vem da função "lembretes".
self.addEventListener("push", (evento) => {
  let aviso = {};
  try {
    aviso = evento.data ? evento.data.json() : {};
  } catch {
    aviso = { title: "Adega do Pezão", body: evento.data ? evento.data.text() : "" };
  }
  evento.waitUntil(
    self.registration.showNotification(aviso.title || "Adega do Pezão", {
      body: aviso.body || "",
      tag: aviso.tag || "aviso",
      icon: "/icone-192.png",
      badge: "/icone-192.png",
      data: { url: aviso.url || "/" },
    }),
  );
});

// Tocar na notificação abre (ou traz para frente) a tela de delivery.
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || "/delivery";
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      const aberta = janelas.find((j) => new URL(j.url).origin === self.location.origin);
      if (aberta) return aberta.focus().then((j) => j.navigate(destino));
      return self.clients.openWindow(destino);
    }),
  );
});
