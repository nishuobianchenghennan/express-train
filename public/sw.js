const CACHE_PREFIX = "speak-clearly-";
const CACHE_NAME = `${CACHE_PREFIX}2026.09.16-4`;
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/js/app.js",
  "/js/icons.js",
  "/js/storage.js",
  "/js/data/card-additions.js",
  "/js/data/cards.js",
  "/js/core/selection.js",
  "/js/core/session.js",
  "/js/core/stats.js",
];
const VERSIONED_ASSET_PATHS = new Set(APP_SHELL.filter((path) => path !== "/" && path !== "/index.html"));

function sameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function cacheKeyFor(request) {
  const url = new URL(request.url);
  return url.pathname === "/" ? "/index.html" : url.pathname;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map(async (path) => {
          const response = await fetch(new Request(path, { cache: "reload" }));
          if (!response.ok) {
            throw new Error(`无法预缓存 ${path}`);
          }
          await cache.put(path === "/" ? "/index.html" : path, response);
        }),
      ),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !sameOrigin(request)) {
    return;
  }

  const key = cacheKeyFor(request);
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: "no-store" });
        if (response.ok) {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put("/index.html", response.clone());
          } catch {
            // A usable network response must not fail because Cache Storage is unavailable.
          }
        }
        return response;
      } catch (networkError) {
        try {
          const cached = await caches.match("/index.html");
          if (cached) {
            return cached;
          }
        } catch {
          // Re-throw the original network error when both network and cache are unavailable.
        }
        throw networkError;
      }
    })());
    return;
  }

  if (VERSIONED_ASSET_PATHS.has(key)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(key);
        if (cached) {
          return cached;
        }
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(key, response.clone());
        }
        return response;
      }),
    );
  }
});
