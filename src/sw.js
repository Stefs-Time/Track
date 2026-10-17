/* Docket service worker — makes the installed app open offline.
 *
 * The page is fetched network-first, so an online launch always picks up the
 * latest release; the cached copy is only the offline fallback. Everything
 * else (manifest, icons) is cache-first. The build stamps __BUILD_ID__ with
 * the version and a content hash, so each release gets a fresh cache and the
 * old one is deleted on activate. Your log itself is never touched here — it
 * lives in the browser's local storage, not in this cache.
 */
"use strict";

const CACHE = "docket-__BUILD_ID__";
const SHELL = [
  "./",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png"
];
// Never cache these: live health checks and the single-file download.
const BYPASS = /\/(healthz|download)$/;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("docket-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || BYPASS.test(url.pathname)) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put("./", copy));
          }
          return res;
        })
        .catch(() => caches.match("./"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    }))
  );
});
