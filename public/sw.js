// Bookmark Deck service worker — conservative app-shell caching.
//
// - Cross-origin (Firebase, Google) and /api requests are never intercepted,
//   so auth and Firestore are unaffected.
// - Navigations: network-first, falling back to /offline.html when offline.
// - Static assets (_next/static, icons, logo): stale-while-revalidate.

// Bumped from v14 so activate drops the chunks that version piled up.
const CACHE = "bmarkdeck-v15";
const OFFLINE_URL = "/offline.html";
// Every deploy ships new content-hashed chunks, and nothing else ever removes
// the old ones. Evicting a current chunk costs one refetch.
const MAX_ENTRIES = 250;

// Snoozed reminders: one record per notification tag, so the page can cancel a
// snoozed push once its habit is done. Kept out of activate's cleanup below,
// and named the same in src/lib/snoozeRecords.ts (serviceWorker.test.ts checks).
const SNOOZE_CACHE = "bmd-snooze-v1";
const SNOOZE_SEC = 60 * 60;
// Cloud narration audio, kept on the device so a line is only ever generated once
// (src/features/focus/lib/cloudVoice.ts names it too; serviceWorker.test.ts checks).
const TTS_CACHE = "bmd-tts-v1";

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
        keys.filter((k) => k !== CACHE && k !== SNOOZE_CACHE && k !== TTS_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Oldest first: keys() is in insertion order, and a revalidating put() moves an
// entry to the end, so what goes is what hasn't been fetched lately.
async function trimCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_ENTRIES;
  if (excess <= 0) return;
  const victims = keys
    .filter((r) => new URL(r.url).pathname !== OFFLINE_URL)
    .slice(0, excess);
  await Promise.all(victims.map((r) => cache.delete(r)));
}

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
          // Navigations are never cached, so the offline page is the only answer.
          const cache = await caches.open(CACHE);
          return cache.match(OFFLINE_URL);
        }
      })()
    );
    return;
  }

  if (isStatic(url)) {
    const opened = caches.open(CACHE);
    // Clone before the response is handed to the page, which may consume it.
    // Never keep one that arrived via a redirect: when an asset is bounced to
    // /login, `res.ok` is true for the login HTML, and storing it would serve
    // that page as the asset from then on.
    const network = fetch(request).then((res) => ({
      res,
      copy: res && res.ok && !res.redirected ? res.clone() : null,
    }));
    event.respondWith(
      (async () => {
        const cached = await (await opened).match(request);
        return cached || network.then(({ res }) => res).catch(() => cached);
      })()
    );
    // Registered now, during dispatch: a waitUntil called later — after a cache
    // hit has already answered — throws, and the revalidation would be lost.
    event.waitUntil(
      network
        .then(async ({ copy }) => {
          if (!copy) return;
          const cache = await opened;
          await cache.put(request, copy);
          await trimCache(cache);
        })
        .catch(() => {})
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
  if (data.snooze === true) {
    options.actions = [{ action: "snooze", title: "Snooze 1 hour" }];
    // What a snooze needs to queue the same notification again.
    options.data = { ...options.data, snooze: true, title, body: options.body, tag: options.tag };
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Queue the same notification again in an hour, through the same route the page
 * uses (the worker's fetch carries the session cookie). Resolves false when it
 * could not — no subscription, signed out, push not configured — so the click
 * can open the app instead of silently doing nothing.
 */
async function snooze(notification) {
  const d = notification.data || {};
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (!sub) return false;
    const res = await fetch("/api/push/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        subscription: sub.toJSON(),
        delaySec: SNOOZE_SEC,
        title: d.title,
        body: d.body,
        url: d.url,
        tag: d.tag,
        snooze: true,
      }),
    });
    const out = res.ok ? await res.json() : null;
    if (!out || typeof out.messageId !== "string") return false;
    const cache = await caches.open(SNOOZE_CACHE);
    await cache.put(
      "/__snooze/" + encodeURIComponent(d.tag || ""),
      new Response(
        JSON.stringify({ tag: d.tag, messageId: out.messageId, fireAt: Date.now() + SNOOZE_SEC * 1000 }),
        { headers: { "content-type": "application/json" } }
      )
    );
    return true;
  } catch {
    return false;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "snooze") {
    event.waitUntil(
      snooze(event.notification).then((done) => {
        if (!done) return openTarget(event);
      })
    );
    return;
  }
  event.waitUntil(openTarget(event));
});

function openTarget(event) {
  let target = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin
  );
  // A click only ever opens this app. "/\\evil.example" resolves off-site, and
  // the server's own check is not the last word on what reaches the worker.
  if (target.origin !== self.location.origin) target = new URL("/", self.location.origin);
  return (async () => {
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
  })();
}
