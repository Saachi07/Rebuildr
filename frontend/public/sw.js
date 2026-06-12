/* Rebuildr service worker.
 *
 * Goal: the app shell — and above all the Emergency contacts page — keeps
 * working with no signal. Disaster survivors are often on dead or patchy
 * connections, and the crisis numbers must never be unreachable.
 *
 * Strategy:
 *  - navigations: network-first, falling back to the cached app shell
 *  - hashed /assets/: cache-first (immutable by construction)
 *  - everything else (API calls etc.): untouched
 */
const CACHE = "rebuildr-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("__shell__", copy));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match("__shell__"))),
    );
    return;
  }

  if (url.pathname.includes("/assets/")) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
