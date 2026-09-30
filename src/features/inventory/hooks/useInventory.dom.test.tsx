import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/inventory/data/inventoryData", () => ({
  deleteItem: vi.fn(),
  fetchItems: vi.fn(async () => []),
  saveItem: vi.fn(async () => {}),
  subscribeItems: vi.fn(() => () => {}),
  todayKey: () => "2026-09-30",
}));

import { deleteItem, fetchItems, saveItem, subscribeItems } from "@/features/inventory/data/inventoryData";
import type { InventoryItem } from "@/features/inventory/lib/types";
import { recordSyncedIds, syncedIds } from "@/utils/syncedIds";
import { useInventory } from "./useInventory";

// On connect the hook uploaded every cached item the cloud lacked. An item
// deleted on another device is exactly such an item — so a stale laptop
// recreated it, pointing at R2 photos the delete had already purged. And a
// delete made while disconnected was never replayed.
const EMAIL = "a@example.com";
const KEY = `bookmarkdeck:inventory:items:v1:${EMAIL}`;
const item = (id: string) => ({ id, name: id, locationId: null }) as InventoryItem;
const savedIds = () => vi.mocked(saveItem).mock.calls.map(([, x]) => x.id).sort();

beforeEach(() => {
  localStorage.clear();
  vi.mocked(saveItem).mockClear();
  vi.mocked(deleteItem).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(subscribeItems).mockReset().mockReturnValue(() => {});
});

function connectWith(cache: InventoryItem[], cloud: InventoryItem[]) {
  localStorage.setItem(KEY, JSON.stringify(cache));
  vi.mocked(fetchItems).mockResolvedValue(cloud);
  return renderHook(() => useInventory(EMAIL, true));
}

describe("useInventory — deletions stay deleted", () => {
  it("doesn't re-upload an item deleted on another device", async () => {
    recordSyncedIds("inventoryItems", EMAIL, ["I1", "I2"]); // the last snapshot had both
    connectWith([item("I1"), item("I2"), item("I3")], [item("I1")]);
    await waitFor(() => expect(subscribeItems).toHaveBeenCalled());
    expect(savedIds()).toEqual(["I3"]);
  });

  it("uploads everything from a cache that has never synced", async () => {
    connectWith([item("I1"), item("I2")], []);
    await waitFor(() => expect(subscribeItems).toHaveBeenCalled());
    expect(savedIds()).toEqual(["I1", "I2"]);
  });

  it("remembers what each snapshot held", async () => {
    vi.mocked(subscribeItems).mockImplementation((_e, cb) => {
      cb([item("I7")]);
      return () => {};
    });
    connectWith([], []);
    await waitFor(() => expect(subscribeItems).toHaveBeenCalled());
    expect([...syncedIds("inventoryItems", EMAIL)]).toEqual(["I7"]);
  });

  it("replays a delete made while disconnected", async () => {
    localStorage.setItem(KEY, JSON.stringify([item("I1")]));
    vi.mocked(fetchItems).mockResolvedValue([item("I1")]);
    const { result, rerender } = renderHook(({ on }) => useInventory(EMAIL, on), {
      initialProps: { on: false },
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    act(() => result.current.removeItem("I1"));
    rerender({ on: true });
    await waitFor(() => expect(subscribeItems).toHaveBeenCalled());
    expect(deleteItem).toHaveBeenCalledWith(EMAIL, "I1");
    expect(savedIds()).toEqual([]);
  });
});
