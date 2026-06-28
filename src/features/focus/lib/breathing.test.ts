import { describe, expect, it } from "vitest";

import {
  BREATH_PATTERNS,
  breathScale,
  cycleSeconds,
  patternById,
  phaseAt,
} from "@/features/focus/lib/breathing";

const box = patternById("box"); // in4, hold4, out4, hold4

describe("cycleSeconds", () => {
  it("sums all phase durations", () => {
    expect(cycleSeconds(box)).toBe(16);
    expect(cycleSeconds(patternById("478"))).toBe(19);
  });
});

describe("patternById", () => {
  it("falls back to the first pattern for unknown ids", () => {
    expect(patternById("nope").id).toBe(BREATH_PATTERNS[0].id);
  });
});

describe("phaseAt", () => {
  it("locates the phase and loops across cycles", () => {
    expect(phaseAt(box, 0).phase.kind).toBe("in");
    expect(phaseAt(box, 5).phase.kind).toBe("hold");
    expect(phaseAt(box, 9).phase.kind).toBe("out");
    expect(phaseAt(box, 13).phase.kind).toBe("hold");
    // 16s = one full cycle → back to the inhale
    expect(phaseAt(box, 16).phase.kind).toBe("in");
    expect(phaseAt(box, 16).phaseElapsed).toBe(0);
  });
});

describe("breathScale", () => {
  it("grows on inhale, shrinks on exhale, holds at the ends", () => {
    expect(breathScale(box, 0)).toBeCloseTo(0.4); // start of inhale = min
    expect(breathScale(box, 4)).toBeCloseTo(1); // end of inhale = max
    expect(breathScale(box, 5)).toBeCloseTo(1); // hold after inhale stays at max
    expect(breathScale(box, 8)).toBeCloseTo(1); // start of exhale = max
    expect(breathScale(box, 12)).toBeCloseTo(0.4); // end of exhale = min
    expect(breathScale(box, 14)).toBeCloseTo(0.4); // hold after exhale stays at min
  });
});
