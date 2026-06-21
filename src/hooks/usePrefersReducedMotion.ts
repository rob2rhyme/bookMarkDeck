"use client";

import { useEffect, useState } from "react";

/**
 * Tracks the `prefers-reduced-motion: reduce` media query. Returns `false`
 * during SSR / before mount (motion is the safe default for hydration), then
 * reflects the live OS setting. Use to gate JS/SMIL-driven decorative motion
 * that CSS alone can't reach.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
