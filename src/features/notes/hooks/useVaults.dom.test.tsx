import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/notes/data/notesData", () => ({
  fetchVaults: vi.fn(async () => []),
  saveVault: vi.fn(async () => {}),
  subscribeVaults: vi.fn(() => () => {}),
}));

import { fetchVaults, saveVault, subscribeVaults } from "@/features/notes/data/notesData";
import { createVault, vaultIterationLimits, type VaultRecord } from "@/features/notes/lib/vault";
import { isUnlocked, resetVaultSessionForTests } from "@/features/notes/lib/vaultSession";
import { syncedIds } from "@/utils/syncedIds";
import { useVaults } from "./useVaults";

const EMAIL = "a@example.com";
const KEY = `bookmarkdeck:notes:vaults:v1:${EMAIL}`;
const FAST = { iterations: 1_000 };
vaultIterationLimits.min = 1_000;

beforeEach(() => {
  localStorage.clear();
  resetVaultSessionForTests();
  vi.mocked(saveVault).mockClear();
  vi.mocked(fetchVaults).mockReset().mockResolvedValue([]);
  vi.mocked(subscribeVaults).mockReset().mockReturnValue(() => {});
});

describe("useVaults", () => {
  it("unlocks with the passphrase of any vault it holds", async () => {
    const a = await createVault("first pass", FAST);
    const b = await createVault("second pass", FAST);
    localStorage.setItem(KEY, JSON.stringify([a.record, b.record]));
    const { result } = renderHook(() => useVaults(EMAIL, false));
    await waitFor(() => expect(result.current.vaults).toHaveLength(2));
    await expect(result.current.unlock("nope")).rejects.toThrow(/doesn't match/);
    await act(() => result.current.unlock("second pass"));
    expect(isUnlocked()).toBe(true);
    expect(result.current.primaryKid()).toBe(b.record.id);
  });

  it("uploads a vault made offline on connect, and never drops one the cloud lacks", async () => {
    const local = (await createVault("offline pass", FAST)).record;
    const cloudOnly = (await createVault("other device", FAST)).record;
    localStorage.setItem(KEY, JSON.stringify([local]));
    let push: (v: VaultRecord[]) => void = () => {};
    vi.mocked(fetchVaults).mockResolvedValue([cloudOnly]);
    vi.mocked(subscribeVaults).mockImplementation((_e, cb) => {
      push = (v) => cb(v, { fromCache: false, hasPendingWrites: false });
      return () => {};
    });
    const { result } = renderHook(() => useVaults(EMAIL, true));
    await waitFor(() => expect(subscribeVaults).toHaveBeenCalled());
    expect(vi.mocked(saveVault).mock.calls.map(([, v]) => v.id)).toEqual([local.id]);
    act(() => push([cloudOnly])); // a snapshot that (momentarily) lacks the local vault
    expect(result.current.vaults.map((v) => v.id).sort()).toEqual([local.id, cloudOnly.id].sort());
    expect(result.current.ready).toBe(true);
  });

  // A live listener fires at once from this device's own unconfirmed write,
  // before the server has seen it — recording that id as "the cloud already
  // has this" risks never re-uploading it if the write never lands.
  it("doesn't record an id from a snapshot carrying unacknowledged writes", async () => {
    const local = (await createVault("offline pass", FAST)).record;
    vi.mocked(subscribeVaults).mockImplementation((_e, cb) => {
      cb([local], { fromCache: false, hasPendingWrites: true });
      return () => {};
    });
    renderHook(() => useVaults(EMAIL, true));
    await waitFor(() => expect(subscribeVaults).toHaveBeenCalled());
    expect(syncedIds("notesVaults", EMAIL).has(local.id)).toBe(false);
  });

  it("isn't ready while connected until the cloud has answered", async () => {
    const { result } = renderHook(() => useVaults(EMAIL, true));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.ready).toBe(false);
  });
});
