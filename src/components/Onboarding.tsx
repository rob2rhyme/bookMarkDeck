"use client";

// First-run welcome. Shows once (guarded by a localStorage flag), introducing
// the core moves: organise, focus, and the ⌘K palette.

import { useEffect, useState } from "react";

import { Modal } from "@/components/Modal";
import { Emoji } from "@/components/icons";
import { fetchUiFlag, getCachedFlag, markUiFlag } from "@/lib/uiPrefs";

const TIPS = [
  { icon: "🔖", title: "Collect & organise", body: "Add the sites you use most and group them into nestable folders." },
  { icon: "⏱️", title: "Focus hub", body: "Turn your resources into focused work — sessions, to-dos, and a record of progress." },
  { icon: "⌘", title: "Move fast", body: "Press ⌘K (Ctrl-K) anytime to jump to a page, action, or bookmark." },
];

export function Onboarding() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (getCachedFlag("welcomeSeen")) return; // instant: this device knows
    let cancelled = false;
    // Confirm against the cloud before showing — so a returning user whose
    // localStorage was evicted doesn't see the welcome again.
    fetchUiFlag("welcomeSeen").then((seen) => {
      if (!cancelled && !seen) setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const close = () => {
    markUiFlag("welcomeSeen");
    setOpen(false);
  };

  return (
    <Modal open={open} onClose={close} labelledBy="onboarding-title">
      <h2
        id="onboarding-title"
        className="text-lg font-semibold tracking-tight text-slate-50"
      >
        Welcome to Bookmark Deck
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        A calm, private home for the sites you use — and the work you do with
        them.
      </p>
      <ul className="mt-5 flex flex-col gap-4">
        {TIPS.map((t) => (
          <li key={t.title} className="flex gap-3">
            <Emoji className="text-xl leading-none">
              {t.icon}
            </Emoji>
            <div>
              <p className="text-sm font-medium text-slate-100">{t.title}</p>
              <p className="text-[13px] text-slate-400">{t.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={close}
        className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
      >
        Get started
      </button>
    </Modal>
  );
}

export default Onboarding;
