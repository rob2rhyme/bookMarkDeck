"use client";

// QR generation, dynamically imported so the `qrcode` lib only loads when the
// user actually prints labels — nothing ships in the initial bundle.

/** Render `text` to a crisp, print-ready inline SVG string. */
export async function qrSvg(text: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toString(text, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
}
