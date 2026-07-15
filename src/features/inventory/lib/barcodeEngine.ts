"use client";

// Barcode detection engine. Uses the browser's native BarcodeDetector on
// Chromium; on iOS Safari / Firefox (no native support) it lazily loads a
// ZXing-WASM ponyfill — the SAME lazy pattern as the receipt OCR, so the WASM
// only downloads when a non-supporting browser actually opens the scanner and
// nothing ships in the initial bundle. Detection runs on-device; images never
// leave the browser.

export const BARCODE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "qr_code",
] as const;

export type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue?: string }[]>;
};

type DetectorCtor = new (opts: {
  formats: readonly string[];
}) => BarcodeDetectorLike;

/**
 * Resolve a BarcodeDetector: native when present, else the ZXing-WASM ponyfill
 * (dynamically imported). Throws only if the ponyfill itself fails to load.
 */
export async function createBarcodeDetector(): Promise<BarcodeDetectorLike> {
  const native = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (native) return new native({ formats: BARCODE_FORMATS });
  const mod = await import("barcode-detector/ponyfill");
  const Ponyfill = mod.BarcodeDetector as unknown as DetectorCtor;
  return new Ponyfill({ formats: BARCODE_FORMATS });
}
