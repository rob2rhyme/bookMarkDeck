"use client";

// Reusable modal primitive: overlay-click + Escape to close, body scroll lock,
// a focus trap (Tab cycles within, focus restored on close), and proper
// role="dialog" / aria-modal semantics. Replaces ad-hoc inline modals.

import { useCallbackRef } from "@/hooks/useCallbackRef";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** id of the element labelling the dialog (for aria-labelledby). */
  labelledBy?: string;
  /** Fallback accessible name when there's no visible labelled heading. */
  label?: string;
  /** Classes for the panel (sizing/spacing). */
  panelClassName?: string;
  /** Overrides the overlay's layout (alignment + padding) only; the fixed
   *  positioning, backdrop, and fade stay constant. Lets a dialog go full-bleed
   *  (e.g. a full-screen mobile sheet) without affecting other modals. */
  overlayClassName?: string;
};

// Open modals. Their key handlers all sit on `document`, so with two open (Add
// link → New folder) a single Escape would close both; only the topmost acts on a
// key. Topmost = nested deepest in React's tree (a dialog rendered inside another's
// children, like a photo viewer in a detail view, is on top of it even though both
// mount in the same commit and the child's effect runs first), then the one that
// opened last. Depth travels by context, which crosses portals.
type OpenModal = { id: number; depth: number };
const openModals: OpenModal[] = [];
let nextModalId = 0;
const ModalDepth = createContext(0);

function isTopmost(id: number): boolean {
  let top: OpenModal | null = null;
  for (const m of openModals) {
    if (!top || m.depth > top.depth || (m.depth === top.depth && m.id > top.id)) top = m;
  }
  return top?.id === id;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  children,
  labelledBy,
  label,
  panelClassName,
  overlayClassName,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useCallbackRef(onClose);
  const depth = useContext(ModalDepth);
  // What had focus when the dialog opened — recorded while rendering, before React
  // commits. A field inside with `autoFocus` takes focus during the commit, ahead
  // of any effect, so an effect would record that field (about to be removed) and
  // focus would fall to <body> on close. State adjusted during render is how React
  // lets a component note something at the moment a prop changes.
  const [from, setFrom] = useState<{ open: boolean; el: HTMLElement | null }>({ open: false, el: null });
  if (open !== from.open) {
    setFrom({
      open,
      el: open && typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null,
    });
  }

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = from.el;

    // Lock body scroll. iOS Safari ignores overflow:hidden on <body> and
    // keeps routing touch pans to the page behind the overlay — making the
    // sheet's own scroller feel dead — so pin the body with position:fixed
    // (the reliable cross-browser lock) and restore the scroll spot on close.
    const scrollY = window.scrollY;
    const body = document.body.style;
    const prevBody = {
      overflow: body.overflow,
      position: body.position,
      top: body.top,
      left: body.left,
      right: body.right,
      width: body.width,
    };
    body.overflow = "hidden";
    body.position = "fixed";
    body.top = `-${scrollY}px`;
    body.left = "0";
    body.right = "0";
    body.width = "100%";

    // Focus the first focusable element (or the panel itself) — unless focus is
    // already inside, which means a field asked for it with `autoFocus`; that
    // is the field the dialog is for, not whichever button comes first.
    const panel = panelRef.current;
    if (!panel?.contains(document.activeElement)) {
      const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel)?.focus();
    }

    const id = ++nextModalId;
    openModals.push({ id, depth });

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTopmost(id)) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const at = openModals.findIndex((m) => m.id === id);
      if (at >= 0) openModals.splice(at, 1);
      Object.assign(document.body.style, prevBody);
      window.scrollTo(0, scrollY);
      // preventScroll: refocusing the opener must not yank the page back to
      // it — we just restored the user's scroll spot.
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, onCloseRef, depth, from.el]);

  if (!open || typeof document === "undefined") return null;

  // Portal to <body> so the overlay's z-[70] isn't trapped inside AppShell's
  // stacking context (its content wrapper is `relative z-10`, and the fixed
  // bottom nav is z-40) — otherwise the nav would paint over the modal footer.
  return createPortal(
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`animate-bd-fade-in fixed z-[70] bg-black/60 backdrop-blur-sm ${
        overlayClassName ?? "inset-0 flex items-center justify-center px-4 py-[5vh]"
      }`}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        // overscroll-contain: when a scrollable panel hits its edge, don't
        // hand the gesture to the page behind (part of the iOS scroll fix).
        className={`${
          panelClassName ??
          "w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
        } animate-bd-scale-in overscroll-contain`}
      >
        <ModalDepth.Provider value={depth + 1}>{children}</ModalDepth.Provider>
      </div>
    </div>,
    document.body
  );
}

export default Modal;
