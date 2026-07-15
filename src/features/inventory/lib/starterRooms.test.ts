import { describe, expect, it } from "vitest";

import {
  STARTER_ROOMS,
  missingStarterRooms,
} from "@/features/inventory/lib/starterRooms";

describe("missingStarterRooms", () => {
  it("returns the full set when nothing exists", () => {
    expect(missingStarterRooms([])).toEqual([...STARTER_ROOMS]);
  });

  it("omits rooms already present, case- and whitespace-insensitively", () => {
    const out = missingStarterRooms(["  kitchen ", "GARAGE"]);
    expect(out).not.toContain("Kitchen");
    expect(out).not.toContain("Garage");
    expect(out).toContain("Bedroom");
  });

  it("returns nothing when every starter room already exists", () => {
    expect(missingStarterRooms([...STARTER_ROOMS])).toEqual([]);
  });

  it("ignores unrelated existing locations", () => {
    expect(missingStarterRooms(["Attic", "Shed"])).toEqual([...STARTER_ROOMS]);
  });
});
