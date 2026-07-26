/** @type {import('tailwindcss').Config} */
// NativeWind v4 preset. Colors are driven by CSS variables (see global.css) so a
// single class like `bg-surface` resolves correctly in BOTH light and dark —
// light is not a retrofit, it ships with dark from day one.
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Surfaces
        canvas: "rgb(var(--color-canvas) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        raised: "rgb(var(--color-raised) / <alpha-value>)",
        // Text
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        faint: "rgb(var(--color-faint) / <alpha-value>)",
        // Lines
        line: "rgb(var(--color-line) / <alpha-value>)",
        // Accents
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        "accent-ink": "rgb(var(--color-accent-ink) / <alpha-value>)",
        // Semantic
        good: "rgb(var(--color-good) / <alpha-value>)",
        warn: "rgb(var(--color-warn) / <alpha-value>)",
        bad: "rgb(var(--color-bad) / <alpha-value>)",
      },
      borderRadius: {
        card: "16px",
        sheet: "24px",
        pill: "999px",
      },
    },
  },
  plugins: [],
};
