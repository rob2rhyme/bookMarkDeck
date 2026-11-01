import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export const runtime = "nodejs";

const TASKS = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks";
const EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/** The most to-dos looked at in one call: two Google reads each. */
const MAX_ITEMS = 40;

type Item = { id?: unknown; googleTaskId?: unknown; googleEventId?: unknown };

type GetResult = { state: "ok"; body: Record<string, unknown> } | { state: "gone" | "error" };

async function read(token: string, url: string): Promise<GetResult> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404 || res.status === 410) return { state: "gone" };
    if (!res.ok) return { state: "error" };
    return { state: "ok", body: (await res.json()) as Record<string, unknown> };
  } catch {
    return { state: "error" };
  }
}

const id = (v: unknown) => (typeof v === "string" && /^[\w-]{1,200}$/.test(v) ? v : null);

/**
 * Where Google stands on each mirrored to-do: is its Task completed or deleted,
 * and where is its Calendar event now. The way back for what useGoogleTodoSync
 * pushes out; the client decides what to adopt (see lib/googleReconcile.ts).
 * Read-only against Google.
 */
export async function POST(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const token = jwt?.accessToken;
  if (!token) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  let items: Item[];
  try {
    const body = await req.json();
    items = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : [];
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const results = await Promise.all(
    items.map(async (item) => {
      const todoId = typeof item.id === "string" ? item.id : null;
      if (!todoId) return null;
      const taskId = id(item.googleTaskId);
      const eventId = id(item.googleEventId);

      const [task, event] = await Promise.all([
        taskId ? read(token, `${TASKS}/${taskId}`) : null,
        eventId ? read(token, `${EVENTS}/${eventId}`) : null,
      ]);

      return {
        id: todoId,
        task: !task
          ? null
          : task.state !== "ok"
            ? { state: task.state, completed: false }
            : task.body.deleted === true
              ? { state: "gone" as const, completed: false }
              : { state: "ok" as const, completed: task.body.status === "completed" },
        event: !event
          ? null
          : event.state !== "ok"
            ? { state: event.state, start: null }
            : event.body.status === "cancelled"
              ? { state: "gone" as const, start: null }
              : {
                  state: "ok" as const,
                  start:
                    typeof (event.body.start as { dateTime?: unknown } | undefined)?.dateTime === "string"
                      ? ((event.body.start as { dateTime: string }).dateTime)
                      : null,
                },
      };
    })
  );

  return NextResponse.json({ results: results.filter(Boolean) });
}
