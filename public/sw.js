// Service worker do ClicouAí: só mostra as notificações do navegador (Web Push) e, no clique,
// abre a página certa. Não guarda nada em cache.

self.addEventListener("push", (evento) => {
  let aviso = { titulo: "ClicouAí", corpo: "", url: "/" };
  try {
    aviso = { ...aviso, ...evento.data.json() };
  } catch {
    // Aviso sem corpo: mostra o padrão.
  }
  evento.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.corpo,
      icon: "/icon.png",
      badge: "/icon.png",
      data: { url: aviso.url },
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const url = new URL(evento.notification.data?.url || "/", self.location.origin).href;
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if (janela.url === url && "focus" in janela) return janela.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
