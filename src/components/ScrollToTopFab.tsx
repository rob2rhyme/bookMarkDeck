"use client";

import { useEffect, useState } from "react";

import { ChevronUp } from "@/components/icons";

export function ScrollToTopFab() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 240);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Scroll to top"
      className="fixed bottom-6 right-6 z-[70] flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 shadow-lg shadow-black/30 backdrop-blur-md transition-transform duration-150 ease-out hover:border-blue-400/40 hover:bg-white/10 hover:shadow-blue-500/20 active:scale-95"
    >
      <ChevronUp className="h-6 w-6" />
    </button>
  );
}
