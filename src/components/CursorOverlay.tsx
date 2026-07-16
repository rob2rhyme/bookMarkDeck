"use client";

import { useEffect, useState } from "react";

import { DragonCursor } from "@/components/DragonCursor";
import { FishCursor } from "@/components/FishCursor";
import { JellyfishCursor } from "@/components/JellyfishCursor";
import { JellySpriteCursor } from "@/components/JellySpriteCursor";
import { LobsterCursor } from "@/components/LobsterCursor";
import { TurtleCursor } from "@/components/TurtleCursor";
import { useCursorSettings } from "@/lib/cursorSettings";

// Renders the chosen decorative cursor overlay with the user's full settings.
export function CursorOverlay() {
  const { settings } = useCursorSettings();
  // Only render where there's a pointer to follow. On touch-only devices no
  // mousemove ever fires, so the creature would sit frozen over the content —
  // a sticker, not a companion. Effect-gated so SSR/hydration stay stable.
  const [finePointer, setFinePointer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setFinePointer(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (settings.style === "off" || !finePointer) return null;

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
    tailSpeed: settings.tailSpeed,
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
  if (settings.style === "lobster") return <LobsterCursor {...props} />;
  return <DragonCursor {...props} />;
}

export default CursorOverlay;
