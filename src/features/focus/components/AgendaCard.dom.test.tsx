import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

// Write-back: add an event to, and delete one from, the user's own calendar.
describe("AgendaCard — write-back", () => {
  const saved = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "America/Los_Angeles";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-29T17:00:00.000Z")); // 10am Sep 29 in LA
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = saved;
  });

  const base = {
    enabled: true,
    loading: false,
    error: false,
    days: 7,
    canExpand: false,
    canCollapse: false,
    onRefresh: () => {},
    onExpand: () => {},
    onCollapse: () => {},
  };
  const own = (id: string, primary: boolean): AgendaEvent => ({
    id,
    calendarId: primary ? "me@example.com" : "shared",
    calendarName: primary ? "me@example.com" : "Team",
    primary,
    title: id,
    description: null,
    start: "2026-09-29T20:00:00.000Z",
    allDay: false,
    htmlLink: null,
  });

  it("stays read-only without the handlers", () => {
    render(<AgendaCard {...base} events={[own("Mine", true)]} />);
    expect(screen.queryByRole("button", { name: /add event/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("adds a timed event, sending the instant for the LOCAL date and time", async () => {
    const onCreate = vi.fn(async () => true);
    render(<AgendaCard {...base} events={[]} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: /add event/i }));
    fireEvent.change(screen.getByLabelText("Event title"), { target: { value: "Dentist" } });
    fireEvent.change(screen.getByLabelText("Event time"), { target: { value: "14:30" } });
    fireEvent.change(screen.getByLabelText("Event length"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: /add to calendar/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    // 14:30 on Sep 29 in Los Angeles (UTC−7) is 21:30Z — not 14:30Z.
    expect(onCreate).toHaveBeenCalledWith({
      title: "Dentist",
      start: "2026-09-29T21:30:00.000Z",
      durationMin: 60,
    });
    // Closed again on success.
    await waitFor(() => expect(screen.queryByLabelText("Event title")).toBeNull());
  });

  it("adds an all-day event as a bare day with no duration", async () => {
    const onCreate = vi.fn(async () => true);
    render(<AgendaCard {...base} events={[]} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: /add event/i }));
    fireEvent.change(screen.getByLabelText("Event title"), { target: { value: "Holiday" } });
    fireEvent.click(screen.getByLabelText("All day"));
    fireEvent.click(screen.getByRole("button", { name: /add to calendar/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ title: "Holiday", start: "2026-09-29" }));
  });

  it("keeps the form open and says so when Google refuses", async () => {
    const onCreate = vi.fn(async () => false);
    render(<AgendaCard {...base} events={[]} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: /add event/i }));
    fireEvent.change(screen.getByLabelText("Event title"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: /add to calendar/i }));
    await screen.findByText(/couldn.t add it/i);
    expect(screen.getByLabelText("Event title")).toBeTruthy();
  });

  it("will not submit without a title", () => {
    const onCreate = vi.fn(async () => true);
    render(<AgendaCard {...base} events={[]} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: /add event/i }));
    expect((screen.getByRole("button", { name: /add to calendar/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("deletes only after a second click, and only on the user's own calendar", async () => {
    const onDelete = vi.fn(async (_e: AgendaEvent) => true);
    render(<AgendaCard {...base} events={[own("Mine", true), own("Theirs", false)]} onDelete={onDelete} />);
    // The shared calendar's event has no delete at all.
    expect(screen.queryByRole("button", { name: "Delete Theirs" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete Mine" }));
    expect(onDelete).not.toHaveBeenCalled(); // first click only arms it
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete Mine" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(onDelete.mock.calls[0][0]).toMatchObject({ id: "Mine" });
  });

  it("says so when a delete fails", async () => {
    render(<AgendaCard {...base} events={[own("Mine", true)]} onDelete={async () => false} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Mine" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete Mine" }));
    await screen.findByText(/couldn.t delete/i);
  });
});
