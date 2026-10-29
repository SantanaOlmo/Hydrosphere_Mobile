/* Hydrosphere Mobile — service worker (network-first shell + offline fallback) */
const APP_VERSION = "0.2.2";
const CACHE = `hydrosphere-mobile-v${APP_VERSION}`;
const PRECACHE = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./js/sphere-api.js",
  "./js/version-check.js",
  "./manifest.json",
  "./version.json",
  "./assets/icons/app-icon-192.png",
  "./assets/icons/app-icon-512.png",
  "./assets/icons/app/sphere_mark.svg",
  "./assets/icons/actions/play.svg",
  "./assets/icons/actions/pause.svg",
  "./assets/icons/actions/download.svg",
  "./assets/icons/actions/refresh.svg",
  "./assets/icons/actions/MaterialSymbolsSave.svg",
  "./assets/icons/actions/options.svg",
  "./assets/icons/actions/beacon_reachability.svg",
  "./assets/icons/files/project.svg",
  "./assets/icons/files/log.svg",
  "./assets/icons/navigation/dashboard.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isShellRequest(url) {
  const p = url.pathname;
  return (
    p.endsWith("/") ||
    p.endsWith(".html") ||
    p.endsWith(".js") ||
    p.endsWith(".css") ||
    p.endsWith("version.json") ||
    p.endsWith("manifest.json") ||
    p.endsWith("sw.js")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Shell / versión: red primero para que «Actualizar» funcione.
  if (isShellRequest(url) || req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
