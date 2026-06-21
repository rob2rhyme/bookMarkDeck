"use client";

import { DragonCursor } from "@/components/DragonCursor";
import { FishCursor } from "@/components/FishCursor";
import { JellyfishCursor } from "@/components/JellyfishCursor";
import { JellySpriteCursor } from "@/components/JellySpriteCursor";
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
    finFlap: settings.finFlap,
    antennaSize: settings.antennaSize,
    blinkSpeed: settings.blinkSpeed,
    transition: settings.transition,
    jelly: settings.jelly,
    float: settings.float,
    ripples: settings.ripples,
    bubbles: settings.bubbles,
    swimSpeed: settings.swimSpeed,
    babies: settings.babies,
    babyCount: settings.babyCount,
    babyGap: settings.babyGap,
    babySpread: settings.babySpread,
    babySize: settings.babySize,
  };

  if (settings.style === "fish") return <FishCursor {...props} />;
  if (settings.style === "turtle") return <TurtleCursor {...props} />;
  if (settings.style === "jellyfish") return <JellyfishCursor {...props} />;
  if (settings.style === "jellysprite") return <JellySpriteCursor {...props} />;
  return <DragonCursor {...props} />;
}

export default CursorOverlay;
