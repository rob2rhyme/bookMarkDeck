// The on-device OCR engine (Tesseract.js), kept out of the pure/testable
// receipt parser. Dynamically imported so its worker + WASM only load when the
// user actually scans a receipt — nothing ships in the initial bundle, and
// nothing leaves the device (the model is fetched once, the image is not).

import { parseReceiptText, type ReceiptFields } from "@/features/inventory/lib/receiptOcr";
import { parseLabelText, type LabelFields } from "@/features/inventory/lib/labelScan";

/** Recognize text in an image (data: URL) and parse the receipt fields from it.
 *  Throws if the engine can't load or run (caller degrades to manual entry). */
export async function runReceiptOcr(imageDataUrl: string): Promise<ReceiptFields> {
  const { recognize } = await import("tesseract.js");
  const result = await recognize(imageDataUrl, "eng");
  return parseReceiptText(result?.data?.text ?? "");
}

/** Recognize text on a product / its label and suggest a name (+ brand).
 *  Same on-device engine as the receipt scan; nothing leaves the device. */
export async function runLabelOcr(imageDataUrl: string): Promise<LabelFields> {
  const { recognize } = await import("tesseract.js");
  const result = await recognize(imageDataUrl, "eng");
  return parseLabelText(result?.data?.text ?? "");
}
