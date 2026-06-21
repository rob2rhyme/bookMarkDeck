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

  it("validates style against the allowed set", () => {
    expect(normalizeCursorSettings({ style: "fish" }).style).toBe("fish");
    expect(normalizeCursorSettings({ style: "off" }).style).toBe("off");
    expect(normalizeCursorSettings({ style: "unicorn" }).style).toBe("dragon");
  });

  it("clamps size and transition into range", () => {
    expect(normalizeCursorSettings({ size: 99 }).size).toBe(2);
    expect(normalizeCursorSettings({ size: 0 }).size).toBe(0.5);
    expect(normalizeCursorSettings({ transition: 5 }).transition).toBe(1);
    expect(normalizeCursorSettings({ transition: -1 }).transition).toBe(0);
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
