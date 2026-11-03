"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type ActivityType,
  deleteTodo,
  fetchTodos,
  saveTodo,
  subscribeTodos,
} from "@/features/focus/data/focusData";
import {
  durableDelete,
  durableSave,
  flushPendingDeletes,
  pendingUpsertIds,
  replayUpserts,
} from "@/utils/pendingDeletes";
import { isGoogleSnapshot } from "@/features/focus/lib/googleReconcile";
import { isTodoRepeat, nextOccurrence } from "@/features/focus/lib/recurrence";
import type { Todo, TodoEdit, TodoList, TodoPriority, TodoRepeat } from "@/features/focus/lib/types";
import { todayKey } from "@/lib/dayKey";

type LogActivity = (type: ActivityType, summary: string) => void;

const BASE_KEY = "bookmarkdeck:focus:todos:v1";

function keyFor(email?: string | null) {
  return email ? `${BASE_KEY}:${email}` : BASE_KEY;
}

function loadLocal(email?: string | null): Todo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t) => t && typeof t.id === "string")
      .map((t) => ({
        id: t.id as string,
        text: typeof t.text === "string" ? t.text : "",
        note: typeof t.note === "string" ? t.note : "",
        done: Boolean(t.done),
        dueAt: typeof t.dueAt === "string" ? t.dueAt : null,
        createdAt: typeof t.createdAt === "string" ? t.createdAt : null,
        completedAt: typeof t.completedAt === "string" ? t.completedAt : null,
        day: typeof t.day === "string" ? t.day : "",
        list: (t.list === "project" ? "project" : "personal") as TodoList,
        project: typeof t.project === "string" ? t.project : "",
        googleTaskId: typeof t.googleTaskId === "string" ? t.googleTaskId : null,
        googleEventId:
          typeof t.googleEventId === "string" ? t.googleEventId : null,
        ...(isGoogleSnapshot(t.gsync) ? { gsync: t.gsync } : {}),
        ...(isTodoRepeat(t.repeat) ? { repeat: t.repeat } : {}),
        ...(t.priority === "high" || t.priority === "low" ? { priority: t.priority as TodoPriority } : {}),
      }))
      .filter((t) => t.text.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * To-do list: checklist items with an optional due date. Incomplete items
 * persist (roll over) across days. localStorage cache + live Firestore sync;
 * adds/completes are mirrored to the activity log.
 */
export function useTodos(
  email?: string | null,
  connected = false,
  onLog?: LogActivity
) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const canSync = connected && Boolean(email);

  // The latest list, for callbacks that outlive a render — the Undo for a
  // completion is called seconds later and must not see the list as it was.
  const todosRef = useRef<Todo[]>([]);
  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  useEffect(() => {
    setTodos(loadLocal(email));
    setHydrated(true);
  }, [email]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(keyFor(email), JSON.stringify(todos));
    } catch {}
  }, [todos, hydrated, email]);

  const pushToCloud = useCallback(async () => {
    if (!canSync || !email) return;
    await Promise.all(todos.map((t) => saveTodo(email, t)));
  }, [canSync, email, todos]);

  const pullFromCloud = useCallback(async () => {
    if (!canSync || !email) return;
    setTodos(await fetchTodos(email));
  }, [canSync, email]);

  // On connect: replay any offline deletions and seed local-only items to the
  // cloud BEFORE subscribing — otherwise the first live snapshot overwrites
  // local state (resurrecting deletes / reverting just-toggled items).
  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    let unsub = () => {};
    (async () => {
      await flushPendingDeletes("todos", email, (id) => deleteTodo(email, id));
      // Push ONLY items changed while offline, not the whole local cache (which
      // would clobber newer cloud edits / resurrect cloud deletes).
      // Each queued record is sent from the DEVICE cache (another tab may have
      // edited it since this one loaded) and leaves the queue once it lands; one
      // that failed is tried again next connect. A queued create goes up too.
      const ups = pendingUpsertIds("todos", email);
      await replayUpserts("todos", email, loadLocal(email).filter((t) => ups.has(t.id)), (t) => saveTodo(email, t));
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) unsub = subscribeTodos(email, setTodos);
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [canSync, email]);

  const addTodo = useCallback(
    (
      text: string,
      dueAt: string | null,
      note = "",
      list: Todo["list"] = "personal",
      project = "",
      extras: { repeat?: TodoRepeat; priority?: TodoPriority } = {}
    ): Todo | null => {
      const trimmed = text.trim();
      if (!trimmed) return null;
      const todo: Todo = {
        id: crypto.randomUUID(),
        text: trimmed,
        note: note.trim(),
        done: false,
        dueAt: dueAt ?? null,
        createdAt: new Date().toISOString(),
        day: todayKey(),
        list,
        project: list === "project" ? project.trim() : "",
        googleTaskId: null,
        googleEventId: null,
        // A repeat needs a due date to anchor on.
        ...(extras.repeat && dueAt ? { repeat: extras.repeat } : {}),
        ...(extras.priority ? { priority: extras.priority } : {}),
      };
      setTodos((prev) => [todo, ...prev]);
      durableSave("todos", email, todo.id, canSync && email ? () => saveTodo(email, todo) : null).catch(() => {});
      onLog?.("todo_added", `Added to-do: ${trimmed}`);
      return todo;
    },
    [canSync, email, onLog]
  );

  // Persist the Google mapping ids without re-mirroring (called by the sync layer).
  const setGoogleIds = useCallback(
    (
      id: string,
      ids: {
        googleTaskId?: string | null;
        googleEventId?: string | null;
        gsync?: Todo["gsync"];
      }
    ) => {
      setTodos((prev) => {
        const next = prev.map((t) => (t.id === id ? { ...t, ...ids } : t));
        const updated = next.find((t) => t.id === id);
        if (updated)
          durableSave("todos", email, id, canSync && email ? () => saveTodo(email, updated) : null).catch(() => {});
        return next;
      });
    },
    [canSync, email]
  );

  /**
   * Toggle done. Completing a repeating to-do files its next occurrence;
   * un-completing removes that occurrence again unless it has been done itself.
   * Both are returned so the caller can mirror them (Google) and undo them.
   */
  const toggleTodo = useCallback(
    (id: string): { spawned: Todo | null; removed: Todo | null } => {
      const list = todosRef.current;
      const current = list.find((t) => t.id === id);
      if (!current) return { spawned: null, removed: null };
      const nowDone = !current.done;
      const completedAt = nowDone ? new Date().toISOString() : null;

      let spawned: Todo | null = null;
      let removed: Todo | null = null;
      if (nowDone) {
        const next = nextOccurrence(current, completedAt!);
        // Already filed (the other device got there first, or an undone
        // completion is being redone): don't touch it.
        if (next && !list.some((t) => t.id === next.id)) spawned = next;
      } else if (current.completedAt) {
        const next = nextOccurrence(current, current.completedAt);
        const filed = next && list.find((t) => t.id === next.id);
        if (filed && !filed.done) removed = filed;
      }

      const toggled: Todo = {
        ...current,
        done: nowDone,
        // Stamp the completion time so the history can chart it by day;
        // clear it when un-completing.
        completedAt,
      };
      let nextList = list.map((t) => (t.id === id ? toggled : t));
      if (removed) nextList = nextList.filter((t) => t.id !== removed!.id);
      if (spawned) nextList = [spawned, ...nextList];
      todosRef.current = nextList;
      setTodos(nextList);

      const on = canSync && email;
      durableSave("todos", email, id, on ? () => saveTodo(email, toggled) : null).catch(() => {});
      if (spawned) durableSave("todos", email, spawned.id, on ? () => saveTodo(email, spawned) : null).catch(() => {});
      if (removed) durableDelete("todos", email, removed.id, on ? () => deleteTodo(email, removed.id) : null).catch(() => {});
      if (nowDone) onLog?.("todo_done", `Completed to-do: ${current.text}`);
      return { spawned, removed };
    },
    [canSync, email, onLog]
  );

  const editTodo = useCallback(
    (
      id: string,
      patch: TodoEdit
    ) => {
      setTodos((prev) => {
        const next = prev.map((t) => {
          if (t.id !== id) return t;
          const { repeat, priority, ...rest } = patch;
          const merged: Todo = {
            ...t,
            ...rest,
            text: patch.text !== undefined ? patch.text.trim() : t.text,
          };
          // null clears; undefined leaves as is. A repeat can't outlive its due date.
          const wantRepeat = repeat === undefined ? t.repeat : (repeat ?? undefined);
          const wantPriority = priority === undefined ? t.priority : (priority ?? undefined);
          if (wantRepeat && merged.dueAt) merged.repeat = wantRepeat;
          else delete merged.repeat;
          if (wantPriority) merged.priority = wantPriority;
          else delete merged.priority;
          return merged;
        });
        const updated = next.find((t) => t.id === id);
        if (updated && updated.text.length > 0)
          durableSave("todos", email, id, canSync && email ? () => saveTodo(email, updated) : null).catch(() => {});
        return next;
      });
    },
    [canSync, email]
  );

  const removeTodo = useCallback(
    (id: string) => {
      setTodos((prev) => prev.filter((t) => t.id !== id));
      // Queued until it lands; this also drops a queued edit, which must not be pushed back.
      durableDelete("todos", email, id, canSync && email ? () => deleteTodo(email, id) : null).catch(() => {});
    },
    [canSync, email]
  );

  const restoreTodo = useCallback(
    (todo: Todo) => {
      setTodos((prev) =>
        prev.some((t) => t.id === todo.id) ? prev : [todo, ...prev]
      );
      durableSave("todos", email, todo.id, canSync && email ? () => saveTodo(email, todo) : null).catch(() => {});
    },
    [canSync, email]
  );

  const active = useMemo(() => todos.filter((t) => !t.done), [todos]);
  const done = useMemo(() => todos.filter((t) => t.done), [todos]);

  return {
    todos,
    active,
    done,
    addTodo,
    toggleTodo,
    editTodo,
    removeTodo,
    restoreTodo,
    setGoogleIds,
    pullFromCloud,
    pushToCloud,
  };
}
