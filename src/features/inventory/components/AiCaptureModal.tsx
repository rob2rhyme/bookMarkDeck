"use client";

import { useEffect, useRef, useState } from "react";

import { Modal } from "@/components/Modal";
import { X } from "@/components/icons";
import {
  AI_CAPTURE_MAX_EDGE,
  type AiProduct,
} from "@/features/inventory/lib/aiCapture";
import type { ItemPhoto } from "@/features/inventory/lib/types";
import { compressImageFile } from "@/features/inventory/lib/image";
import { formatMoney } from "@/features/inventory/lib/value";

type AiCaptureModalProps = {
  open: boolean;
  defaultCurrency: string;
  /** "Already bought" — hand the guess (+ the photo) to the add-item form. */
  onAlreadyBought: (p: AiProduct, photo: ItemPhoto | null) => void;
  /** "Want it" — save it straight onto the wishlist (photo = its thumbnail). */
  onAddToWishlist: (p: AiProduct, photo: ItemPhoto | null) => void;
  onClose: () => void;
};

type Phase = "pick" | "identifying" | "result" | "miss" | "error";

const ERROR_COPY: Record<string, string> = {
  ai_unconfigured:
    "AI capture isn't set up on this deployment yet — add ANTHROPIC_API_KEY (see .env.example) and redeploy.",
  rate_limited: "The AI is busy right now — try again in a minute.",
  too_large: "That photo is too large — try again; it should compress smaller.",
  bad_image: "That photo couldn't be read — try another one.",
};

/**
 * AI capture: snap/choose a photo → Claude vision names the product → send it
 * to the Wishlist ("want it") or the add-item form ("already bought"). The
 * photo is compressed on-device first and sent once for the identification
 * call; the app never stores it server-side.
 */
export function AiCaptureModal({
  open,
  defaultCurrency,
  onAlreadyBought,
  onAddToWishlist,
  onClose,
}: AiCaptureModalProps) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [photo, setPhoto] = useState<ItemPhoto | null>(null);
  const [product, setProduct] = useState<AiProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ignore in-flight results after a retake/close.
  const runRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    runRef.current++;
    setPhase("pick");
    setPhoto(null);
    setProduct(null);
    setError(null);
  }, [open]);

  const reset = () => {
    runRef.current++;
    setPhase("pick");
    setPhoto(null);
    setProduct(null);
    setError(null);
  };

  const identify = async (file: File) => {
    const run = ++runRef.current;
    setError(null);
    setProduct(null);
    setPhase("identifying");
    try {
      const c = await compressImageFile(file, {
        maxEdge: AI_CAPTURE_MAX_EDGE,
        quality: 0.55,
      });
      if (run !== runRef.current) return;
      const shot: ItemPhoto = {
        id: crypto.randomUUID(),
        url: c.dataUrl,
        w: c.w,
        h: c.h,
      };
      setPhoto(shot);
      const res = await fetch("/api/inventory/ai-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: c.dataUrl, currency: defaultCurrency }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        found?: boolean;
        product?: AiProduct;
        error?: string;
      };
      if (run !== runRef.current) return;
      if (json.ok && json.found && json.product?.name) {
        setProduct(json.product);
        setPhase("result");
      } else if (json.ok) {
        setPhase("miss");
      } else {
        setError(
          ERROR_COPY[json.error ?? ""] ??
            "Couldn't identify the photo — check your connection and try again."
        );
        setPhase("error");
      }
    } catch (e) {
      if (run !== runRef.current) return;
      setError(
        e instanceof Error && /image|photo/i.test(e.message)
          ? e.message
          : "Couldn't identify the photo — check your connection and try again."
      );
      setPhase("error");
    }
  };

  const pickButton = (label: string) => (
    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-950/40 px-4 py-8 text-sm font-medium text-slate-300 transition hover:border-violet-400 hover:text-violet-300">
      ✨ {label}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) identify(file);
        }}
      />
    </label>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="ai-capture-title"
      overlayClassName="inset-0 flex items-stretch justify-center sm:items-center sm:px-4 sm:py-[5vh]"
      panelClassName="flex w-full flex-col max-h-[100dvh] overflow-y-auto overflow-x-hidden bg-slate-900 p-4 shadow-2xl outline-none sm:block sm:max-w-md sm:max-h-[88vh] sm:rounded-2xl sm:border sm:border-slate-800 sm:p-6"
    >
      <div className="flex items-center justify-between max-sm:sticky max-sm:-top-4 max-sm:z-10 max-sm:-mx-4 max-sm:-mt-4 max-sm:border-b max-sm:border-slate-800/70 max-sm:bg-slate-900/95 max-sm:px-4 max-sm:pb-2.5 max-sm:pt-4 max-sm:backdrop-blur">
        <h2 id="ai-capture-title" className="text-lg font-semibold text-slate-50">
          ✨ AI capture
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {photo && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo.url}
            alt="Captured product"
            className="mx-auto max-h-52 w-auto max-w-full rounded-xl border border-slate-800 object-contain"
          />
        )}

        {phase === "pick" && (
          <>
            {pickButton("Snap or choose a photo")}
            <p className="text-xs text-slate-500">
              Point at the product — the AI names it, guesses a category and a
              rough price, then you decide: wishlist it or add it to My Stuff.
            </p>
          </>
        )}

        {phase === "identifying" && (
          <p className="animate-pulse rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-6 text-center text-sm text-slate-300">
            Identifying…
          </p>
        )}

        {phase === "result" && product && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <p className="font-semibold text-slate-50">{product.name}</p>
            {(product.brand || product.category) && (
              <p className="mt-0.5 text-sm text-slate-400">
                {[product.brand, product.category].filter(Boolean).join(" · ")}
              </p>
            )}
            {product.estPrice != null && (
              <p className="mt-1 text-sm text-slate-300">
                ≈ {formatMoney(product.estPrice, defaultCurrency)}{" "}
                <span className="text-slate-500">(AI estimate)</span>
              </p>
            )}
            {product.description && (
              <p className="mt-2 text-sm text-slate-400">{product.description}</p>
            )}
            <p className="mt-3 text-[11px] text-slate-500">
              An AI guess — you can edit everything before it's saved.
            </p>
          </div>
        )}

        {phase === "miss" && (
          <>
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Couldn't recognize a product — try a closer, well-lit photo.
            </p>
            {pickButton("Try another photo")}
          </>
        )}

        {phase === "error" && error && (
          <>
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </p>
            {pickButton("Try again")}
          </>
        )}

        {phase === "result" && product && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => onAlreadyBought(product, photo)}
              className="flex-1 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              ✓ Already bought — add to My Stuff
            </button>
            <button
              type="button"
              onClick={() => onAddToWishlist(product, photo)}
              className="flex-1 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-pink-400 hover:text-pink-300"
            >
              ♡ Add to Wishlist
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
            >
              Retake
            </button>
          </div>
        )}

        <p className="text-[11px] text-slate-500">
          The photo is compressed on your device and sent once to the AI service
          to identify it — this app doesn't store it on any server.
        </p>
      </div>
    </Modal>
  );
}
