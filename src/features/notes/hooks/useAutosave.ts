"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/**
 * Debounced autosave, driven imperatively: the editor calls `schedule()` from its
 * change handlers rather than this hook watching a value in an effect, so a
 * remote update adopted into the draft never triggers a save of its own.
 *
 * `save` is read through a ref at fire time, so it always saves the latest
 * draft. `flush()` saves now (⌘S, pagehide, leaving the page); unmounting with
 * a save pending flushes too, so navigating away inside the debounce window
 * loses nothing.
 */
export function useAutosave(save: () => Promise<void>, delay = 800) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  const run = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setStatus("saving");
    try {
      await saveRef.current();
      // A newer change may have been scheduled while this one was in flight.
      if (!timer.current) setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, []);

  const schedule = useCallback(() => {
    setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), delay);
  }, [delay, run]);

  /** Save immediately if anything is waiting. Returns whether a save ran. */
  const flush = useCallback((): boolean => {
    if (!timer.current) return false;
    void run();
    return true;
  }, [run]);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        saveRef.current().catch(() => {});
      }
    },
    []
  );

  /** Whether a debounced save is waiting — read at call time, not render time. */
  const hasPending = useCallback(() => timer.current !== null, []);

  return { status, schedule, flush, saveNow: run, hasPending, dirty: status === "pending" };
}
