"use client";

// Reflects the appearance settings onto :root as CSS variables. The actual
// family stacks live in globals.css (system stacks only); here we just point
// --app-font-family at the chosen one and set the numeric scales. Everything
// downstream (html font-size, body font-family, icons/emoji multipliers) reads
// these variables, so the whole app updates live.

import { useEffect } from "react";

import { useAppearanceSettings } from "@/lib/appearanceSettings";

export function AppearanceApplier() {
  const { settings } = useAppearanceSettings();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--app-font-scale", String(settings.fontScale));
    root.style.setProperty(
      "--app-font-family",
      `var(--app-font-${settings.fontFamily})`
    );
    root.style.setProperty("--app-emoji-scale", String(settings.emojiScale));
    root.style.setProperty("--app-icon-scale", String(settings.iconScale));
  }, [
    settings.fontFamily,
    settings.fontScale,
    settings.emojiScale,
    settings.iconScale,
  ]);

  return null;
}

export default AppearanceApplier;
