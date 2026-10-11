/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { clientsClaim } from "workbox-core";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// New versions take over on the next open, with no reinstall (members aren't technical).
self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// App routes (/c/…, /join/…) load the app shell, also offline.
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/ocr\//, /^\/share-receipt/] }));

/**
 * Android share target: JazzCash → Share → Bari posts the receipt here.
 * We park it in Cache Storage and open /share, where the app picks it up.
 */
export const SHARE_CACHE = "bari-share";
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/share-receipt") return;
  event.respondWith((async () => {
    try {
      const form = await event.request.formData();
      const cache = await caches.open(SHARE_CACHE);
      await cache.delete("/__shared/receipt");
      await cache.delete("/__shared/text");
      const file = form.get("receipt");
      if (file instanceof File && file.size > 0) {
        await cache.put("/__shared/receipt", new Response(file, { headers: { "content-type": file.type || "application/octet-stream" } }));
      }
      const text = ["title", "text", "url"].map(k => form.get(k)).filter(v => typeof v === "string" && v).join("\n");
      if (text) await cache.put("/__shared/text", new Response(text));
    } catch { /* fall through to the app, which explains nothing arrived */ }
    return Response.redirect("/share", 303);
  })());
});

/* ── Push notifications (daily reminder, payment checked, toss, …) ── */
self.addEventListener("push", event => {
  let msg: { title?: string; body?: string; url?: string; tag?: string } = {};
  try { msg = event.data?.json() ?? {}; } catch { msg = { title: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(msg.title || "Bari", {
    body: msg.body ?? "",
    tag: msg.tag,
    icon: "/icon-192.png",
    data: { url: msg.url ?? "/" }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL((event.notification.data as { url?: string } | null)?.url ?? "/", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = wins.find(w => new URL(w.url).origin === self.location.origin);
    if (open) { await open.focus(); await open.navigate(url).catch(() => undefined); return; }
    await self.clients.openWindow(url);
  })());
});
