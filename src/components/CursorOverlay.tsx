"use client";

import { DragonCursor } from "@/components/DragonCursor";
import { FishCursor } from "@/components/FishCursor";
import { useCursorSettings } from "@/lib/cursorSettings";

// Renders the chosen decorative cursor overlay with the user's size / colour /
// transition settings. Defaults to the dragon, so existing behaviour is intact.
export function CursorOverlay() {
  const { settings } = useCursorSettings();
  if (settings.style === "off") return null;

  const props = {
    size: settings.size,
    hue: settings.hue,
    transition: settings.transition,
  };
  return settings.style === "fish" ? (
    <FishCursor {...props} />
  ) : (
    <DragonCursor {...props} />
  );
}

export default CursorOverlay;
