"use client";

import { useEffect, useState } from "react";

/**
 * Whether this browser can scan a barcode from the camera. Only camera access
 * (`getUserMedia`, needs a secure context) is required now — detection itself
 * is guaranteed by the ZXing-WASM ponyfill on browsers without a native
 * `BarcodeDetector` (iOS Safari / Firefox). Hydration-safe: false on the server
 * and first render, resolved after mount. Manual entry always stays available.
 */
export function useBarcodeSupported(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        typeof navigator.mediaDevices?.getUserMedia === "function"
    );
  }, []);
  return supported;
}
