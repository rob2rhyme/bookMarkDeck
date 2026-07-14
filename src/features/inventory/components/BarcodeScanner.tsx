"use client";

import { useEffect, useRef, useState } from "react";

import { X } from "@/components/icons";
import { useCallbackRef } from "@/hooks/useCallbackRef";

type BarcodeScannerProps = {
  /** Called once with the first code read; the parent then hides the scanner. */
  onDetect: (code: string) => void;
  onCancel: () => void;
};

// Common retail + generic symbologies. Chromium's BarcodeDetector supports all
// of these; unsupported browsers never render this component (feature-gated).
const FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "qr_code",
] as const;

type DetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue?: string }[]>;
};

/**
 * Full-screen camera overlay that reads a barcode via the `BarcodeDetector`
 * API and reports the first hit. Deliberately NOT a shared Modal — it manages
 * its own overlay so it can stack above the item form without a competing focus
 * trap. The camera stream is always stopped on unmount (or on detect/cancel, via
 * the parent hiding it), so the camera never stays live.
 */
export function BarcodeScanner({ onDetect, onCancel }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onDetectRef = useCallbackRef(onDetect);
  const [error, setError] = useState<"unsupported" | "camera" | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    const stop = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };

    (async () => {
      const Ctor = (window as unknown as { BarcodeDetector?: new (o: { formats: readonly string[] }) => DetectorLike }).BarcodeDetector;
      if (!Ctor) {
        setError("unsupported");
        return;
      }
      let detector: DetectorLike;
      try {
        detector = new Ctor({ formats: FORMATS });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch {
        setError("camera");
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* autoplay can reject silently; the frame loop still works */
      }
      const tick = async () => {
        if (stopped) return;
        try {
          const codes = await detector.detect(video);
          const value = codes?.[0]?.rawValue;
          if (value && value.trim()) {
            stop();
            onDetectRef(value.trim());
            return;
          }
        } catch {
          /* transient detect errors between frames — keep scanning */
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();

    return stop;
  }, [onDetectRef]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3 text-slate-100">
        <span className="text-sm font-medium">Scan a barcode</span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel scan"
          className="rounded-md p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <div className="max-w-xs px-6 text-center">
            <p className="text-sm text-slate-200">
              {error === "unsupported"
                ? "This browser can’t scan barcodes."
                : "Couldn’t reach the camera."}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Type the code into the Barcode field instead.
            </p>
            <button
              type="button"
              onClick={onCancel}
              className="mt-4 rounded-full border border-slate-600 px-4 py-1.5 text-sm text-slate-200 transition hover:border-slate-400"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-40 w-64 rounded-xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            <p className="absolute bottom-6 left-0 right-0 text-center text-xs text-slate-300">
              Point the camera at a barcode.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default BarcodeScanner;
