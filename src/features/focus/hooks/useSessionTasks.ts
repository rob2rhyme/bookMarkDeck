"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  deleteTask,
  fetchTasks,
  saveTask,
} from "@/features/focus/data/focusData";

export type SessionTask = {
  id: string;
  text: string;
  done: boolean;
};

/**
 * Task list for the current focus session.
 * In-memory by default; when `connected` with an `email`, it loads from and
 * writes through to Firestore optimistically (a sync failure never blocks the UI).
 */
export function useSessionTasks(
  email?: string | null,
  connected = false
) {
  const [tasks, setTasks] = useState<SessionTask[]>([]);

  const canSync = connected && Boolean(email);

  // Load persisted tasks once a connection is available.
  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    fetchTasks(email)
      .then((remote) => {
        if (!cancelled) setTasks(remote);
      })
      .catch(() => {
        /* keep current in-memory tasks on failure */
      });
    return () => {
      cancelled = true;
    };
  }, [canSync, email]);

  const addTask = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const task: SessionTask = {
        id: crypto.randomUUID(),
        text: trimmed,
        done: false,
      };
      setTasks((prev) => [...prev, task]);
      if (canSync && email) saveTask(email, task).catch(() => {});
    },
    [canSync, email]
  );

  const toggleTask = useCallback(
    (id: string) => {
      setTasks((prev) => {
        const next = prev.map((task) =>
          task.id === id ? { ...task, done: !task.done } : task
        );
        const updated = next.find((task) => task.id === id);
        if (canSync && email && updated) saveTask(email, updated).catch(() => {});
        return next;
      });
    },
    [canSync, email]
  );

  const removeTask = useCallback(
    (id: string) => {
      setTasks((prev) => prev.filter((task) => task.id !== id));
      if (canSync && email) deleteTask(email, id).catch(() => {});
    },
    [canSync, email]
  );

  const doneCount = useMemo(
    () => tasks.filter((task) => task.done).length,
    [tasks]
  );

  return { tasks, doneCount, addTask, toggleTask, removeTask };
}
