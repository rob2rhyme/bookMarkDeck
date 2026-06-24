"use client";

// Central appearance settings — font family + global text/emoji/icon scaling.
// Local-only (per device), mirroring cursorSettings: a small React context so
// the panel writes and an applier reads update live, with a localStorage cache
// (hydration-safe).
//
// Fonts are system stacks only (privacy + zero network) — EXCEPT an optional
// user-uploaded custom font, which is read on-device, cached in localStorage as
// a data URL, and registered with the FontFace API. It never touches the
// network either.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// The named font stacks. Each key has a matching `--app-font-<key>` CSS var in
// globals.css; "custom" is backed by an uploaded FontFace (see below).
export const FONT_FAMILIES = [
  "system",
  "serif",
  "mono",
  "rounded",
  "classic",
  "elegant",
  "slab",
  "humanist",
  "handwritten",
  "typewriter",
  "display",
  "custom",
] as const;

export type FontFamily = (typeof FONT_FAMILIES)[number];

export type AppearanceSettings = {
  fontFamily: FontFamily;
  fontScale: number; // root font-size multiplier (0.85–1.4)
  emojiScale: number; // extra emoji multiplier on top of text (0.75–1.75)
  iconScale: number; // extra icon multiplier on top of text (0.75–1.75)
};

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  fontFamily: "system",
  fontScale: 1,
  emojiScale: 1,
  iconScale: 1,
};

const KEY = "bd:appearance:v1";
const FONT_KEY = "bd:appearance-custom-font:v1";

// Custom font internals. The data URL can be a couple of MB, so it lives under
// its own key (not in the small, frequently-rewritten settings object).
const CUSTOM_FAMILY = "BDCustomFont";
const MAX_FONT_BYTES = 2 * 1024 * 1024; // 2 MB — keeps us under the ~5 MB quota.

type StoredFont = { name: string; dataUrl: string };

export type CustomFontMeta = { name: string };

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function normalizeAppearanceSettings(raw: unknown): AppearanceSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const d = DEFAULT_APPEARANCE_SETTINGS;
  const family = r.fontFamily;
  return {
    fontFamily: (FONT_FAMILIES as readonly string[]).includes(family as string)
      ? (family as FontFamily)
      : "system",
    fontScale: clampNum(r.fontScale, 0.85, 1.4, d.fontScale),
    emojiScale: clampNum(r.emojiScale, 0.75, 1.75, d.emojiScale),
    iconScale: clampNum(r.iconScale, 0.75, 1.75, d.iconScale),
  };
}

// --- custom-font helpers (browser-only) --------------------------------------

function setCustomFontVar(active: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (active) {
    root.style.setProperty(
      "--app-font-custom",
      `"${CUSTOM_FAMILY}", var(--app-font-system)`
    );
  } else {
    root.style.removeProperty("--app-font-custom");
  }
}

async function registerFontFace(dataUrl: string): Promise<boolean> {
  if (
    typeof document === "undefined" ||
    !("fonts" in document) ||
    typeof FontFace === "undefined"
  ) {
    return false;
  }
  try {
    // Drop any previously-registered custom face before adding the new one.
    const stale: FontFace[] = [];
    document.fonts.forEach((f) => {
      if (f.family === CUSTOM_FAMILY) stale.push(f);
    });
    stale.forEach((f) => document.fonts.delete(f));

    const face = new FontFace(CUSTOM_FAMILY, `url(${dataUrl})`);
    await face.load();
    document.fonts.add(face);
    return true;
  } catch {
    return false;
  }
}

function unregisterFontFace() {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const stale: FontFace[] = [];
  document.fonts.forEach((f) => {
    if (f.family === CUSTOM_FAMILY) stale.push(f);
  });
  stale.forEach((f) => document.fonts.delete(f));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

type AppearanceContextValue = {
  settings: AppearanceSettings;
  update: (patch: Partial<AppearanceSettings>) => void;
  reset: () => void;
  /** Uploaded font metadata (name only), or null when none is set. */
  customFont: CustomFontMeta | null;
  /** Read, validate, register and persist an uploaded font. Throws on error. */
  setCustomFont: (file: File) => Promise<void>;
  /** Remove the uploaded font (and fall back off "custom" if it was active). */
  clearCustomFont: () => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState<AppearanceSettings>(
    DEFAULT_APPEARANCE_SETTINGS
  );
  const [customFont, setCustomFontMeta] = useState<CustomFontMeta | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate settings + re-register the saved custom font (if any).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setSettings(normalizeAppearanceSettings(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
    try {
      const rawFont = window.localStorage.getItem(FONT_KEY);
      if (rawFont) {
        const parsed = JSON.parse(rawFont) as StoredFont;
        if (parsed?.dataUrl && parsed?.name) {
          setCustomFontMeta({ name: parsed.name });
          void registerFontFace(parsed.dataUrl).then((ok) => {
            if (ok) setCustomFontVar(true);
          });
        }
      }
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
    (patch: Partial<AppearanceSettings>) =>
      setSettings((s) => normalizeAppearanceSettings({ ...s, ...patch })),
    []
  );
  // Reset keeps any uploaded font on disk; it just returns sizing/family to
  // defaults. Use "Remove" to delete the font itself.
  const reset = useCallback(() => setSettings(DEFAULT_APPEARANCE_SETTINGS), []);

  const setCustomFont = useCallback(async (file: File) => {
    const okExt = /\.(ttf|otf|woff2?|woff)$/i.test(file.name);
    if (!okExt) {
      throw new Error("Use a .ttf, .otf, .woff or .woff2 file.");
    }
    if (file.size > MAX_FONT_BYTES) {
      throw new Error("Font is too large (max 2 MB).");
    }

    const dataUrl = await readFileAsDataUrl(file);
    const ok = await registerFontFace(dataUrl);
    if (!ok) {
      throw new Error("That file isn't a valid font.");
    }

    const name = file.name.replace(/\.[^.]+$/, "") || "Custom font";
    setCustomFontVar(true);
    setCustomFontMeta({ name });
    setSettings((s) => normalizeAppearanceSettings({ ...s, fontFamily: "custom" }));

    try {
      window.localStorage.setItem(
        FONT_KEY,
        JSON.stringify({ name, dataUrl } satisfies StoredFont)
      );
    } catch {
      // Applied for this session, but couldn't be cached (quota).
      throw new Error(
        "Font applied, but it's too big to save — it won't persist after reload."
      );
    }
  }, []);

  const clearCustomFont = useCallback(() => {
    unregisterFontFace();
    setCustomFontVar(false);
    setCustomFontMeta(null);
    try {
      window.localStorage.removeItem(FONT_KEY);
    } catch {
      /* ignore */
    }
    setSettings((s) =>
      s.fontFamily === "custom" ? { ...s, fontFamily: "system" } : s
    );
  }, []);

  const value = useMemo(
    () => ({
      settings,
      update,
      reset,
      customFont,
      setCustomFont,
      clearCustomFont,
    }),
    [settings, update, reset, customFont, setCustomFont, clearCustomFont]
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearanceSettings(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    return {
      settings: DEFAULT_APPEARANCE_SETTINGS,
      update: () => {},
      reset: () => {},
      customFont: null,
      setCustomFont: async () => {},
      clearCustomFont: () => {},
    };
  }
  return ctx;
}
