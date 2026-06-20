import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authConfig } from "@/auth/auth.config";

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
export async function GET(req: Request) {
  const session = await getServerSession(authConfig);
  const token = session?.accessToken;
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
