"use client";

// Sticky, horizontally-scrollable quick-nav that jumps to in-page sections and
// highlights the one currently in view. Generic — pass the section ids/labels;
// each target should carry a matching `id` and some `scroll-mt-*` so it isn't
// tucked under the sticky bar. Honours prefers-reduced-motion for the scroll.

import { useEffect, useRef, useState } from "react";

export type SectionNavItem = { id: string; label: string };

export function SectionNav({
  items,
  className = "",
}: {
  items: SectionNavItem[];
  className?: string;
}) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);
  const navRef = useRef<HTMLElement | null>(null);
  // True while a tap-driven scroll is animating — suppresses the observer so the
  // active chip doesn't churn through every section mid-flight (the flicker).
  const programmatic = useRef(false);
  const rafId = useRef<number | null>(null);

  // Track which section is in view (top-most visible wins).
  useEffect(() => {
    if (items.length === 0) return;
    const targets = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (targets.length === 0) return;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        if (programmatic.current) return; // ignore while we animate a jump
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.intersectionRatio);
          else visible.delete(e.target.id);
        }
        // Pick the section nearest the top that's currently visible.
        let best: string | null = null;
        let bestTop = Infinity;
        for (const id of visible.keys()) {
          const top = document.getElementById(id)?.getBoundingClientRect().top ?? Infinity;
          if (top < bestTop) {
            bestTop = top;
            best = id;
          }
        }
        if (best) setActive(best);
      },
      { rootMargin: "-72px 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [items]);

  // Center the active chip within the strip — manual scrollLeft only, never
  // scrollIntoView (which on iOS scrolls the *page* too and fights the jump).
  useEffect(() => {
    const nav = navRef.current;
    if (!active || !nav) return;
    const chip = nav.querySelector<HTMLElement>(
      `[data-section-chip="${active}"]`
    );
    if (!chip) return;
    nav.scrollLeft = chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2;
  }, [active]);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setActive(id);
    // Animate document.scrollingElement.scrollTop directly with rAF. Native
    // smooth scrolling (scrollIntoView / scrollTo{behavior:'smooth'}) silently
    // no-ops in iOS standalone PWAs, so we drive the scroll ourselves.
    const scroller =
      (document.scrollingElement as HTMLElement | null) ??
      document.documentElement;
    const navH = navRef.current?.offsetHeight ?? 56;
    const startY = scroller.scrollTop;
    const targetY = Math.max(
      0,
      el.getBoundingClientRect().top + startY - navH - 8
    );
    const dist = targetY - startY;
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduce || Math.abs(dist) < 4) {
      // `jump` only ever runs from a chip's onClick, never during render — the
      // rule can't see that. The identical write inside `step` below sits in a
      // callback, so it isn't flagged.
      // eslint-disable-next-line react-hooks/immutability
      scroller.scrollTop = targetY;
      return;
    }
    programmatic.current = true;
    const duration = 420;
    let startTs: number | null = null;
    const step = (ts: number) => {
      if (startTs === null) startTs = ts;
      const p = Math.min(1, (ts - startTs) / duration);
      const eased = 0.5 - Math.cos(p * Math.PI) / 2; // easeInOutSine
      // Round to whole pixels — fractional scrollTop jitters/flickers on iOS.
      scroller.scrollTop = Math.round(startY + dist * eased);
      if (p < 1) {
        rafId.current = requestAnimationFrame(step);
      } else {
        rafId.current = null;
        // Release the observer a beat later so momentum settling doesn't
        // immediately re-snap the active chip.
        setTimeout(() => {
          programmatic.current = false;
        }, 120);
      }
    };
    rafId.current = requestAnimationFrame(step);
  };

  if (items.length === 0) return null;

  return (
    <nav
      ref={navRef}
      aria-label="Sections"
      className={`bd-no-scrollbar sticky top-0 z-30 flex gap-2 overflow-x-auto rounded-xl border border-slate-800/70 bg-slate-950 px-2 py-2 ${className}`}
    >
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            data-section-chip={item.id}
            aria-current={isActive ? "true" : undefined}
            onClick={() => jump(item.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              isActive
                ? "border-blue-400/60 bg-blue-500/15 text-blue-200"
                : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

export default SectionNav;
