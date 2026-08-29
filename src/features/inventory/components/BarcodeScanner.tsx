"use client";

import { useEffect, useRef, useState } from "react";

import { X } from "@/components/icons";
import { useCallbackRef } from "@/hooks/useCallbackRef";
import {
  createBarcodeDetector,
  type BarcodeDetectorLike,
} from "@/features/inventory/lib/barcodeEngine";

type BarcodeScannerProps = {
  /** Called once with the first code read; the parent then hides the scanner. */
  onDetect: (code: string) => void;
  onCancel: () => void;
};

/**
 * Full-screen camera overlay that reads a barcode on-device and reports the
 * first hit. Uses the native `BarcodeDetector` on Chromium and a lazily-loaded
 * ZXing-WASM ponyfill elsewhere (iOS Safari / Firefox), so it works across
 * browsers. Deliberately NOT a shared Modal — it manages its own overlay so it
 * can stack above the item form without a competing focus trap. The camera
 * stream is always stopped on unmount (or on detect/cancel), so it never stays
 * live.
 */
export function BarcodeScanner({ onDetect, onCancel }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onDetectRef = useCallbackRef(onDetect);
  const [error, setError] = useState<"unsupported" | "camera" | null>(null);
  const [ready, setReady] = useState(false);

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
      let detector: BarcodeDetectorLike;
      try {
        // May download the WASM ponyfill on first use (iOS/Firefox).
        detector = await createBarcodeDetector();
      } catch {
        setError("unsupported");
        return;
      }
      if (stopped) return;
      try {
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
      if (!stopped) setReady(true);
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
          className="rounded-md p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-slate-50"
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
              {ready ? "Point the camera at a barcode." : "Preparing scanner…"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default BarcodeScanner;
