const CACHE_NAME = "assurance-cache-v1";
const FICHIERS = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FICHIERS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((noms) =>
      Promise.all(noms.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Les appels vers l'API WhatsApp (callmebot.com) passent toujours par le réseau
  if (event.request.url.includes("callmebot.com")) return;

  event.respondWith(
    caches.match(event.request).then((reponse) => reponse || fetch(event.request))
  );
});
