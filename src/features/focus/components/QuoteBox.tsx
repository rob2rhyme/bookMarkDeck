"use client";

import { useCallback, useEffect, useState } from "react";

const QUOTES: { text: string; author: string | null }[] = [
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
  { text: "Small steps every day outpace big leaps every month.", author: null },
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
  { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
  {
    text: "Programs must be written for people to read, and only incidentally for machines to execute.",
    author: "Harold Abelson",
  },
  {
    text: "Any fool can write code a computer understands. Good programmers write code humans understand.",
    author: "Martin Fowler",
  },
  { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
  {
    text: "Premature optimization is the root of all evil.",
    author: "Donald Knuth",
  },
  { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" },
  { text: "Deleted code is debugged code.", author: "Jeff Sickel" },
  { text: "The best error message is the one that never shows up.", author: "Thomas Fuchs" },
  { text: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
  {
    text: "The function of good software is to make the complex appear simple.",
    author: "Grady Booch",
  },
  { text: "Done is better than perfect.", author: null },
  { text: "Quality is not an act, it is a habit.", author: "Aristotle" },
  { text: "Well begun is half done.", author: "Aristotle" },
  {
    text: "Amateurs sit and wait for inspiration; the rest of us just get up and go to work.",
    author: "Stephen King",
  },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  {
    text: "A year from now you may wish you had started today.",
    author: "Karen Lamb",
  },
  {
    text: "Energy and persistence conquer all things.",
    author: "Benjamin Franklin",
  },
  { text: "Slow is smooth, and smooth is fast.", author: null },
  {
    text: "Discipline is choosing between what you want now and what you want most.",
    author: null,
  },
  { text: "Focus is the art of knowing what to ignore.", author: null },
  { text: "You can't improve what you never finish.", author: null },
  { text: "Make the change easy, then make the easy change.", author: "Kent Beck" },
  {
    text: "Fall in love with the process, and the results will follow.",
    author: null,
  },
  { text: "When in doubt, ship a smaller thing.", author: null },
];

// "Useful code of the day" — a rotating dev nugget that spans four flavours:
// a copyable snippet, a coding tip, an editor/CLI shortcut, and a code challenge.
type Nugget =
  | { kind: "snippet"; lang: string; code: string; note: string }
  | { kind: "tip"; note: string }
  | { kind: "shortcut"; keys: string; note: string }
  | { kind: "challenge"; level: string; note: string };

const NUGGETS: Nugget[] = [
  // ---- snippets ----
  {
    kind: "snippet",
    lang: "js",
    code: "const unique = [...new Set(arr)];",
    note: "Dedupe an array in one line.",
  },
  {
    kind: "snippet",
    lang: "js",
    code: "const last = arr.at(-1);",
    note: "Grab the last item — no length math.",
  },
  {
    kind: "snippet",
    lang: "js",
    code: "const copy = structuredClone(obj);",
    note: "Deep-clone without a JSON round-trip.",
  },
  {
    kind: "snippet",
    lang: "js",
    code: "await Promise.allSettled(tasks);",
    note: "Wait for everything — successes and failures alike.",
  },
  {
    kind: "snippet",
    lang: "js",
    code: "const sum = nums.reduce((a, b) => a + b, 0);",
    note: "Total a list of numbers.",
  },
  {
    kind: "snippet",
    lang: "js",
    code: "[...nums].sort((a, b) => a - b);",
    note: "Sort numbers correctly — the default sort is alphabetical!",
  },
  {
    kind: "snippet",
    lang: "js",
    code: 'String(n).padStart(2, "0");',
    note: "Zero-pad a value for clocks and dates.",
  },
  {
    kind: "snippet",
    lang: "js",
    code: "Object.groupBy(items, (x) => x.type);",
    note: "Group a list by a key — no lodash needed.",
  },
  {
    kind: "snippet",
    lang: "js",
    code: "Array.from({ length: n }, (_, i) => i);",
    note: "Build a 0..n-1 range.",
  },
  {
    kind: "snippet",
    lang: "ts",
    code: "const cfg = base satisfies Config;",
    note: "Type-check a value without widening its literal type.",
  },
  {
    kind: "snippet",
    lang: "css",
    code: "text-wrap: balance;",
    note: "Even line lengths on headings — no manual breaks.",
  },
  {
    kind: "snippet",
    lang: "css",
    code: "aspect-ratio: 16 / 9;",
    note: "Lock an element's shape without padding hacks.",
  },
  {
    kind: "snippet",
    lang: "bash",
    code: "git commit --amend --no-edit",
    note: "Fold staged changes into your last commit, message untouched.",
  },
  {
    kind: "snippet",
    lang: "bash",
    code: "git switch -c feature/x",
    note: "Create a branch and switch to it in one step.",
  },
  {
    kind: "snippet",
    lang: "bash",
    code: "git restore --staged <file>",
    note: "Unstage a file without losing your changes.",
  },
  {
    kind: "snippet",
    lang: "bash",
    code: "git stash -u",
    note: "Stash your work including untracked files.",
  },
  // ---- tips ----
  {
    kind: "tip",
    note: "Name booleans as questions — isReady, hasAccess — so conditionals read like plain English.",
  },
  {
    kind: "tip",
    note: "Commit small. A diff you can hold in your head is a diff you can actually review.",
  },
  {
    kind: "tip",
    note: "Write the test that would have caught the bug first, then fix the bug.",
  },
  {
    kind: "tip",
    note: "If a function needs a comment to explain what it does, try a better name first.",
  },
  {
    kind: "tip",
    note: "Prefer pure functions — same input, same output — they're trivial to test and reason about.",
  },
  {
    kind: "tip",
    note: "Read the error message. Then read it again. The answer is usually right there.",
  },
  {
    kind: "tip",
    note: "Rubber-duck it: explain the bug out loud and you'll often spot it yourself.",
  },
  {
    kind: "tip",
    note: "Optimize for deletion. Code that's easy to delete is code that's easy to change.",
  },
  {
    kind: "tip",
    note: "When you're stuck, take a walk. Your subconscious keeps compiling in the background.",
  },
  // ---- shortcuts ----
  {
    kind: "shortcut",
    keys: "⌘⇧P  /  Ctrl⇧P",
    note: "Command Palette — reach any editor action without leaving the keyboard.",
  },
  {
    kind: "shortcut",
    keys: "⌥↑  /  ⌥↓",
    note: "Move the current line up or down (VS Code).",
  },
  {
    kind: "shortcut",
    keys: "F2",
    note: "Rename a symbol everywhere at once (VS Code).",
  },
  {
    kind: "shortcut",
    keys: "⌘D  /  Ctrl+D",
    note: "Select the next match for multi-cursor editing.",
  },
  {
    kind: "shortcut",
    keys: "⌘/  /  Ctrl+/",
    note: "Toggle a line comment on the current selection.",
  },
  {
    kind: "shortcut",
    keys: "Ctrl + R",
    note: "Reverse-search your shell history instead of re-typing.",
  },
  {
    kind: "shortcut",
    keys: "cd -",
    note: "Jump back to the directory you were just in.",
  },
  {
    kind: "shortcut",
    keys: "sudo !!",
    note: "Re-run your last command with sudo — !! repeats it.",
  },
  // ---- challenges ----
  {
    kind: "challenge",
    level: "Easy",
    note: "Reverse a string without using .reverse().",
  },
  {
    kind: "challenge",
    level: "Easy",
    note: "Write FizzBuzz for 1–100 in five lines or fewer.",
  },
  {
    kind: "challenge",
    level: "Easy",
    note: "Check whether two strings are anagrams of each other.",
  },
  {
    kind: "challenge",
    level: "Easy",
    note: "Group an array of objects by one of their keys — no libraries.",
  },
  {
    kind: "challenge",
    level: "Medium",
    note: "Find the first non-repeating character in a string.",
  },
  {
    kind: "challenge",
    level: "Medium",
    note: "Flatten a deeply nested array without Array.prototype.flat.",
  },
  {
    kind: "challenge",
    level: "Medium",
    note: "Write a debounce(fn, ms) helper in under ten lines.",
  },
  {
    kind: "challenge",
    level: "Medium",
    note: "Given an array and a target, return the two indices that sum to it.",
  },
  {
    kind: "challenge",
    level: "Medium",
    note: "Decide if a string of (), [], {} brackets is balanced.",
  },
  {
    kind: "challenge",
    level: "Hard",
    note: "Convert an integer (1–3999) to its Roman numeral.",
  },
];

const KIND_BADGE: Record<Nugget["kind"], { label: string; cls: string }> = {
  snippet: { label: "Snippet", cls: "border-emerald-500/40 text-emerald-300" },
  tip: { label: "Tip", cls: "border-sky-500/40 text-sky-300" },
  shortcut: { label: "Shortcut", cls: "border-violet-500/40 text-violet-300" },
  challenge: { label: "Challenge", cls: "border-amber-500/40 text-amber-300" },
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
        ) : nugget.kind === "challenge" ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2.5">
            <p className="text-[14px] leading-relaxed text-slate-200">
              {nugget.note}
            </p>
            <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-300/80">
              {nugget.level} · try it in a scratch file
            </p>
          </div>
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
