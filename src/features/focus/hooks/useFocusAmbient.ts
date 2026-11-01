"use client";

import { useEffect } from "react";

import {
  type AmbientId,
  setAmbientVolume,
  startAmbient,
  stopAmbient,
} from "@/features/focus/lib/sound";

/**
 * Keep the focus-channel soundscape in step with the timer: it plays while
 * `active` (a focus block is running) and fades out the moment it isn't — pause,
 * reset, a break, time up, leaving the page. Choosing another soundscape swaps it;
 * the volume moves without a restart.
 *
 * Starting needs a user gesture to unlock audio; the Start button that sets
 * `active` is one (the timer calls initAudio there). A timer restored from a
 * reload has no gesture yet, so its sound begins on the first tap.
 */
export function useFocusAmbient(active: boolean, id: AmbientId, volume: number) {
  useEffect(() => {
    if (!active || id === "off") return;
    startAmbient(id, { channel: "focus", volume });
    return () => stopAmbient("focus");
    // The volume is applied by the effect below, so changing it must not restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, id]);

  useEffect(() => {
    setAmbientVolume(volume, "focus");
  }, [volume]);
}
