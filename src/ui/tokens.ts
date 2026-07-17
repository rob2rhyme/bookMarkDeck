// Everhold design tokens — the Bookmark Deck slate/blue system, both modes.
// Dark is the house look; light is a true inversion, not an afterthought.

export const palettes = {
  dark: {
    bg: "#020617", // slate-950
    bgRaised: "#0f172a", // slate-900
    bgElement: "#1e293b", // slate-800
    border: "#1e293b", // slate-800
    borderStrong: "#334155", // slate-700
    text: "#f8fafc", // slate-50
    textMuted: "#94a3b8", // slate-400
    textFaint: "#64748b", // slate-500
    accent: "#3b82f6", // blue-500
    accentSoft: "#1e3a8a33", // blue-900 wash
    accentText: "#93c5fd", // blue-300
    good: "#34d399", // emerald-400
    warn: "#fbbf24", // amber-400
    bad: "#f87171", // red-400
    onAccent: "#f8fafc",
  },
  light: {
    bg: "#f8fafc", // slate-50
    bgRaised: "#ffffff",
    bgElement: "#f1f5f9", // slate-100
    border: "#e2e8f0", // slate-200
    borderStrong: "#cbd5e1", // slate-300
    text: "#0f172a", // slate-900
    textMuted: "#475569", // slate-600
    textFaint: "#94a3b8", // slate-400
    accent: "#2563eb", // blue-600
    accentSoft: "#dbeafe", // blue-100
    accentText: "#1d4ed8", // blue-700
    good: "#059669", // emerald-600
    warn: "#b45309", // amber-700
    bad: "#dc2626", // red-600
    onAccent: "#f8fafc",
  },
} as const;

export type Palette = { [K in keyof (typeof palettes)["dark"]]: string };
export type ResolvedScheme = keyof typeof palettes;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const maxContentWidth = 760;
