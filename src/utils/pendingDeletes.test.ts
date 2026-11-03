import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearPendingUpserts,
  durableDelete,
  durableSave,
  flushPendingDeletes,
  pendingDeleteIds,
  pendingUpsertIds,
  queueDelete,
  queueUpsert,
  replayUpserts,
  unqueueDelete,
  unqueueUpsert,
} from "@/utils/pendingDeletes";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => {
      m.set(k, String(v));
    },
    removeItem: (k) => {
      m.delete(k);
    },
    clear: () => {
      m.clear();
    },
    key: () => null,
  };
}

beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: memoryStorage(),
  };
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("pending upserts", () => {
  it("queues, dedupes, and reads back", () => {
    queueUpsert("notes", "a@x.com", "n1");
    queueUpsert("notes", "a@x.com", "n1"); // dupe ignored
    queueUpsert("notes", "a@x.com", "n2");
    expect([...pendingUpsertIds("notes", "a@x.com")].sort()).toEqual([
      "n1",
      "n2",
    ]);
  });

  it("namespaces by domain and scope", () => {
    queueUpsert("notes", "a@x.com", "n1");
    expect(pendingUpsertIds("notes", "b@x.com").size).toBe(0); // other owner
    expect(pendingUpsertIds("todos", "a@x.com").size).toBe(0); // other domain
  });

  it("unqueue and clear remove ids", () => {
    queueUpsert("notes", "a", "n1");
    queueUpsert("notes", "a", "n2");
    unqueueUpsert("notes", "a", "n1");
    expect([...pendingUpsertIds("notes", "a")]).toEqual(["n2"]);
    clearPendingUpserts("notes", "a");
    expect(pendingUpsertIds("notes", "a").size).toBe(0);
  });

  it("upsert and delete queues are independent", () => {
    queueUpsert("notes", "a", "x");
    queueDelete("notes", "a", "x");
    unqueueUpsert("notes", "a", "x"); // dropping the upsert...
    expect(pendingUpsertIds("notes", "a").has("x")).toBe(false);
    expect(pendingDeleteIds("notes", "a").has("x")).toBe(true); // ...leaves delete
    unqueueDelete("notes", "a", "x");
    expect(pendingDeleteIds("notes", "a").has("x")).toBe(false);
  });
});

/** A promise the test settles by hand: an offline write is one that never settles. */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const permanent = Object.assign(new Error("denied"), { code: "permission-denied" });
const transient = Object.assign(new Error("offline"), { code: "unavailable" });

// While signed in, Firestore holds a write in this tab's memory until the server
// has it, so a tab closed offline loses it. The id is queued first and leaves the
// queue only on the server's acknowledgement.
describe("durableSave / durableDelete", () => {
  it("keeps the id queued until the write lands", async () => {
    const w = deferred();
    void durableSave("items", "a@x", "i1", () => w.promise);
    expect(pendingUpsertIds("items", "a@x")).toEqual(new Set(["i1"]));
    w.resolve();
    await flush();
    expect(pendingUpsertIds("items", "a@x").size).toBe(0);
  });

  it("with no connection only queues, as before", async () => {
    await durableSave("items", "a@x", "i1", null);
    expect(pendingUpsertIds("items", "a@x")).toEqual(new Set(["i1"]));
  });

  it("an older write's acknowledgement doesn't take a newer one off the queue", async () => {
    const first = deferred();
    const second = deferred();
    void durableSave("items", "a@x", "i1", () => first.promise);
    void durableSave("items", "a@x", "i1", () => second.promise);
    first.resolve();
    await flush();
    expect(pendingUpsertIds("items", "a@x")).toEqual(new Set(["i1"]));
    second.resolve();
    await flush();
    expect(pendingUpsertIds("items", "a@x").size).toBe(0);
  });

  it("a write that can't land for good leaves the queue; one that can stays", async () => {
    await durableSave("items", "a@x", "gone", () => Promise.reject(permanent)).catch(() => {});
    await durableSave("items", "a@x", "later", () => Promise.reject(transient)).catch(() => {});
    expect(pendingUpsertIds("items", "a@x")).toEqual(new Set(["later"]));
  });

  it("a delete replaces a queued save of the same record, and the reverse", async () => {
    const del = deferred();
    await durableSave("items", "a@x", "i1", null);
    void durableDelete("items", "a@x", "i1", () => del.promise);
    expect(pendingUpsertIds("items", "a@x").size).toBe(0);
    expect(pendingDeleteIds("items", "a@x")).toEqual(new Set(["i1"]));
    // Restored before the delete landed: the delete's late acknowledgement
    // mustn't take the restore's save off the queue.
    void durableSave("items", "a@x", "i1", () => new Promise(() => {}));
    del.resolve();
    await flush();
    expect(pendingDeleteIds("items", "a@x").size).toBe(0);
    expect(pendingUpsertIds("items", "a@x")).toEqual(new Set(["i1"]));
  });
});

describe("replaying the queue on connect", () => {
  it("takes each record off only once it lands, and keeps one that failed", async () => {
    queueUpsert("items", "a@x", "ok");
    queueUpsert("items", "a@x", "fails");
    await replayUpserts("items", "a@x", [{ id: "ok" }, { id: "fails" }], (r) =>
      r.id === "ok" ? Promise.resolve() : Promise.reject(transient)
    );
    expect(pendingUpsertIds("items", "a@x")).toEqual(new Set(["fails"]));
  });

  it("takes off what the caller chose not to send", async () => {
    // e.g. a record deleted on another device: that delete wins.
    queueUpsert("items", "a@x", "deleted-elsewhere");
    await replayUpserts("items", "a@x", [], () => Promise.resolve());
    expect(pendingUpsertIds("items", "a@x").size).toBe(0);
  });

  it("leaves an edit made while the replay was running", async () => {
    queueUpsert("items", "a@x", "i1");
    const w = deferred();
    const run = replayUpserts("items", "a@x", [{ id: "i1" }], () => w.promise);
    void durableSave("items", "a@x", "i1", () => new Promise(() => {}));
    w.resolve();
    await run;
    expect(pendingUpsertIds("items", "a@x")).toEqual(new Set(["i1"]));
  });

  it("keeps a delete that failed, drops one that landed", async () => {
    queueDelete("items", "a@x", "ok");
    queueDelete("items", "a@x", "fails");
    await flushPendingDeletes("items", "a@x", (id) =>
      id === "ok" ? Promise.resolve() : Promise.reject(transient)
    );
    expect(pendingDeleteIds("items", "a@x")).toEqual(new Set(["fails"]));
  });
});
