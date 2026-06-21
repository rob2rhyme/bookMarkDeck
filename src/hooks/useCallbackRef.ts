"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Returns a stable function identity that always calls the latest `callback`.
 * Lets effects depend on a handler without re-running when the handler's
 * identity changes each render.
 */
export function useCallbackRef<Args extends unknown[], Return>(
  callback: (...args: Args) => Return
): (...args: Args) => Return {
  const ref = useRef(callback);
  useEffect(() => {
    ref.current = callback;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}
