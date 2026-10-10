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
