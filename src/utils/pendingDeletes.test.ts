import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearPendingUpserts,
  pendingDeleteIds,
  pendingUpsertIds,
  queueDelete,
  queueUpsert,
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
