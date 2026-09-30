import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export const runtime = "nodejs";

const TASKS = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks";
const EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const EVENT_MIN = 30; // default duration for a timed to-do's calendar block

async function gfetch(
  token: string,
  url: string,
  init: RequestInit = {}
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`google ${res.status}`);
  if (res.status === 204) return {};
  return res.json();
}

type TodoIn = {
  text?: string;
  note?: string;
  done?: boolean;
  dueAt?: string | null;
  googleTaskId?: string | null;
  googleEventId?: string | null;
};

/** Create/update the mirrored Google Task (+ Calendar event for timed items). */
export async function POST(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const token = jwt?.accessToken;
  if (!token) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  let todo: TodoIn;
  let dueDate: unknown;
  try {
    ({ todo, dueDate } = await req.json());
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!todo?.text) {
    return NextResponse.json({ error: "missing_text" }, { status: 400 });
  }

  // ---- Google Task (always) -------------------------------------------------
  const taskBody: Record<string, unknown> = {
    title: todo.text,
    status: todo.done ? "completed" : "needsAction",
  };
  if (todo.note) taskBody.notes = todo.note;
  // Google Tasks keeps only the DATE of `due`, and this server can't know the
  // user's zone — the instant put a US-evening to-do on tomorrow. So the client
  // names its local day, sent as that date at UTC midnight (Google's convention
  // for a date-only due). An older client without it keeps the old behaviour.
  if (todo.dueAt) {
    taskBody.due =
      typeof dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
        ? `${dueDate}T00:00:00.000Z`
        : new Date(todo.dueAt).toISOString();
  }

  let googleTaskId = todo.googleTaskId ?? null;
  try {
    if (googleTaskId) {
      await gfetch(token, `${TASKS}/${googleTaskId}`, {
        method: "PATCH",
        body: JSON.stringify(taskBody),
      });
    } else {
      const created = await gfetch(token, TASKS, {
        method: "POST",
        body: JSON.stringify(taskBody),
      });
      googleTaskId = typeof created.id === "string" ? created.id : null;
    }
  } catch {
    // leave the existing id; the local to-do is unaffected
  }

  // ---- Calendar event (only for timed to-dos) -------------------------------
  let googleEventId = todo.googleEventId ?? null;
  try {
    if (todo.dueAt) {
      const start = new Date(todo.dueAt);
      const end = new Date(start.getTime() + EVENT_MIN * 60000);
      const evBody: Record<string, unknown> = {
        summary: todo.text,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      };
      if (todo.note) evBody.description = todo.note;
      if (googleEventId) {
        await gfetch(token, `${EVENTS}/${googleEventId}`, {
          method: "PATCH",
          body: JSON.stringify(evBody),
        });
      } else {
        const ev = await gfetch(token, EVENTS, {
          method: "POST",
          body: JSON.stringify(evBody),
        });
        googleEventId = typeof ev.id === "string" ? ev.id : null;
      }
    } else if (googleEventId) {
      // Due date removed — drop the calendar block.
      await gfetch(token, `${EVENTS}/${googleEventId}`, { method: "DELETE" });
      googleEventId = null;
    }
  } catch {
    // best-effort
  }

  return NextResponse.json({ googleTaskId, googleEventId });
}

/** Delete the mirrored Task + Calendar event. */
export async function DELETE(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const token = jwt?.accessToken;
  if (!token) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  let body: { googleTaskId?: string | null; googleEventId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (body.googleTaskId) {
    try {
      await gfetch(token, `${TASKS}/${body.googleTaskId}`, { method: "DELETE" });
    } catch {}
  }
  if (body.googleEventId) {
    try {
      await gfetch(token, `${EVENTS}/${body.googleEventId}`, {
        method: "DELETE",
      });
    } catch {}
  }
  return NextResponse.json({ ok: true });
}
