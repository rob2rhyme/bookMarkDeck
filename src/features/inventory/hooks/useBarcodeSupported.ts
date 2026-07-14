"use client";

import { useEffect, useState } from "react";

/**
 * Whether this browser can scan a barcode from the camera — needs both the
 * `BarcodeDetector` API (Chromium; not Safari/Firefox yet) and camera access.
 * Hydration-safe: false on the server and first render, resolved after mount, so
 * the Scan affordance only appears where it actually works (manual entry always
 * stays available).
 */
export function useBarcodeSupported(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        "BarcodeDetector" in window &&
        typeof navigator !== "undefined" &&
        typeof navigator.mediaDevices?.getUserMedia === "function"
    );
  }, []);
  return supported;
}
