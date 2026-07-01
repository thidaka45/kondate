var CACHE_NAME = "kondate-cache-v1";
var ASSETS = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key !== CACHE_NAME;
          })
          .map(function (key) {
            return caches.delete(key);
          })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  if (event.request.url.indexOf("generativelanguage.googleapis.com") !== -1) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return (
        cached ||
        fetch(event.request).then(function (response) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, copy);
          });
          return response;
        }).catch(function () {
          return cached;
        })
      );
    })
  );
});
