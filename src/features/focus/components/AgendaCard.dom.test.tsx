import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgendaEvent } from "@/features/focus/hooks/useGoogleEvents";
import { AgendaCard } from "./AgendaCard";

// An all-day event's start is a bare date. new Date("2026-09-29") is UTC
// midnight, which local getters put on the 28th everywhere west of UTC — so
// today's all-day events were filed under yesterday and tomorrow's under
// "Today". CI runs in UTC, where it can't show, so this pins a zone and a clock.
const allDay = (id: string, start: string): AgendaEvent => ({
  id,
  calendarId: "c",
  calendarName: "Personal",
  primary: false,
  title: id,
  description: null,
  start,
  allDay: true,
  htmlLink: null,
});

describe("AgendaCard — all-day events", () => {
  const saved = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "America/Los_Angeles";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-29T17:00:00.000Z")); // 10am Sep 29
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = saved;
  });

  it("files each on its own date", () => {
    render(
      <AgendaCard
        enabled
        events={[allDay("Dentist", "2026-09-29"), allDay("Flight", "2026-09-30")]}
        loading={false}
        error={false}
        days={7}
        canExpand={false}
        canCollapse={false}
        onRefresh={() => {}}
        onExpand={() => {}}
        onCollapse={() => {}}
      />
    );
    const group = (label: string) => screen.getByText(label).parentElement!;
    expect(within(group("Today")).getByText("Dentist")).toBeTruthy();
    expect(within(group("Tomorrow")).getByText("Flight")).toBeTruthy();
  });
});
