"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";

import { ExternalLink, Pencil, Trash } from "@/components/icons";
import { ShortcutApp } from "@/types/shortcut";
import { hapticTap } from "@/utils/haptics";

type Props = {
  app: ShortcutApp;
  active: boolean;
  pinned: boolean;
  onRequestHoverOpen: () => void;
  onRequestTogglePinned: (keepOpenWhenUnpinned: boolean) => void;
  onRequestClose: () => void;
  onOpen: () => void | Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
};

type HoverCardPosition = {
  left: number;
  top: number;
};

function getFaviconUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname;
    if (!host || !host.includes(".")) return null;
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`;
  } catch {
    try {
      const url = new URL(`https://${rawUrl}`);
      const host = url.hostname;
      if (!host || !host.includes(".")) return null;
      return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`;
    } catch {
      return null;
    }
  }
}

function firstLetterFromUrlOrName(url: string, name: string): string {
  const extract = (value: string) => {
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.replace(/^www\./i, "");
      return host[0]?.toUpperCase() ?? "";
    } catch {
      return "";
    }
  };

  const fromUrl = extract(url) || extract(`https://${url}`);
  if (fromUrl) return fromUrl;
  return name.trim()[0]?.toUpperCase() ?? "A";
}

export function ShortcutIcon({
  app,
  active,
  pinned,
  onRequestHoverOpen,
  onRequestTogglePinned,
  onRequestClose,
  onOpen,
  onEdit,
  onDelete,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const iconButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastPointerTypeRef = useRef<string>("mouse");
  const closeTimeoutRef = useRef<number | null>(null);

  const [iconLoadErrorFor, setIconLoadErrorFor] = useState<string | null>(null);
  const [cardPosition, setCardPosition] = useState<HoverCardPosition>({ left: 0, top: 0 });
  const [pointerInsideRegion, setPointerInsideRegion] = useState(false);

  const iconIsUrl =
    typeof app.icon === "string" &&
    (app.icon.startsWith("http://") || app.icon.startsWith("https://"));
  const favicon = getFaviconUrl(app.url);
  const iconUrl = iconIsUrl ? app.icon : favicon;
  const iconLoadError = iconUrl ? iconLoadErrorFor === iconUrl : false;
  const initial = firstLetterFromUrlOrName(app.url, app.name);

  const hasNativeTarget =
    Boolean(app.localPath?.trim()) ||
    Boolean(app.bundleId?.trim()) ||
    Boolean(app.appUserModelId?.trim());
  const typeLabel = hasNativeTarget ? "Native" : "Web";
  const tileTypeBadge = hasNativeTarget ? "NATIVE" : "WEB";
  const tileBadgeClasses = hasNativeTarget
    ? "border-blue-400/30 bg-blue-500/15 text-blue-300"
    : "border-emerald-400/30 bg-emerald-500/15 text-emerald-300";

  const clearCloseTimer = () => {
    if (closeTimeoutRef.current === null) return;
    window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = null;
  };

  const queueClose = () => {
    clearCloseTimer();
    closeTimeoutRef.current = window.setTimeout(() => {
      setPointerInsideRegion(false);
      if (!pinned) onRequestClose();
    }, 140);
  };

  const hostOrTarget = useMemo(() => {
    if (app.url.trim()) {
      try {
        return new URL(app.url).hostname;
      } catch {
        return app.url;
      }
    }

    if (app.bundleId?.trim()) return app.bundleId.trim();
    if (app.appUserModelId?.trim()) return app.appUserModelId.trim();
    if (app.localPath?.trim()) return app.localPath.trim();
    return "No target configured";
  }, [app]);

  const updateCardPosition = () => {
    const iconButton = iconButtonRef.current;
    if (!iconButton) return;

    const cardWidth = 248;
    const cardHeight = 168;
    const edgePadding = 12;

    const rect = iconButton.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const centeredLeft = rect.left + rect.width / 2 - cardWidth / 2;
    const clampedLeft = Math.min(
      Math.max(centeredLeft, edgePadding),
      viewportWidth - cardWidth - edgePadding
    );

    const belowTop = rect.bottom;
    const aboveTop = rect.top - cardHeight;
    const shouldFlipAbove = belowTop + cardHeight > viewportHeight - edgePadding;
    const top = shouldFlipAbove
      ? Math.max(edgePadding, aboveTop)
      : Math.min(viewportHeight - edgePadding - cardHeight, belowTop);

    setCardPosition({ left: clampedLeft, top });
  };

  useEffect(() => {
    if (!active) return;

    updateCardPosition();

    const handleViewportChange = () => {
      updateCardPosition();
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [active]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      data-shortcut-hover-root="true"
      className="relative w-full max-w-[160px] justify-self-center"
      onPointerEnter={() => {
        clearCloseTimer();
        setPointerInsideRegion(true);
        onRequestHoverOpen();
      }}
      onPointerLeave={queueClose}
      onFocusCapture={() => {
        clearCloseTimer();
        onRequestHoverOpen();
      }}
      onBlurCapture={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && wrapperRef.current?.contains(next)) return;
        queueClose();
      }}
    >
      <button
        ref={iconButtonRef}
        type="button"
        onPointerDown={(event) => {
          lastPointerTypeRef.current = event.pointerType;
        }}
        onClick={() => {
          hapticTap();

          const pointerType = lastPointerTypeRef.current;
          const isTouchLike = pointerType === "touch" || pointerType === "pen";

          if (isTouchLike && active && pinned) {
            onRequestClose();
            return;
          }

          onRequestTogglePinned(pointerInsideRegion);
        }}
        className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/70 text-slate-100 shadow-sm ring-1 ring-white/5 transition hover:-translate-y-0.5 hover:border-blue-500/60 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-95"
        aria-label={`Shortcut: ${app.name}`}
        aria-expanded={active}
        aria-haspopup="menu"
      >
        {iconUrl && !iconLoadError ? (
          <img
            src={iconUrl}
            alt=""
            width={48}
            height={48}
            className="block h-[58%] w-[58%] max-h-16 max-w-16 rounded-lg object-contain"
            loading="lazy"
            onError={() => {
              if (iconUrl) setIconLoadErrorFor(iconUrl);
            }}
          />
        ) : app.icon ? (
          <span className="text-3xl" aria-hidden="true">
            {app.icon}
          </span>
        ) : (
          <span className="text-base font-semibold uppercase tracking-wide">{initial}</span>
        )}

        <span
          className={`pointer-events-none absolute right-2 top-2 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide backdrop-blur-sm ${tileBadgeClasses}`}
        >
          {tileTypeBadge}
        </span>
      </button>

      {active && (
        <div
          className="fixed z-[70] w-[248px] rounded-2xl border border-slate-800 bg-slate-950/95 p-3 shadow-2xl ring-1 ring-white/5"
          style={{ left: `${cardPosition.left}px`, top: `${cardPosition.top}px` }}
          role="menu"
          aria-label={`Shortcut actions for ${app.name}`}
          onPointerEnter={() => {
            clearCloseTimer();
            setPointerInsideRegion(true);
          }}
          onPointerLeave={queueClose}
        >
          <div className="mb-2 flex items-start gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-900 text-[11px] font-semibold text-slate-100">
              {iconUrl && !iconLoadError ? (
                <img
                  src={iconUrl}
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6 object-contain"
                  loading="lazy"
                  onError={() => {
                    if (iconUrl) setIconLoadErrorFor(iconUrl);
                  }}
                />
              ) : app.icon ? (
                <span aria-hidden="true">{app.icon}</span>
              ) : (
                <span>{initial}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-100">{app.name}</p>
              <p className="truncate text-[11px] text-slate-400">{hostOrTarget}</p>
            </div>
            <span className="shrink-0 rounded-full border border-slate-700 bg-slate-900/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200">
              {typeLabel}
            </span>
          </div>

          <div className="mb-2 h-px bg-slate-800" />

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                hapticTap();
                onRequestClose();
                void onOpen();
              }}
              className="flex flex-col items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/70 px-2 py-2 text-slate-100 transition hover:border-blue-500/60 hover:bg-slate-900 active:scale-95"
              aria-label={`Open ${app.name}`}
              role="menuitem"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="text-[11px] font-semibold">Open</span>
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                hapticTap();
                onRequestClose();
                onEdit();
              }}
              className="flex flex-col items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/70 px-2 py-2 text-slate-100 transition hover:border-blue-500/60 hover:bg-slate-900 active:scale-95"
              aria-label={`Edit ${app.name}`}
              role="menuitem"
            >
              <Pencil className="h-4 w-4" />
              <span className="text-[11px] font-semibold">Edit</span>
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                hapticTap();
                onRequestClose();
                onDelete();
              }}
              className="flex flex-col items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/70 px-2 py-2 text-slate-100 transition hover:border-red-500/70 hover:bg-red-900/20 active:scale-95"
              aria-label={`Delete ${app.name}`}
              role="menuitem"
            >
              <Trash className="h-4 w-4" />
              <span className="text-[11px] font-semibold">Delete</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
