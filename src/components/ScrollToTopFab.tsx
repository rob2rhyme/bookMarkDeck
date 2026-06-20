"use client";

import { useEffect, useState } from "react";

import { ChevronUp } from "@/components/icons";

const RADIUS = 23;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ScrollToTopFab() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setVisible(y > 240);
      setProgress(max > 0 ? Math.min(1, y / max) : 0);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      className={`fixed bottom-6 right-6 z-[70] transition-opacity duration-200 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div className="relative h-[52px] w-[52px]">
        {/* Scroll-progress ring */}
        <svg
          viewBox="0 0 52 52"
          className="absolute inset-0 -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="26"
            cy="26"
            r={RADIUS}
            fill="none"
            strokeWidth="2.5"
            className="stroke-white/10"
          />
          <circle
            cx="26"
            cy="26"
            r={RADIUS}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            className="stroke-blue-400 transition-[stroke-dashoffset] duration-150 ease-out"
          />
        </svg>
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label={`Scroll to top (${Math.round(progress * 100)}% scrolled)`}
          className="absolute inset-1 flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 shadow-lg shadow-black/30 backdrop-blur-md transition hover:border-blue-400/40 hover:bg-white/10 active:scale-95"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
