"use client";

// First-run welcome. Shows once (guarded by a localStorage flag), introducing
// the core moves: organise, focus, and the ⌘K palette.

import { useEffect, useRef, useState } from "react";

import { Modal } from "@/components/Modal";
import { Emoji } from "@/components/icons";
import { useOtherDialogOpen } from "@/lib/dialogPresence";
import { fetchUiFlag, getCachedFlag, markUiFlag } from "@/lib/uiPrefs";

// The welcome opens on its own, after a cloud check, so it used to land on top of
// whatever the user had just opened (a passphrase prompt, an add-link form). It
// now waits until the page has been dialog-free for SETTLE_MS, and counts as
// "seen" only once it has actually shown. Once open it stays until dismissed:
// closing it under a newer dialog would hand body-scroll restoration to the
// wrong one (each Modal restores what it saw on open) and could leave the page
// pinned — and nothing can open over it anyway, its overlay takes every click.
const OWN = '[aria-labelledby="onboarding-title"]';
export const SETTLE_MS = 400;

const TIPS = [
  { icon: "🔖", title: "Collect & organise", body: "Add the sites you use most and group them into nestable folders." },
  { icon: "⏱️", title: "Focus hub", body: "Turn your resources into focused work — sessions, to-dos, and a record of progress." },
  { icon: "⌘", title: "Move fast", body: "Press ⌘K (Ctrl-K) anytime to jump to a page, action, or bookmark." },
];

export function Onboarding() {
  // due: the welcome should show (first run, confirmed); done: it was dismissed.
  const [due, setDue] = useState(false);
  const [done, setDone] = useState(false);
  const [settled, setSettled] = useState(false);
  const marked = useRef(false);
  const waiting = due && !done;
  // Watched only until it shows; returning users never start the observer.
  const othersOpen = useOtherDialogOpen(OWN, waiting && !settled);

  useEffect(() => {
    if (getCachedFlag("welcomeSeen")) return; // instant: this device knows
    let cancelled = false;
    // Confirm against the cloud before showing — so a returning user whose
    // localStorage was evicted doesn't see the welcome again.
    fetchUiFlag("welcomeSeen").then((seen) => {
      if (!cancelled && !seen) setDue(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Dialog-free for SETTLE_MS: show. The pause keeps it from slipping in between
  // two dialogs that replace each other (a confirm after a form).
  useEffect(() => {
    if (!waiting || othersOpen || settled) return;
    const t = setTimeout(() => {
      setSettled(true);
      if (!marked.current) {
        marked.current = true;
        // First-run only: remembered once actually shown, so a reload (or an
        // evicted cache the cloud backstops) never replays it.
        markUiFlag("welcomeSeen");
      }
    }, SETTLE_MS);
    return () => clearTimeout(t);
  }, [waiting, othersOpen, settled]);

  const open = waiting && settled;

  const close = () => {
    markUiFlag("welcomeSeen");
    setDone(true);
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
