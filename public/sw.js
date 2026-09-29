// Bookmark Deck service worker — conservative app-shell caching.
//
// - Cross-origin (Firebase, Google) and /api requests are never intercepted,
//   so auth and Firestore are unaffected.
// - Navigations: network-first, falling back to /offline.html when offline.
// - Static assets (_next/static, icons, logo): stale-while-revalidate.

const CACHE = "bmarkdeck-v14";
const OFFLINE_URL = "/offline.html";

const STATIC_PREFIXES = ["/_next/static/", "/icons/"];
const STATIC_EXACT = ["/logo.png", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isStatic(url) {
  return (
    STATIC_PREFIXES.some((p) => url.pathname.startsWith(p)) ||
    STATIC_EXACT.includes(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // skip cross-origin
  if (url.pathname.startsWith("/api/")) return; // never touch API/auth

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(request)) || (await cache.match(OFFLINE_URL))
          );
        }
      })()
    );
    return;
  }

  if (isStatic(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            // Never cache a response that arrived via a redirect: when an asset
            // is bounced to /login, `res.ok` is true for the login HTML, and
            // storing it would serve that page as the asset from then on.
            if (res && res.ok && !res.redirected) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })()
    );
  }
});

// --- Web Push ---------------------------------------------------------------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "Bookmark Deck";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    // Android draws the badge from its alpha channel alone, so it must be a
    // white-on-transparent glyph — the opaque icon renders as a solid square.
    badge: "/icons/badge-96.png",
    // Stay on screen until dismissed, alert (sound + haptic), and collapse
    // repeats so a missed timer end is hard to overlook even with the app closed.
    requireInteraction: true,
    renotify: true,
    // Each pillar sends its own tag, so a habit reminder can't replace the
    // filing digest. The default only covers messages queued before tags existed.
    tag: data.tag || "bmd-focus-timer",
    silent: false, // never deliver quietly — let the OS sound/buzz
    // Android honours this pattern; iOS ignores it (no Web Vibration in push)
    // and instead uses the OS default notification sound/haptic.
    vibrate: [300, 150, 300, 150, 400],
    data: { url: data.url || "/focus" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin
  );
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Exact page, not a substring: "/habits" used to match a window sitting
      // on /habits/guide, which was focused and left on the guide.
      const exact = all.find((c) => new URL(c.url).pathname === target.pathname);
      if (exact) return exact.focus();
      const other = all.find((c) => new URL(c.url).origin === target.origin);
      if (other) {
        try {
          const moved = await other.navigate(target.href);
          if (moved) return moved.focus();
        } catch {
          // navigate() rejects for a window this worker doesn't control.
        }
      }
      return self.clients.openWindow(target.href);
    })()
  );
});
