"use client";

import { useCallback } from "react";

import type { GoogleSnapshot, Todo } from "@/features/focus/lib/types";
import { dayKeyOf } from "@/lib/dayKey";

type SetIds = (
  id: string,
  ids: {
    googleTaskId?: string | null;
    googleEventId?: string | null;
    gsync?: GoogleSnapshot;
  }
) => void;

/**
 * Push side of Google sync: mirrors a to-do to Google Tasks (+ a Calendar event
 * when it has a due time) via /api/google/todos, then writes the returned
 * Google ids back onto the to-do. All best-effort — failures never block the
 * local to-do. Inert unless `enabled`.
 */
export function useGoogleTodoSync(enabled: boolean, setIds: SetIds) {
  const mirror = useCallback(
    async (todo: Todo) => {
      if (!enabled) return;
      try {
        const res = await fetch("/api/google/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The day it's due HERE: the server can't know this device's zone.
          body: JSON.stringify({ todo, dueDate: todo.dueAt ? dayKeyOf(todo.dueAt) : null }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          googleTaskId?: string | null;
          googleEventId?: string | null;
          synced?: { task?: boolean; event?: boolean };
        };
        // What Google holds now: each half updates only if its write landed (an
        // older server that doesn't say is treated as having landed, as before).
        const prev = todo.gsync;
        const gsync: GoogleSnapshot = {
          done: data.synced?.task === false ? (prev?.done ?? false) : todo.done,
          dueAt: data.synced?.event === false ? (prev?.dueAt ?? null) : (todo.dueAt ?? null),
        };
        setIds(todo.id, {
          googleTaskId: data.googleTaskId ?? todo.googleTaskId ?? null,
          googleEventId: data.googleEventId ?? null,
          gsync,
        });
      } catch {
        // best-effort
      }
    },
    [enabled, setIds]
  );

  const unmirror = useCallback(
    async (todo: Todo) => {
      if (!enabled) return;
      if (!todo.googleTaskId && !todo.googleEventId) return;
      try {
        await fetch("/api/google/todos", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            googleTaskId: todo.googleTaskId ?? null,
            googleEventId: todo.googleEventId ?? null,
          }),
        });
      } catch {
        // best-effort
      }
    },
    [enabled]
  );

  return { mirror, unmirror };
}
