"use client";

import { useCallback, useEffect, useState } from "react";

const QUOTES = [
  { text: "Progress, not perfection. One function at a time.", author: null },
  { text: "The only way to go fast is to go well.", author: "Robert C. Martin" },
  { text: "Momentum builds in 25-minute chunks. Start the clock.", author: null },
  {
    text: "You don't have to be great to start, but you have to start to be great.",
    author: null,
  },
  {
    text: "Every expert was once a beginner staring at a blank file.",
    author: null,
  },
  { text: "Shipping something beats perfecting nothing.", author: null },
  {
    text: "Small steps every day outpace big leaps every month.",
    author: null,
  },
  {
    text: "Context switching is the enemy. Close the tabs. Do the work.",
    author: null,
  },
  {
    text: "Distraction is a habit. So is focus. Train the better one.",
    author: null,
  },
  {
    text: "Don't watch the clock; do what it does. Keep going.",
    author: "Sam Levenson",
  },
];

export function QuoteBox() {
  // Deterministic first render (index 0) → pick a random one after mount to
  // avoid a hydration mismatch.
  const [idx, setIdx] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    setIdx(Math.floor(Math.random() * QUOTES.length));
  }, []);

  const next = useCallback(() => {
    setFading(true);
    setTimeout(() => {
      setIdx((i) => (i + 1) % QUOTES.length);
      setFading(false);
    }, 200);
  }, []);

  const quote = QUOTES[idx];

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-6 shadow-sm sm:p-8">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Need a push?
      </h3>
      <div
        className={`border-l-[3px] border-violet-500/70 pl-4 transition-opacity duration-200 ${
          fading ? "opacity-0" : "opacity-100"
        }`}
      >
        <p className="text-[15px] italic leading-relaxed text-slate-200">
          “{quote.text}”
        </p>
        {quote.author && (
          <p className="mt-1.5 text-xs text-slate-500">— {quote.author}</p>
        )}
      </div>
      <button
        type="button"
        onClick={next}
        className="mt-4 rounded-lg border border-slate-700 px-3.5 py-1.5 text-[13px] text-slate-300 transition hover:border-slate-500 hover:bg-slate-800/60"
      >
        New quote ↺
      </button>
    </section>
  );
}

export default QuoteBox;
