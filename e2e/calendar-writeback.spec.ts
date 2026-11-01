import { E2E_USER, expect, test } from "./fixtures/session";

// The Agenda writes back to Google Calendar: add an event, delete your own.
// Google itself is replaced by an in-memory calendar behind the app's own routes,
// so this drives the real form, the real fetches and the real list.
type Ev = { id: string; summary: string; start: string };

test("add an event from the agenda, then delete it", async ({ page }) => {
  await page.addInitScript((email) => {
    const key = `bookmarkdeck:focus:settings:v1:${email}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({ todoGoogleSync: true }));
    }
  }, E2E_USER.email);

  const calendar: Ev[] = [];
  const posted: unknown[] = [];
  const deleted: string[] = [];

  await page.route("**/api/google/events**", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const body = req.postDataJSON() as { title: string; start: string };
      posted.push(body);
      calendar.push({ id: `ev${calendar.length + 1}`, summary: body.title, start: body.start });
      return route.fulfill({ json: { id: `ev${calendar.length}` } });
    }
    if (req.method() === "DELETE") {
      const id = new URL(req.url()).searchParams.get("id")!;
      deleted.push(id);
      calendar.splice(calendar.findIndex((e) => e.id === id), 1);
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        events: calendar.map((e) => ({
          id: e.id,
          calendarId: "primary-cal",
          calendarName: "me@example.com",
          primary: true,
          title: e.summary,
          description: null,
          start: e.start,
          allDay: !e.start.includes("T"),
          htmlLink: null,
        })),
      },
    });
  });
  // The to-do pull also runs while Google sync is on; nothing is mirrored here.
  await page.route("**/api/google/todos/status", (route) => route.fulfill({ json: { results: [] } }));

  await page.goto("/focus");
  // Today's events also appear under the to-do list; this is about the agenda.
  const agenda = page.getByRole("heading", { name: /Agenda/ }).locator("xpath=ancestor::section[1]");
  await page.getByRole("button", { name: /add event/i }).click();
  await page.getByLabel("Event title").fill("Dentist");
  await page.getByLabel("All day").check();
  await page.getByRole("button", { name: /add to calendar/i }).click();

  await expect(agenda.getByText("Dentist")).toBeVisible();
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ title: "Dentist" });
  expect((posted[0] as { start: string }).start).toMatch(/^\d{4}-\d{2}-\d{2}$/); // an all-day event is a bare day

  // Two clicks to delete.
  await page.getByRole("button", { name: "Delete Dentist" }).click();
  expect(deleted).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm delete Dentist" }).click();
  await expect(agenda.getByText("Dentist")).toHaveCount(0);
  expect(deleted).toEqual(["ev1"]);
});
