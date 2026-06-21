"use client";

import { DragonCursor } from "@/components/DragonCursor";
import { FishCursor } from "@/components/FishCursor";
import { TurtleCursor } from "@/components/TurtleCursor";
import { useCursorSettings } from "@/lib/cursorSettings";

// Renders the chosen decorative cursor overlay with the user's full settings.
export function CursorOverlay() {
  const { settings } = useCursorSettings();
  if (settings.style === "off") return null;

  const props = {
    size: settings.size,
    hue: settings.hue,
    finHue: settings.finHue,
    antennaHue: settings.antennaHue,
    finSize: settings.finSize,
    antennaSize: settings.antennaSize,
    blinkSpeed: settings.blinkSpeed,
    transition: settings.transition,
    jelly: settings.jelly,
  };

  if (settings.style === "fish") return <FishCursor {...props} />;
  if (settings.style === "turtle") return <TurtleCursor {...props} />;
  return <DragonCursor {...props} />;
}

export default CursorOverlay;
