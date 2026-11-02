import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/filing/data/filingData", () => ({
  deleteParty: vi.fn(async () => {}),
  fetchParties: vi.fn(async () => []),
  saveParty: vi.fn(async () => {}),
  subscribeParties: vi.fn(() => () => {}),
}));

import { subscribeParties } from "@/features/filing/data/filingData";
import type { FilingParty } from "@/features/filing/lib/types";
import { syncedIds } from "@/utils/syncedIds";
import { useFilingParties } from "./useFilingParties";

const EMAIL = "a@example.com";
const party = (id: string): FilingParty =>
  ({ id, name: id, kind: "other", createdAt: null, updatedAt: null }) as FilingParty;

beforeEach(() => {
  localStorage.clear();
  vi.mocked(subscribeParties).mockReset().mockReturnValue(() => {});
});

// A live listener fires at once from this device's own unconfirmed write,
// before the server has seen it — recording that id as "the cloud already
// has this" risks never re-uploading it if the write never lands.
describe("useFilingParties — syncedIds", () => {
  it("doesn't record an id from a snapshot carrying unacknowledged writes", async () => {
    vi.mocked(subscribeParties).mockImplementation((_e, cb) => {
      cb([party("new")], { fromCache: false, hasPendingWrites: true });
      return () => {};
    });
    renderHook(() => useFilingParties(EMAIL, true));
    await waitFor(() => expect(subscribeParties).toHaveBeenCalled());
    expect(syncedIds("filingParties", EMAIL).has("new")).toBe(false);
  });
});
