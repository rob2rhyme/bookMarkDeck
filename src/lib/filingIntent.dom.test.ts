import { beforeEach, describe, expect, it, vi } from "vitest";

import { consumeFilingIntent, setFilingIntent } from "@/lib/filingIntent";

describe("filingIntent", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips an intent", () => {
    setFilingIntent("add-paper");
    expect(consumeFilingIntent()).toBe("add-paper");
  });

  it("clears on read, so it can't re-fire on the next visit", () => {
    setFilingIntent("where-is-it");
    expect(consumeFilingIntent()).toBe("where-is-it");
    expect(consumeFilingIntent()).toBeNull();
  });

  it("returns null when nothing is set", () => {
    expect(consumeFilingIntent()).toBeNull();
  });

  it("ignores a value that isn't a known intent", () => {
    window.localStorage.setItem("bd:intent:filing", "drop-tables");
    expect(consumeFilingIntent()).toBeNull();
  });

  it("nudges an already-mounted dashboard", () => {
    const onNudge = vi.fn();
    window.addEventListener("bd:intent:filing:nudge", onNudge);
    setFilingIntent("add-paper");
    expect(onNudge).toHaveBeenCalledTimes(1);
    window.removeEventListener("bd:intent:filing:nudge", onNudge);
  });
});
