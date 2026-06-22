"use client";

// Decorative cursor-overlay settings — deliberately SEPARATE from the focus app
// and stored locally (per device). A small React context so the panel writes and
// the overlay reads update live, with a localStorage cache (hydration-safe).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type CursorStyle =
  | "dragon"
  | "fish"
  | "turtle"
  | "jellyfish"
  | "jellysprite"
  | "lobster"
  | "off";

export type CursorSettings = {
  style: CursorStyle;
  size: number; // overlay scale multiplier (0.5–2)
  hue: number | null; // body/shell colour. null = Auto; 0–360 = locked
  finHue: number | null; // fins/tail (fish) · flippers (turtle). null = Auto
  antennaHue: number | null; // antennae (fish) · shell pattern (turtle). null = Auto
  finSize: number; // fish fin · turtle flipper scale (0.5–2.5)
  finFlap: number; // fish: fin flap amount, turn-reactive (0 = static … 2)
  antennaSize: number; // fish antenna scale (0.5–2.5)
  blinkSpeed: number; // eye blink cadence (0.25 slow … 3 fast)
  transition: number; // follow feel: 0 = smooth/laggy … 1 = snappy
  jelly: boolean; // turtle: translucent jellyfish body
  float: boolean; // turtle: buoyant idle drift + free 360° rotation
  ripples: boolean; // turtle: water ripples
  bubbles: boolean; // turtle: rising bubbles
  swimSpeed: number; // turtle: stroke/animation tempo (0.25 slow … 3 fast)
  tailSpeed: number; // lobster: tail undulation speed (0 = still … 2 fast)
  babies: boolean; // turtle: trailing baby turtles that follow along
  babyCount: number; // turtle: how many babies (1–100); each is 50% of parent size
  babyGap: number; // turtle: spacing/distance between babies (6–40)
  babySpread: number; // turtle: sideways fan offset, px (0 = single file)
  babySize: number; // turtle: baby scale as a fraction of the parent (0.2–0.9)
};

/** Props the overlays accept so the settings drive their animation. */
export type CursorProps = {
  size?: number;
  hue?: number | null;
  finHue?: number | null;
  antennaHue?: number | null;
  finSize?: number;
  finFlap?: number;
  antennaSize?: number;
  blinkSpeed?: number;
  transition?: number;
  jelly?: boolean;
  float?: boolean;
  ripples?: boolean;
  bubbles?: boolean;
  swimSpeed?: number;
  tailSpeed?: number;
  babies?: boolean;
  babyCount?: number;
  babyGap?: number;
  babySpread?: number;
  babySize?: number;
};

export const DEFAULT_CURSOR_SETTINGS: CursorSettings = {
  style: "fish",
  size: 1,
  hue: null,
  finHue: null,
  antennaHue: null,
  finSize: 1,
  finFlap: 1,
  antennaSize: 1,
  blinkSpeed: 1,
  transition: 0.5,
  jelly: false,
  float: true,
  ripples: true,
  bubbles: true,
  swimSpeed: 1,
  tailSpeed: 1,
  babies: false,
  babyCount: 2,
  babyGap: 16,
  babySpread: 30,
  babySize: 0.5,
};

const KEY = "bd:cursor-settings:v1";

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function normalizeCursorSettings(raw: unknown): CursorSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const d = DEFAULT_CURSOR_SETTINGS;
  const hueOrAuto = (v: unknown) =>
    v === null || v === undefined ? null : clampNum(v, 0, 360, 0);
  return {
    style:
      r.style === "dragon" ||
      r.style === "off" ||
      r.style === "turtle" ||
      r.style === "jellyfish" ||
      r.style === "jellysprite" ||
      r.style === "lobster"
        ? r.style
        : "fish",
    size: clampNum(r.size, 0.5, 2, d.size),
    hue: hueOrAuto(r.hue),
    finHue: hueOrAuto(r.finHue),
    antennaHue: hueOrAuto(r.antennaHue),
    finSize: clampNum(r.finSize, 0.5, 2.5, d.finSize),
    finFlap: clampNum(r.finFlap, 0, 2, d.finFlap),
    antennaSize: clampNum(r.antennaSize, 0.5, 2.5, d.antennaSize),
    blinkSpeed: clampNum(r.blinkSpeed, 0.25, 3, d.blinkSpeed),
    transition: clampNum(r.transition, 0, 1, d.transition),
    jelly: typeof r.jelly === "boolean" ? r.jelly : d.jelly,
    float: typeof r.float === "boolean" ? r.float : d.float,
    ripples: typeof r.ripples === "boolean" ? r.ripples : d.ripples,
    bubbles: typeof r.bubbles === "boolean" ? r.bubbles : d.bubbles,
    swimSpeed: clampNum(r.swimSpeed, 0.25, 3, d.swimSpeed),
    tailSpeed: clampNum(r.tailSpeed, 0, 2, d.tailSpeed),
    babies: typeof r.babies === "boolean" ? r.babies : d.babies,
    babyCount: Math.round(clampNum(r.babyCount, 1, 100, d.babyCount)),
    babyGap: clampNum(r.babyGap, 6, 40, d.babyGap),
    babySpread: clampNum(r.babySpread, 0, 80, d.babySpread),
    babySize: clampNum(r.babySize, 0.2, 0.9, d.babySize),
  };
}

type CursorContextValue = {
  settings: CursorSettings;
  update: (patch: Partial<CursorSettings>) => void;
  reset: () => void;
};

const CursorContext = createContext<CursorContextValue | null>(null);

export function CursorSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState<CursorSettings>(
    DEFAULT_CURSOR_SETTINGS
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setSettings(normalizeCursorSettings(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings, hydrated]);

  const update = useCallback(
    (patch: Partial<CursorSettings>) =>
      setSettings((s) => normalizeCursorSettings({ ...s, ...patch })),
    []
  );
  const reset = useCallback(() => setSettings(DEFAULT_CURSOR_SETTINGS), []);

  const value = useMemo(
    () => ({ settings, update, reset }),
    [settings, update, reset]
  );

  return (
    <CursorContext.Provider value={value}>{children}</CursorContext.Provider>
  );
}

export function useCursorSettings(): CursorContextValue {
  const ctx = useContext(CursorContext);
  if (!ctx) {
    return {
      settings: DEFAULT_CURSOR_SETTINGS,
      update: () => {},
      reset: () => {},
    };
  }
  return ctx;
}
