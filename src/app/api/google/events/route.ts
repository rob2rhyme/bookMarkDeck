import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export const runtime = "nodejs";

const CAL_LIST = "https://www.googleapis.com/calendar/v3/users/me/calendarList";

async function gget(token: string, url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`google ${res.status}`);
  return res.json();
}

export type AgendaEvent = {
  id: string;
  calendarId: string;
  calendarName: string;
  primary: boolean; // true for the user's main calendar (name is their email)
  title: string;
  description: string | null;
  start: string | null; // ISO
  allDay: boolean;
  htmlLink: string | null;
};

const DEFAULT_DAYS = 90;
const MAX_DAYS = 3650;

/** Upcoming events across all the user's calendars (window via ?days=N). */
export async function GET(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const token = jwt?.accessToken;
  if (!token) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const days = Math.min(
    MAX_DAYS,
    Math.max(1, parseInt(searchParams.get("days") ?? "", 10) || DEFAULT_DAYS)
  );

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + days * 86400000).toISOString();

  try {
    const list = (await gget(token, CAL_LIST)) as {
      items?: {
        id: string;
        summary?: string;
        selected?: boolean;
        primary?: boolean;
      }[];
    };
    const calendars = (list.items ?? []).filter((c) => c.selected !== false);

    const perCal = await Promise.all(
      calendars.map(async (cal) => {
        const params = new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "250",
        });
        const url =
          `https://www.googleapis.com/calendar/v3/calendars/` +
          `${encodeURIComponent(cal.id)}/events?${params}`;
        try {
          const data = (await gget(token, url)) as {
            items?: {
              id: string;
              summary?: string;
              description?: string;
              location?: string;
              htmlLink?: string;
              start?: { dateTime?: string; date?: string };
            }[];
          };
          return (data.items ?? []).map((e): AgendaEvent => {
            const allDay = !e.start?.dateTime;
            const desc =
              (typeof e.description === "string" && e.description.trim()) ||
              (typeof e.location === "string" && e.location.trim()) ||
              "";
            return {
              id: e.id,
              calendarId: cal.id,
              calendarName: cal.summary ?? "Calendar",
              primary: cal.primary === true,
              title: e.summary ?? "(no title)",
              description: desc || null,
              start: e.start?.dateTime ?? e.start?.date ?? null,
              allDay,
              htmlLink: e.htmlLink ?? null,
            };
          });
        } catch {
          return [] as AgendaEvent[];
        }
      })
    );

    const events = perCal
      .flat()
      .filter((e) => e.start)
      .sort((a, b) => (a.start! < b.start! ? -1 : 1))
      .slice(0, 250);

    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
}

/* ------------------------------------------------------------ write-back --- */
// Create and delete events on the user's PRIMARY calendar only — never another
// calendar (shared and subscribed ones are not ours to change). Both use the
// `calendar.events` scope the sign-in already holds.

const EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const MIN_DURATION = 5;
const MAX_DURATION = 24 * 60;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The next calendar day, as a label. UTC arithmetic on a bare date, so no zone is involved. */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Create an event. `start` is either a bare day ("2026-10-23", an all-day event)
 * or an instant (ISO) — the client turns the date and time the user picked into an
 * instant, since this server can't know their zone. `durationMin` applies to timed
 * events (default 30).
 */
export async function POST(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const token = jwt?.accessToken;
  if (!token) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  let input: { title?: unknown; start?: unknown; durationMin?: unknown; notes?: unknown };
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const title = typeof input.title === "string" ? input.title.trim().slice(0, 300) : "";
  if (!title) return NextResponse.json({ error: "missing_title" }, { status: 400 });
  const start = typeof input.start === "string" ? input.start : "";

  const body: Record<string, unknown> = { summary: title };
  if (typeof input.notes === "string" && input.notes.trim()) {
    body.description = input.notes.trim().slice(0, 2000);
  }
  if (DATE_RE.test(start)) {
    body.start = { date: start };
    body.end = { date: nextDay(start) }; // the end of an all-day event is exclusive
  } else {
    const at = Date.parse(start);
    if (Number.isNaN(at)) return NextResponse.json({ error: "bad_start" }, { status: 400 });
    const minutes = Math.min(
      MAX_DURATION,
      Math.max(MIN_DURATION, Math.round(Number(input.durationMin) || 30))
    );
    body.start = { dateTime: new Date(at).toISOString() };
    body.end = { dateTime: new Date(at + minutes * 60000).toISOString() };
  }

  try {
    const res = await fetch(EVENTS, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`google ${res.status}`);
    const ev = (await res.json()) as { id?: string };
    return NextResponse.json({ id: typeof ev.id === "string" ? ev.id : null });
  } catch {
    return NextResponse.json({ error: "create_failed" }, { status: 502 });
  }
}

/** Delete one event from the primary calendar (`?id=`). Already gone counts as done. */
export async function DELETE(req: NextRequest) {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const token = jwt?.accessToken;
  if (!token) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get("id") ?? "";
  // Google event ids are lowercase base32hex or similar; refuse anything that
  // could alter the URL path.
  if (!/^[\w-]{1,200}$/.test(id)) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }

  try {
    const res = await fetch(`${EVENTS}/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`google ${res.status}`);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "delete_failed" }, { status: 502 });
  }
}
