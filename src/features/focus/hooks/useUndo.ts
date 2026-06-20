"use client";

import { useCallback, useEffect, useState } from "react";

export type UndoState = {
  message: string;
  restore: () => void;
} | null;

/**
 * A single, transient "X deleted — Undo" affordance. `offer` records a message
 * + a restore callback and shows the toast; it auto-dismisses after `timeoutMs`
 * (a later offer replaces an earlier one and resets the timer).
 */
export function useUndo(timeoutMs = 6000) {
  const [state, setState] = useState<UndoState>(null);

  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => setState(null), timeoutMs);
    return () => clearTimeout(t);
  }, [state, timeoutMs]);

  const offer = useCallback(
    (message: string, restore: () => void) => setState({ message, restore }),
    []
  );

  const undo = useCallback(() => {
    setState((cur) => {
      cur?.restore();
      return null;
    });
  }, []);

  const dismiss = useCallback(() => setState(null), []);

  return { state, offer, undo, dismiss };
}
