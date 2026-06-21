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

export type CursorStyle = "dragon" | "fish" | "off";

export type CursorSettings = {
  style: CursorStyle;
  size: number; // overlay scale multiplier (0.5–2)
  hue: number | null; // body colour. null = Auto (built-in animated palette); 0–360 = locked
  finHue: number | null; // fins + tail colour (fish). null = Auto (cyan)
  antennaHue: number | null; // antennae colour (fish). null = Auto (cyan)
  transition: number; // follow feel: 0 = smooth/laggy … 1 = snappy
};

/** Props the Dragon/Fish overlays accept so the settings drive their animation. */
export type CursorProps = {
  size?: number;
  hue?: number | null;
  finHue?: number | null;
  antennaHue?: number | null;
  transition?: number;
};

export const DEFAULT_CURSOR_SETTINGS: CursorSettings = {
  style: "dragon",
  size: 1,
  hue: null,
  finHue: null,
  antennaHue: null,
  transition: 0.5,
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
    style: r.style === "fish" || r.style === "off" ? r.style : "dragon",
    size: clampNum(r.size, 0.5, 2, d.size),
    hue: hueOrAuto(r.hue),
    finHue: hueOrAuto(r.finHue),
    antennaHue: hueOrAuto(r.antennaHue),
    transition: clampNum(r.transition, 0, 1, d.transition),
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
