// On connect, a pillar compares what it holds with what the cloud holds, and that
// comparison must be the SERVER's answer. Offline, a plain `getDocs` answers from
// the memory cache — empty on a fresh load — and every record edited here would
// read as deleted on another device, so its queued edit would be dropped.
//
// So the connect fetch asks the server only (`getDocsFromServer`), and this runs
// it until the server answers: again when the browser comes back online, and
// every `everyMs` in case it never says so (a server outage fires no `online`).
// An error a retry can't fix (the rules refused) is thrown, not retried forever.

import { isPermanentWriteError } from "@/utils/pendingDeletes";

/** Run `fetch` until it succeeds. Resolves `null` once `cancelled()` (the effect was torn down). */
export async function untilAnswered<T>(
  fetch: () => Promise<T>,
  cancelled: () => boolean,
  everyMs = 15_000
): Promise<T | null> {
  for (;;) {
    if (cancelled()) return null;
    try {
      return await fetch();
    } catch (err) {
      if (isPermanentWriteError(err)) throw err;
      if (cancelled()) return null;
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          window.removeEventListener("online", done);
          resolve();
        };
        const timer = setTimeout(done, everyMs);
        window.addEventListener("online", done);
      });
    }
  }
}
