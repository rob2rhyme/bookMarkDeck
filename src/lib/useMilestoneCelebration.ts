"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { planCelebration, type Milestone } from "@/lib/milestones";

const KEY = "bd:milestones:seen:v1";
// A milestone is judged only once the numbers have held still this long. Pages
// fill in from a cache and then from the cloud, so a count passes through
// smaller values on its way to the real one — judging it early would either
// record too little (and celebrate old milestones later) or celebrate a crossing
// that was only the list loading.
export const SETTLE_MS = 2500;

function read(account: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(`${KEY}:${account}`);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

function write(account: string, seen: string[]) {
  try {
    window.localStorage.setItem(`${KEY}:${account}`, JSON.stringify(seen));
  } catch {
    /* storage full or blocked: the card may show again next visit */
  }
}

/**
 * A just-reached milestone to celebrate, once. Per device and account (the
 * "seen" record is a local flag, like the weekly recap's — nothing synced). The
 * first look at an account records what it has already earned and shows
 * nothing. Counts as seen the moment it is shown, so a reload doesn't repeat it.
 *
 * `ready` is the page saying its numbers are loaded; no account (signed out)
 * means no celebration.
 */
export function useMilestoneCelebration(
  account: string | null | undefined,
  metrics: Record<string, number | undefined>,
  ready: boolean
) {
  const [fresh, setFresh] = useState<Milestone[]>([]);
  // The metrics object is new every render; its content is what matters.
  const sig = JSON.stringify(Object.entries(metrics).sort(([a], [b]) => a.localeCompare(b)));
  const stable = useMemo(
    () => Object.fromEntries(JSON.parse(sig) as [string, number | undefined][]),
    [sig]
  );

  useEffect(() => {
    if (!account || !ready) return;
    const t = window.setTimeout(() => {
      const plan = planCelebration(stable, read(account));
      write(account, plan.seen);
      if (plan.fresh.length) setFresh(plan.fresh);
    }, SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [account, ready, stable]);

  const dismiss = useCallback(() => setFresh([]), []);
  return { fresh, dismiss };
}
