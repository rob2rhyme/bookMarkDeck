import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { newHere, recordSyncedIds, syncedIds } from "@/utils/syncedIds";

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
  (globalThis as unknown as { window: unknown }).window = { localStorage: memoryStorage() };
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

const r = (id: string) => ({ id });

describe("syncedIds", () => {
  it("records and reads back, per domain and per user", () => {
    recordSyncedIds("items", "a@x.com", ["1", "2", "2"]);
    expect([...syncedIds("items", "a@x.com")].sort()).toEqual(["1", "2"]);
    expect(syncedIds("items", "b@x.com").size).toBe(0);
    expect(syncedIds("folders", "a@x.com").size).toBe(0);
  });
});

describe("newHere", () => {
  // The resurrection bug: the cloud had B last time, B is gone now — another
  // device deleted it, and it must not be uploaded again.
  it("excludes what the cloud had at the last sync", () => {
    recordSyncedIds("items", "a@x.com", ["A", "B"]);
    const local = [r("A"), r("B"), r("C")];
    expect(newHere(local, new Set(["A"]), "items", "a@x.com")).toEqual([r("C")]);
  });

  // The guarantee for accounts that have never synced: everything uploads, as
  // it always did on a first connect.
  it("treats everything as new on a device that has never synced", () => {
    const local = [r("A"), r("B")];
    expect(newHere(local, new Set(), "items", "a@x.com")).toEqual(local);
  });

  it("never returns what the cloud already has", () => {
    expect(newHere([r("A")], new Set(["A"]), "items", "a@x.com")).toEqual([]);
  });
});
