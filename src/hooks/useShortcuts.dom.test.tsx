import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ShortcutApp } from "@/types/shortcut";

// Same shape as useBookmarks, same bug: one read on mount, whole-array writes
// after, so a stale tab erased shortcuts another tab had added.
vi.mock("@/utils/firestoreShortcuts", () => ({
  fetchShortcuts: vi.fn().mockResolvedValue(null),
  saveShortcuts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/utils/pendingDeletes", () => ({
  clearPendingDeletes: vi.fn(),
  pendingDeleteIds: vi.fn().mockReturnValue(new Set()),
  queueDelete: vi.fn(),
  unqueueDelete: vi.fn(),
}));

import { useShortcuts } from "./useShortcuts";

const KEY = "bookmarkdeck:shortcuts:v1:test-user";
const A: ShortcutApp = { id: "a", name: "Mail", url: "https://mail.example" };
const B: ShortcutApp = { id: "b", name: "Docs", url: "https://docs.example" };
const stored = () => JSON.parse(localStorage.getItem(KEY)!) as ShortcutApp[];

function otherTabWrites(shortcuts: ShortcutApp[] | null, key = KEY) {
  const newValue = shortcuts ? JSON.stringify(shortcuts) : null;
  if (newValue) localStorage.setItem(key, newValue);
  else localStorage.removeItem(key);
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key, newValue, storageArea: localStorage }));
  });
}

function mountWith(shortcuts: ShortcutApp[]) {
  localStorage.clear();
  localStorage.setItem(KEY, JSON.stringify(shortcuts));
  return renderHook(() => useShortcuts("test-user"));
}

describe("useShortcuts across tabs", () => {
  it("keeps a shortcut another tab added when this tab then edits one", () => {
    const { result } = mountWith([A]);
    otherTabWrites([A, B]);
    act(() => result.current.updateShortcut("a", { name: "Mail (work)" }));
    expect(stored().map((s) => s.id).sort()).toEqual(["a", "b"]);
    expect(stored().find((s) => s.id === "a")!.name).toBe("Mail (work)");
  });

  it("does not write back what it adopted", () => {
    mountWith([A]);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    otherTabWrites([A, B]);
    expect(setItem).toHaveBeenCalledTimes(1); // the other tab's own write
    setItem.mockRestore();
  });

  it("never wipes its state because another tab removed the key", () => {
    const { result } = mountWith([A]);
    otherTabWrites(null);
    expect(result.current.shortcuts.map((s) => s.id)).toEqual(["a"]);
  });

  it("ignores another account's cache", () => {
    const { result } = mountWith([A]);
    otherTabWrites([B], "bookmarkdeck:shortcuts:v1:someone-else");
    expect(result.current.shortcuts.map((s) => s.id)).toEqual(["a"]);
  });
});
