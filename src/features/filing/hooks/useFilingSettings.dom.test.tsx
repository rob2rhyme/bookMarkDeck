import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/filing/data/filingData", () => ({
  fetchSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

import { fetchSettings, saveSettings } from "@/features/filing/data/filingData";
import { DEFAULT_FILING_SETTINGS } from "@/features/filing/lib/types";
import { useFilingSettings } from "./useFilingSettings";

const EMAIL = "a@example.com";
const REMOTE = { ...DEFAULT_FILING_SETTINGS, pushHour: 7 };

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(fetchSettings).mockReset().mockResolvedValue(REMOTE);
  vi.mocked(saveSettings).mockReset().mockResolvedValue(undefined);
});

// A change not yet in the cloud used to be remembered only in memory, so after a
// reload connecting adopted the cloud's copy over it. A signed-in change made
// offline (its save never settling) went the same way when the tab closed.
describe("useFilingSettings", () => {
  it("a change made offline survives the tab closing and wins on the next load", async () => {
    vi.mocked(saveSettings).mockImplementation(() => new Promise<never>(() => {}));
    const tab = renderHook(() => useFilingSettings(EMAIL, true));
    await waitFor(() => expect(tab.result.current.settings.pushHour).toBe(7));
    act(() => tab.result.current.update({ pushHour: 21 }));
    tab.unmount();

    vi.mocked(saveSettings).mockReset().mockResolvedValue(undefined);
    const next = renderHook(() => useFilingSettings(EMAIL, true));
    await waitFor(() => expect(saveSettings).toHaveBeenCalled());
    expect(vi.mocked(saveSettings).mock.calls[0][1]).toMatchObject({ pushHour: 21 });
    expect(next.result.current.settings.pushHour).toBe(21);
  });

  it("with nothing waiting, adopts the cloud's copy", async () => {
    const { result } = renderHook(() => useFilingSettings(EMAIL, true));
    await waitFor(() => expect(result.current.settings.pushHour).toBe(7));
    expect(saveSettings).not.toHaveBeenCalled();
  });
});
