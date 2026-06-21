import { describe, expect, it } from "vitest";

import {
  DEFAULT_CURSOR_SETTINGS,
  normalizeCursorSettings,
} from "@/lib/cursorSettings";

describe("normalizeCursorSettings", () => {
  it("returns defaults for empty / junk input", () => {
    expect(normalizeCursorSettings(undefined)).toEqual(DEFAULT_CURSOR_SETTINGS);
    expect(normalizeCursorSettings("nope")).toEqual(DEFAULT_CURSOR_SETTINGS);
  });

  it("validates style against the allowed set (fish is the default)", () => {
    expect(normalizeCursorSettings({ style: "fish" }).style).toBe("fish");
    expect(normalizeCursorSettings({ style: "dragon" }).style).toBe("dragon");
    expect(normalizeCursorSettings({ style: "turtle" }).style).toBe("turtle");
    expect(normalizeCursorSettings({ style: "jellyfish" }).style).toBe(
      "jellyfish"
    );
    expect(normalizeCursorSettings({ style: "jellysprite" }).style).toBe(
      "jellysprite"
    );
    expect(normalizeCursorSettings({ style: "lobster" }).style).toBe("lobster");
    expect(normalizeCursorSettings({ style: "off" }).style).toBe("off");
    expect(normalizeCursorSettings({ style: "unicorn" }).style).toBe("fish");
  });

  it("coerces jelly to a boolean (default false)", () => {
    expect(normalizeCursorSettings({}).jelly).toBe(false);
    expect(normalizeCursorSettings({ jelly: true }).jelly).toBe(true);
    expect(normalizeCursorSettings({ jelly: "yes" }).jelly).toBe(false);
  });

  it("coerces float/ripples/bubbles to booleans (default true)", () => {
    const d = normalizeCursorSettings({});
    expect(d.float).toBe(true);
    expect(d.ripples).toBe(true);
    expect(d.bubbles).toBe(true);
    expect(normalizeCursorSettings({ ripples: false }).ripples).toBe(false);
    expect(normalizeCursorSettings({ bubbles: "x" }).bubbles).toBe(true);
  });

  it("clamps size, fin/antenna size, blink speed, and transition into range", () => {
    expect(normalizeCursorSettings({ size: 99 }).size).toBe(2);
    expect(normalizeCursorSettings({ size: 0 }).size).toBe(0.5);
    expect(normalizeCursorSettings({ transition: 5 }).transition).toBe(1);
    expect(normalizeCursorSettings({ transition: -1 }).transition).toBe(0);
    expect(normalizeCursorSettings({ finSize: 9 }).finSize).toBe(2.5);
    expect(normalizeCursorSettings({}).finFlap).toBe(1);
    expect(normalizeCursorSettings({ finFlap: 9 }).finFlap).toBe(2);
    expect(normalizeCursorSettings({ finFlap: -1 }).finFlap).toBe(0);
    expect(normalizeCursorSettings({ antennaSize: 0 }).antennaSize).toBe(0.5);
    expect(normalizeCursorSettings({ blinkSpeed: 99 }).blinkSpeed).toBe(3);
    expect(normalizeCursorSettings({ blinkSpeed: 0 }).blinkSpeed).toBe(0.25);
    expect(normalizeCursorSettings({}).swimSpeed).toBe(1);
    expect(normalizeCursorSettings({ swimSpeed: 99 }).swimSpeed).toBe(3);
    expect(normalizeCursorSettings({ swimSpeed: 0 }).swimSpeed).toBe(0.25);
    expect(normalizeCursorSettings({}).tailSpeed).toBe(1);
    expect(normalizeCursorSettings({ tailSpeed: 9 }).tailSpeed).toBe(2);
    expect(normalizeCursorSettings({ tailSpeed: -1 }).tailSpeed).toBe(0);
  });

  it("coerces babies (default false) and clamps/rounds babyCount to 1–6", () => {
    expect(normalizeCursorSettings({}).babies).toBe(false);
    expect(normalizeCursorSettings({ babies: true }).babies).toBe(true);
    expect(normalizeCursorSettings({ babies: "x" }).babies).toBe(false);
    expect(normalizeCursorSettings({}).babyCount).toBe(2);
    expect(normalizeCursorSettings({ babyCount: 99 }).babyCount).toBe(99);
    expect(normalizeCursorSettings({ babyCount: 999 }).babyCount).toBe(100);
    expect(normalizeCursorSettings({ babyCount: 0 }).babyCount).toBe(1);
    expect(normalizeCursorSettings({ babyCount: 3.7 }).babyCount).toBe(4);
    expect(normalizeCursorSettings({}).babyGap).toBe(16);
    expect(normalizeCursorSettings({ babyGap: 999 }).babyGap).toBe(40);
    expect(normalizeCursorSettings({ babyGap: 1 }).babyGap).toBe(6);
    expect(normalizeCursorSettings({}).babySpread).toBe(30);
    expect(normalizeCursorSettings({ babySpread: 999 }).babySpread).toBe(80);
    expect(normalizeCursorSettings({ babySpread: -5 }).babySpread).toBe(0);
    expect(normalizeCursorSettings({}).babySize).toBe(0.5);
    expect(normalizeCursorSettings({ babySize: 9 }).babySize).toBe(0.9);
    expect(normalizeCursorSettings({ babySize: 0 }).babySize).toBe(0.2);
  });

  it("treats hue null/absent as Auto, clamps a custom hue (body/fins/antennae)", () => {
    expect(normalizeCursorSettings({ hue: null }).hue).toBeNull();
    expect(normalizeCursorSettings({}).hue).toBeNull();
    expect(normalizeCursorSettings({ hue: 400 }).hue).toBe(360);
    expect(normalizeCursorSettings({ hue: 210 }).hue).toBe(210);

    expect(normalizeCursorSettings({}).finHue).toBeNull();
    expect(normalizeCursorSettings({}).antennaHue).toBeNull();
    expect(normalizeCursorSettings({ finHue: -5 }).finHue).toBe(0);
    expect(normalizeCursorSettings({ antennaHue: 130 }).antennaHue).toBe(130);
  });
});
