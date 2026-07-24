const ADMIN_URL = "/admin";

self.addEventListener("push", (event) => {
  event.waitUntil(self.registration.showNotification("Neeru’s Home Kitchen", {
    body: "A delivery reminder is due. Tap to open the order desk.",
    icon: "/neeru-logo.png",
    badge: "/neeru-logo.png",
    tag: "neeru-delivery-reminder",
    renotify: true,
    data: { url: ADMIN_URL },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clients.find((client) => new URL(client.url).pathname.startsWith(ADMIN_URL));
    if (existing) return existing.focus();
    return self.clients.openWindow(ADMIN_URL);
  })());
});
