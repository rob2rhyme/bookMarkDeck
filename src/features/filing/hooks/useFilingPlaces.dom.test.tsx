import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/filing/data/filingData", () => ({
  deletePlace: vi.fn(async () => {}),
  fetchPlaces: vi.fn(async () => []),
  savePlace: vi.fn(async () => {}),
  subscribePlaces: vi.fn(() => () => {}),
}));

import { deletePlace, fetchPlaces, savePlace, subscribePlaces } from "@/features/filing/data/filingData";
import type { FilingPlace } from "@/features/filing/lib/types";
import { recordSyncedIds } from "@/utils/syncedIds";
import { useFilingPlaces } from "./useFilingPlaces";

const EMAIL = "a@example.com";
const KEY = `bookmarkdeck:filing:places:v1:${EMAIL}`;
const place = (id: string, parentId: string | null = null) =>
  ({ id, name: id, parentId, kind: "cabinet", sortOrder: 0, createdAt: "", updatedAt: null }) as FilingPlace;

beforeEach(() => {
  localStorage.clear();
  vi.mocked(savePlace).mockClear();
  vi.mocked(deletePlace).mockClear();
  vi.mocked(subscribePlaces).mockClear();
});

// Removing a place floats its children to the top level. Done while
// disconnected, the delete was replayed on connect but the children's new
// parentId never was — so the snapshot pointed them back at a missing parent.
describe("useFilingPlaces — offline edits", () => {
  it("pushes the children a disconnected remove re-parented", async () => {
    const cloud = [place("C"), place("D", "C")];
    recordSyncedIds("filingPlaces", EMAIL, ["C", "D"]);
    localStorage.setItem(KEY, JSON.stringify(cloud));
    vi.mocked(fetchPlaces).mockResolvedValue(cloud);
    const { result, rerender } = renderHook(({ on }) => useFilingPlaces(EMAIL, on), {
      initialProps: { on: false },
    });
    await waitFor(() => expect(result.current.places).toHaveLength(2));
    act(() => result.current.removePlace("C"));
    rerender({ on: true });
    await waitFor(() => expect(subscribePlaces).toHaveBeenCalled());
    expect(deletePlace).toHaveBeenCalledWith(EMAIL, "C");
    expect(vi.mocked(savePlace).mock.calls.map(([, p]) => [p.id, p.parentId])).toEqual([["D", null]]);
  });
});
