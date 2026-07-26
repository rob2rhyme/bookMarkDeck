// Design tokens that are needed as VALUES (not classes) — e.g. for navigation
// theming, status bar, and animated styles. Class-based styling should always
// prefer the semantic Tailwind names (bg-surface, text-ink, …) from global.css.

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const RADIUS = { card: 16, sheet: 24, pill: 999 } as const;

/** Minimum tappable size (Apple HIG / WCAG 2.5.5). Never go below this. */
export const HIT_SLOP_MIN = 44;

export const DURATION = { fast: 120, base: 200, slow: 320 } as const;

/** Spring used for every "settling" interaction so motion feels like one system. */
export const SPRING = { damping: 18, stiffness: 220, mass: 0.6 } as const;

type Palette = {
  canvas: string;
  surface: string;
  raised: string;
  ink: string;
  muted: string;
  faint: string;
  line: string;
  accent: string;
  accentInk: string;
  good: string;
  warn: string;
  bad: string;
};

// Mirrors global.css. Kept in sync by hand — these are only for the few places
// that cannot use classes (navigation theme, status bar, chart strokes).
export const LIGHT: Palette = {
  canvas: "#F8FAFC",
  surface: "#FFFFFF",
  raised: "#F1F5F9",
  ink: "#0F172A",
  muted: "#475569",
  faint: "#94A3B8",
  line: "#E2E8F0",
  accent: "#2563EB",
  accentInk: "#FFFFFF",
  good: "#16A34A",
  warn: "#D97706",
  bad: "#DC2626",
};

export const DARK: Palette = {
  canvas: "#020617",
  surface: "#0F172A",
  raised: "#1E293B",
  ink: "#F8FAFC",
  muted: "#94A3B8",
  faint: "#64748B",
  line: "#1E293B",
  accent: "#3B82F6",
  accentInk: "#FFFFFF",
  good: "#34D399",
  warn: "#FBBF24",
  bad: "#F87171",
};

export const paletteFor = (scheme: "light" | "dark"): Palette =>
  scheme === "dark" ? DARK : LIGHT;
