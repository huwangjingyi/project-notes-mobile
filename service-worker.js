const CACHE_NAME = "project-notes-v6";
const APP_FILES = ["./", "./index.html", "./styles.css?v=6", "./analysis.js?v=6", "./app.js?v=6", "./manifest.webmanifest", "./icons/radar.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((name) => name.startsWith("project-notes-") && name !== CACHE_NAME).map((name) => caches.delete(name)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  // Navigation checks the latest HTML; versioned assets remain available offline.
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then(response => {
      if (!response.ok) throw new Error("Navigation failed");
      return response;
    }).catch(() => caches.open(CACHE_NAME).then(cache => cache.match("./index.html"))));
    return;
  }
  event.respondWith(caches.open(CACHE_NAME).then(cache => cache.match(event.request)).then(cached => cached || fetch(event.request)));
});
