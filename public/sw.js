self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  let payload: { title?: string; body?: string; href?: string; badge?: number; type?: string };

  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: "SpotDrop",
      body: event.data.text(),
      href: "/notifications",
    };
  }

  const title = payload.title ?? "SpotDrop";
  const body = payload.body ?? "";
  const href = payload.href ?? "/notifications";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon.png",
      badge: "/icon.png",
      data: { href, type: payload.type ?? "", badge: payload.badge ?? 0 },
      tag: href,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const href = event.notification.data?.href ?? "/notifications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const targetUrl = new URL(href, self.location.origin).href;

      for (const client of clients) {
        if ("focus" in client) {
          void client.focus();
          if ("navigate" in client && typeof client.navigate === "function") {
            return client.navigate(targetUrl);
          }
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
