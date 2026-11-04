"use client";
/* eslint-disable @next/next/no-img-element */

import { Modal } from "@/components/Modal";
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
  onRequestOpenMenu: () => void;
  onRequestClose: () => void;
  onForceClose: () => void;
  onOpen: () => void | Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
};

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10;
const CARD_WIDTH = 248;
/** The card's rendered height; measured at runtime, this is only the first-paint seed. */
const CARD_HEIGHT_ESTIMATE = 132;
const EDGE_PADDING = 12;

/**
 * Every shortcut renders the same card, so the first one to mount can share its real
 * height with the rest. Used only to pick a side — the card is anchored to the tile
 * edge, so an off-by-a-few estimate can never open a gap between the two.
 */
let measuredCardHeight: number | null = null;

type HoverCardPosition = {
  left: number;
  /** Distance from the viewport top ("below") or bottom ("above"). */
  offset: number;
  placement: "below" | "above";
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
  onRequestOpenMenu,
  onRequestClose,
  onForceClose,
  onOpen,
  onEdit,
  onDelete,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const openCardHeightRef = useRef(CARD_HEIGHT_ESTIMATE);
  const activeRef = useRef(active);
  const pinnedRef = useRef(pinned);
  const lastPointerTypeRef = useRef<string>("mouse");
  const closeTimeoutRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);

  const [iconLoadErrorFor, setIconLoadErrorFor] = useState<string | null>(null);
  const [cardPosition, setCardPosition] = useState<HoverCardPosition>({
    left: 0,
    offset: 0,
    placement: "below",
  });
  const [pointerInsideRegion, setPointerInsideRegion] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  const iconIsUrl =
    typeof app.icon === "string" &&
    (app.icon.startsWith("http://") || app.icon.startsWith("https://"));
  const favicon = getFaviconUrl(app.url);
  const iconUrl = iconIsUrl ? app.icon : favicon;
  const iconLoadError = iconUrl ? iconLoadErrorFor === iconUrl : false;
  const initial = firstLetterFromUrlOrName(app.url, app.name);

  const clearCloseTimer = () => {
    if (closeTimeoutRef.current === null) return;
    window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = null;
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current === null) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const queueClose = () => {
    clearCloseTimer();
    closeTimeoutRef.current = window.setTimeout(() => {
      setPointerInsideRegion(false);
      // Read through refs: by the time this fires the pointer may have moved on to a
      // neighbouring tile, and closing on a stale `active` would shut *its* card.
      if (!activeRef.current || pinnedRef.current) return;
      onRequestClose();
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

    return app.url || "No URL configured";
  }, [app]);

  const updateCardPosition = () => {
    // Anchor to the wrapper, not the button: the button lifts on hover
    // (`hover:-translate-y-0.5`), the wrapper's box never moves.
    const anchor = wrapperRef.current;
    if (!anchor) return;

    // Seeded only while the card is off screen; scroll/resize repositioning then reuses
    // it, so a freshly measured height can never re-flip a card the pointer is already
    // travelling towards. The refined value takes effect on the next open.
    if (!cardRef.current) openCardHeightRef.current = measuredCardHeight ?? CARD_HEIGHT_ESTIMATE;
    const cardHeight = openCardHeightRef.current;

    const rect = anchor.getBoundingClientRect();
    // `getBoundingClientRect` and a fixed box's containing block share the same
    // origin and both exclude scrollbars — `window.inner*` does not, and an
    // off-by-a-scrollbar `bottom` would put the gap straight back.
    const root = document.documentElement;
    const viewportWidth = root.clientWidth || window.innerWidth;
    const viewportHeight = root.clientHeight || window.innerHeight;

    const centeredLeft = rect.left + rect.width / 2 - CARD_WIDTH / 2;
    const clampedLeft = Math.min(
      Math.max(centeredLeft, EDGE_PADDING),
      Math.max(EDGE_PADDING, viewportWidth - CARD_WIDTH - EDGE_PADDING)
    );

    const roomBelow = viewportHeight - EDGE_PADDING - rect.bottom;
    const roomAbove = rect.top - EDGE_PADDING;
    const placement: HoverCardPosition["placement"] =
      roomBelow >= cardHeight || roomBelow >= roomAbove ? "below" : "above";

    // The card sits flush against the tile edge in both directions, so the pointer
    // never has to cross a dead gap to reach it. A flipped card is pinned by its
    // `bottom` and grows upwards, which is what keeps it flush without having to
    // know its exact height. The clamp only ever pulls the card *over* the tile,
    // never away from it, so it cannot reopen a gap either.
    const maxOffset = Math.max(EDGE_PADDING, viewportHeight - EDGE_PADDING - cardHeight);
    const offset =
      placement === "below"
        ? Math.min(rect.bottom, maxOffset)
        : Math.min(viewportHeight - rect.top, maxOffset);

    setCardPosition({ left: clampedLeft, offset, placement });
  };

  useEffect(() => {
    activeRef.current = active;
    pinnedRef.current = pinned;
  }, [active, pinned]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    const update = () => setIsTouch(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!active || isTouch) return;

    updateCardPosition();

    // Recorded after this card is placed, so refining the estimate never moves a card
    // that is already on screen — it only sharpens the next open.
    const height = cardRef.current?.getBoundingClientRect().height ?? 0;
    if (height > 0) measuredCardHeight = height;

    const handleViewportChange = () => {
      updateCardPosition();
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [active, isTouch]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
      clearLongPress();
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      data-shortcut-hover-root="true"
      className="relative w-full max-w-[160px] justify-self-center"
      onPointerEnter={() => {
        if (isTouch) return;
        clearCloseTimer();
        setPointerInsideRegion(true);
        updateCardPosition();
        onRequestHoverOpen();
      }}
      onPointerLeave={() => {
        if (isTouch) return;
        queueClose();
      }}
      onFocusCapture={() => {
        if (isTouch) return;
        clearCloseTimer();
        updateCardPosition();
        onRequestHoverOpen();
      }}
      onBlurCapture={(event) => {
        if (isTouch) return;
        const next = event.relatedTarget as Node | null;
        if (next && wrapperRef.current?.contains(next)) return;
        queueClose();
      }}
    >
      <button
        type="button"
        onPointerDown={(event) => {
          lastPointerTypeRef.current = event.pointerType;
          const isTouchLike = event.pointerType === "touch" || event.pointerType === "pen";
          if (!isTouchLike) return;
          longPressFiredRef.current = false;
          pressStartRef.current = { x: event.clientX, y: event.clientY };
          clearLongPress();
          longPressTimerRef.current = window.setTimeout(() => {
            longPressFiredRef.current = true;
            hapticTap();
            onRequestOpenMenu();
          }, LONG_PRESS_MS);
        }}
        onPointerMove={(event) => {
          if (longPressTimerRef.current === null) return;
          const start = pressStartRef.current;
          if (!start) return;
          if (
            Math.abs(event.clientX - start.x) > MOVE_CANCEL_PX ||
            Math.abs(event.clientY - start.y) > MOVE_CANCEL_PX
          ) {
            clearLongPress();
          }
        }}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onClick={() => {
          const pointerType = lastPointerTypeRef.current;
          const isTouchLike = pointerType === "touch" || pointerType === "pen";

          if (isTouchLike) {
            if (longPressFiredRef.current) {
              longPressFiredRef.current = false;
              return;
            }
            hapticTap();
            void onOpen();
            return;
          }

          hapticTap();
          onRequestTogglePinned(pointerInsideRegion);
        }}
        className="relative flex aspect-square w-full select-none items-center justify-center overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/70 text-slate-100 shadow-sm ring-1 ring-white/5 transition [-webkit-touch-callout:none] hover:-translate-y-0.5 hover:border-blue-500/60 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-95"
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
      </button>

      {active && !isTouch && (
        <div
          ref={cardRef}
          className="fixed z-[70] w-[248px] rounded-2xl border border-slate-800 bg-slate-950/95 p-3 shadow-2xl ring-1 ring-white/5"
          style={
            cardPosition.placement === "below"
              ? { left: `${cardPosition.left}px`, top: `${cardPosition.offset}px` }
              : { left: `${cardPosition.left}px`, bottom: `${cardPosition.offset}px` }
          }
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

      {active && isTouch && (
        <Modal
          open
          onClose={onForceClose}
          label={`Shortcut actions for ${app.name}`}
          overlayClassName="inset-0 flex items-center justify-center p-4"
          panelClassName="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-2xl ring-1 ring-white/5 outline-none"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-900 text-sm font-semibold text-slate-100">
              {iconUrl && !iconLoadError ? (
                <img
                  src={iconUrl}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 object-contain"
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
              <p className="truncate text-sm font-semibold text-slate-100">{app.name}</p>
              <p className="truncate text-xs text-slate-400">{hostOrTarget}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                hapticTap();
                onForceClose();
                void onOpen();
              }}
              className="flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/70 px-2 py-3 text-slate-100 transition active:scale-95"
              aria-label={`Open ${app.name}`}
              role="menuitem"
            >
              <ExternalLink className="h-5 w-5" />
              <span className="text-xs font-semibold">Open</span>
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                hapticTap();
                onForceClose();
                onEdit();
              }}
              className="flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/70 px-2 py-3 text-slate-100 transition active:scale-95"
              aria-label={`Edit ${app.name}`}
              role="menuitem"
            >
              <Pencil className="h-5 w-5" />
              <span className="text-xs font-semibold">Edit</span>
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                hapticTap();
                onForceClose();
                onDelete();
              }}
              className="flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/70 px-2 py-3 text-red-300 transition active:scale-95"
              aria-label={`Delete ${app.name}`}
              role="menuitem"
            >
              <Trash className="h-5 w-5" />
              <span className="text-xs font-semibold">Delete</span>
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
