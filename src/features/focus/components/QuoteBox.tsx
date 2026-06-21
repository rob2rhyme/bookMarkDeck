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

// "Useful code of the day" — a rotating dev nugget that spans three flavours:
// a copyable snippet, a coding tip, and an editor/CLI shortcut.
type Nugget =
  | { kind: "snippet"; lang: string; code: string; note: string }
  | { kind: "tip"; note: string }
  | { kind: "shortcut"; keys: string; note: string };

const NUGGETS: Nugget[] = [
  {
    kind: "snippet",
    lang: "js",
    code: "const unique = [...new Set(arr)];",
    note: "Dedupe an array in one line.",
  },
  {
    kind: "tip",
    note: "Name booleans as questions — isReady, hasAccess — so conditionals read like plain English.",
  },
  {
    kind: "shortcut",
    keys: "⌘⇧P  /  Ctrl⇧P",
    note: "Command Palette — reach any editor action without leaving the keyboard.",
  },
  {
    kind: "snippet",
    lang: "js",
    code: "const last = arr.at(-1);",
    note: "Grab the last item — no length math.",
  },
  {
    kind: "tip",
    note: "Commit small. A diff you can hold in your head is a diff you can actually review.",
  },
  {
    kind: "snippet",
    lang: "bash",
    code: "git commit --amend --no-edit",
    note: "Fold staged changes into your last commit, message untouched.",
  },
  {
    kind: "shortcut",
    keys: "⌥↑  /  ⌥↓",
    note: "Move the current line up or down (VS Code).",
  },
  {
    kind: "snippet",
    lang: "js",
    code: "const copy = structuredClone(obj);",
    note: "Deep-clone without a JSON round-trip.",
  },
  {
    kind: "tip",
    note: "Write the test that would have caught the bug first, then fix the bug.",
  },
  {
    kind: "snippet",
    lang: "bash",
    code: "git switch -c feature/x",
    note: "Create a branch and switch to it in one step.",
  },
  {
    kind: "shortcut",
    keys: "Ctrl + R",
    note: "Reverse-search your shell history instead of re-typing.",
  },
  {
    kind: "snippet",
    lang: "js",
    code: "await Promise.allSettled(tasks);",
    note: "Wait for everything — successes and failures alike.",
  },
];

const KIND_BADGE: Record<Nugget["kind"], { label: string; cls: string }> = {
  snippet: { label: "Snippet", cls: "border-emerald-500/40 text-emerald-300" },
  tip: { label: "Tip", cls: "border-sky-500/40 text-sky-300" },
  shortcut: { label: "Shortcut", cls: "border-violet-500/40 text-violet-300" },
};

function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

export function QuoteBox() {
  // Deterministic first render (index 0) → pick after mount to avoid a
  // hydration mismatch. The quote is random; the nugget is "of the day".
  const [idx, setIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const [nug, setNug] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setIdx(Math.floor(Math.random() * QUOTES.length));
    setNug(dayOfYear() % NUGGETS.length);
  }, []);

  const next = useCallback(() => {
    setFading(true);
    setTimeout(() => {
      setIdx((i) => (i + 1) % QUOTES.length);
      setFading(false);
    }, 200);
  }, []);

  const nextNugget = useCallback(() => {
    setCopied(false);
    setNug((n) => (n + 1) % NUGGETS.length);
  }, []);

  const quote = QUOTES[idx];
  const nugget = NUGGETS[nug];
  const badge = KIND_BADGE[nugget.kind];

  const copy = useCallback(() => {
    if (nugget.kind !== "snippet") return;
    navigator.clipboard?.writeText(nugget.code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  }, [nugget]);

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-6 shadow-sm sm:p-8">
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
          <p className="mt-1.5 text-xs text-slate-400">— {quote.author}</p>
        )}
      </div>
      <button
        type="button"
        onClick={next}
        className="mt-4 rounded-lg border border-slate-700 px-3.5 py-1.5 text-[13px] text-slate-300 transition hover:border-slate-500 hover:bg-slate-800/60"
      >
        New quote ↺
      </button>

      {/* Useful code of the day */}
      <div className="mt-6 border-t border-slate-800/60 pt-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Code of the day
            </span>
            <span
              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>
          <button
            type="button"
            onClick={nextNugget}
            aria-label="Show another"
            className="text-[12px] text-slate-400 transition hover:text-slate-200"
          >
            New ↺
          </button>
        </div>

        {nugget.kind === "snippet" ? (
          <>
            <div className="group relative">
              <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-[13px] leading-relaxed text-emerald-200">
                <code>{nugget.code}</code>
              </pre>
              <button
                type="button"
                onClick={copy}
                className="absolute right-1.5 top-1.5 rounded-md border border-slate-700 bg-slate-900/80 px-2 py-0.5 text-[11px] text-slate-300 opacity-0 transition hover:border-slate-500 hover:text-slate-100 focus:opacity-100 group-hover:opacity-100"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-[13px] text-slate-400">{nugget.note}</p>
          </>
        ) : nugget.kind === "shortcut" ? (
          <>
            <kbd className="inline-block rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-1.5 font-mono text-[13px] text-slate-200">
              {nugget.keys}
            </kbd>
            <p className="mt-2 text-[13px] text-slate-400">{nugget.note}</p>
          </>
        ) : (
          <p className="text-[14px] leading-relaxed text-slate-300">
            {nugget.note}
          </p>
        )}
      </div>
    </section>
  );
}

export default QuoteBox;
