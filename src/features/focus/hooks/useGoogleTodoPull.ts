"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  reconcile,
  type GooglePatch,
  type Remote,
} from "@/features/focus/lib/googleReconcile";
import type { Todo } from "@/features/focus/lib/types";

const FIRST_PULL_MS = 2_000; // let the to-dos hydrate before the first look
const MIN_GAP_MS = 60_000; // focusing the tab never pulls more often than this
const POLL_MS = 5 * 60_000;

type Result = { id: string; task: Remote["task"]; event: Remote["event"] };

/**
 * Pull side of Google sync: asks Google how each mirrored, still-open to-do
 * stands (/api/google/todos/status) and hands what should change here to
 * `onPatch` — completed in Google Tasks, moved in Google Calendar, or deleted
 * there. All best-effort and read-only against Google; a failed pull changes
 * nothing. Inert unless `enabled`. See lib/googleReconcile.ts for the rules.
 */
export function useGoogleTodoPull(
  enabled: boolean,
  todos: Todo[],
  onPatch: (todo: Todo, patch: GooglePatch) => void
) {
  // Timers outlive renders, so they read the latest to-dos and handler from refs.
  const todosRef = useRef(todos);
  const onPatchRef = useRef(onPatch);
  const lastRef = useRef(0);
  const busyRef = useRef(false);
  useEffect(() => {
    todosRef.current = todos;
    onPatchRef.current = onPatch;
  });

  const pull = useCallback(async () => {
    if (busyRef.current) return;
    const mirrored = todosRef.current.filter(
      (t) => !t.done && t.list !== "project" && (t.googleTaskId || t.googleEventId)
    );
    if (mirrored.length === 0) return;
    busyRef.current = true;
    lastRef.current = Date.now();
    try {
      const res = await fetch("/api/google/todos/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: mirrored.map((t) => ({
            id: t.id,
            googleTaskId: t.googleTaskId ?? null,
            googleEventId: t.googleEventId ?? null,
          })),
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { results?: Result[] };
      for (const r of data.results ?? []) {
        // The to-do may have changed while we waited: judge it as it is now.
        const todo = todosRef.current.find((t) => t.id === r.id);
        if (!todo) continue;
        const patch = reconcile(todo, { task: r.task, event: r.event });
        if (patch) onPatchRef.current(todo, patch);
      }
    } catch {
      // best-effort
    } finally {
      busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const first = window.setTimeout(pull, FIRST_PULL_MS);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void pull();
    }, POLL_MS);
    const onFocus = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRef.current > MIN_GAP_MS) {
        void pull();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [enabled, pull]);

  return { pull };
}
