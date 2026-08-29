"use client";

// Reflects the appearance settings onto :root. The font stacks live in
// globals.css (system stacks only); here we just point --app-font-family at the
// chosen one and set the numeric scales. Everything downstream (html font-size,
// body font-family, icons/emoji multipliers) reads these variables, so the whole
// app updates live.
//
// Theme works the same way but through a class rather than a variable: `light`
// on <html> re-points the whole Tailwind colour ramp (see globals.css). Dark is
// the default, so only light needs a class. A matching inline script in
// layout.tsx sets that class before first paint — this effect exists to keep it
// in sync afterwards, when the user changes the setting or the OS flips.

import { useEffect } from "react";

import { useAppearanceSettings } from "@/lib/appearanceSettings";

/** Keep the address-bar / task-switcher colour with the resolved theme. */
function syncThemeColorMeta(light: boolean) {
  const content = light ? "#f8fafc" : "#020617";
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((el) => el.setAttribute("content", content));
}

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

  useEffect(() => {
    const root = document.documentElement;
    const apply = (light: boolean) => {
      root.classList.toggle("light", light);
      syncThemeColorMeta(light);
    };

    if (settings.theme !== "system") {
      apply(settings.theme === "light");
      return;
    }

    // "system": follow the OS, and keep following it while the tab is open.
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    apply(mq.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings.theme]);

  return null;
}

export default AppearanceApplier;
