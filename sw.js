/* Hydrosphere Mobile — service worker (cache + avisos de versión) */
const APP_VERSION = "0.1.0";
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
  "./assets/icons/FePlay.svg",
  "./assets/icons/MaterialSymbolsDownload.svg",
  "./assets/icons/MaterialSymbolsSearch.svg",
  "./assets/icons/MaterialSymbolsSettingsRounded.svg",
  "./assets/icons/MaterialSymbolsArrowBackIosNewRounded.svg",
  "./assets/icons/KeylineIconsMenu.svg",
  "./assets/icons/MdiPlus.svg",
  "./assets/icons/MdiDelete.svg",
  "./assets/icons/BiBookHalf.svg",
  "./assets/icons/SolarFileStackLineDuotone.svg",
  "./assets/icons/MaterialSymbolsDriveFileMove.svg",
  "./assets/icons/MaterialSymbolsEdit.svg",
  "./assets/icons/DeviconGoogle.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Nunca cachear llamadas a la esfera SoftAP
  if (url.hostname === "192.168.4.1" || url.pathname.startsWith("/api/")) {
    return;
  }
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
