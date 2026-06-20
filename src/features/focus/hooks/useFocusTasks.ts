"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type ActivityType,
  deleteTask,
  fetchTasks,
  saveTask,
  subscribeTasks,
  touchTask,
} from "@/features/focus/data/focusData";
import type { FocusTask } from "@/features/focus/lib/types";

type LogActivity = (type: ActivityType, summary: string) => void;

const BASE_KEY = "bookmarkdeck:focus:tasks:v1";

function keyFor(email?: string | null) {
  return email ? `${BASE_KEY}:${email}` : BASE_KEY;
}

function loadLocal(email?: string | null): FocusTask[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((t) => ({
        id: typeof t.id === "string" ? t.id : crypto.randomUUID(),
        text: typeof t.text === "string" ? t.text : "",
        done: Boolean(t.done),
        lastUsedAt: typeof t.lastUsedAt === "string" ? t.lastUsedAt : null,
      }))
      .filter((t) => t.text.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * Reusable, time-tracked tasks. Persisted to localStorage and (when connected)
 * Firestore. Tracks an active task that the timer attributes focus minutes to,
 * and auto-resumes the most recently used task.
 */
export function useFocusTasks(
  email?: string | null,
  connected = false,
  onLog?: LogActivity
) {
  const [tasks, setTasks] = useState<FocusTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const canSync = connected && Boolean(email);

  useEffect(() => {
    setTasks(loadLocal(email));
    setHydrated(true);
  }, [email]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(keyFor(email), JSON.stringify(tasks));
    } catch {}
  }, [tasks, hydrated, email]);

  useEffect(() => {
    if (!canSync || !email) return;
    // Seed the cloud with local-only tasks added before connecting so the live
    // snapshot won't drop them, then subscribe for real-time updates.
    pushToCloud().catch(() => {});
    return subscribeTasks(email, setTasks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync, email]);

  const pullFromCloud = useCallback(async () => {
    if (!canSync || !email) return;
    const remote = await fetchTasks(email);
    setTasks(remote);
  }, [canSync, email]);

  const pushToCloud = useCallback(async () => {
    if (!canSync || !email) return;
    await Promise.all(tasks.map((t) => saveTask(email, t)));
  }, [canSync, email, tasks]);

  // Resume the most recently used active task (or keep a still-valid one).
  useEffect(() => {
    setActiveTaskId((cur) => {
      if (cur && tasks.some((t) => t.id === cur && !t.done)) return cur;
      const candidates = tasks.filter((t) => !t.done);
      if (candidates.length === 0) return null;
      const sorted = [...candidates].sort((a, b) =>
        (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "")
      );
      return sorted[0].id;
    });
  }, [tasks]);

  const addTask = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const task: FocusTask = {
        id: crypto.randomUUID(),
        text: trimmed,
        done: false,
        lastUsedAt: null,
      };
      setTasks((prev) => [...prev, task]);
      setActiveTaskId(task.id);
      if (canSync && email) saveTask(email, task).catch(() => {});
      onLog?.("task_added", `Added task: ${trimmed}`);
    },
    [canSync, email, onLog]
  );

  const toggleDone = useCallback(
    (id: string) => {
      setTasks((prev) => {
        const next = prev.map((t) =>
          t.id === id ? { ...t, done: !t.done } : t
        );
        const updated = next.find((t) => t.id === id);
        if (canSync && email && updated) saveTask(email, updated).catch(() => {});
        if (updated?.done) onLog?.("task_done", `Completed: ${updated.text}`);
        return next;
      });
    },
    [canSync, email, onLog]
  );

  const removeTask = useCallback(
    (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (canSync && email) deleteTask(email, id).catch(() => {});
    },
    [canSync, email]
  );

  const restoreTask = useCallback(
    (task: FocusTask) => {
      setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev : [...prev, task]));
      if (canSync && email) saveTask(email, task).catch(() => {});
    },
    [canSync, email]
  );

  const markUsed = useCallback(
    (id: string, isoTime: string) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, lastUsedAt: isoTime } : t))
      );
      if (canSync && email) touchTask(email, id, isoTime).catch(() => {});
    },
    [canSync, email]
  );

  const activeTasks = useMemo(() => tasks.filter((t) => !t.done), [tasks]);
  const doneTasks = useMemo(() => tasks.filter((t) => t.done), [tasks]);
  const activeTask = useMemo(
    () => tasks.find((t) => t.id === activeTaskId) ?? null,
    [tasks, activeTaskId]
  );

  return {
    activeTasks,
    doneTasks,
    activeTaskId,
    activeTask,
    setActiveTaskId,
    addTask,
    toggleDone,
    removeTask,
    restoreTask,
    markUsed,
    pullFromCloud,
    pushToCloud,
  };
}
