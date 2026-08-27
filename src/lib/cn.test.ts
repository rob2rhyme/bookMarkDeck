import { describe, expect, it } from "vitest";

import { cn } from "@/lib/cn";

describe("cn", () => {
  it("joins truthy parts with a single space", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("drops falsy parts, so conditionals inline cleanly", () => {
    const active = false;
    expect(cn("base", active && "on", undefined, null, "")).toBe("base");
  });

  it("returns an empty string when nothing is truthy", () => {
    expect(cn(undefined, false, null)).toBe("");
  });

  it("preserves caller order (later classes are appended, not merged)", () => {
    expect(cn("px-3", "px-4")).toBe("px-3 px-4");
  });
});
