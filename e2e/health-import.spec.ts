import { makeZip } from "../src/test/makeZip";
import { expect, test } from "./fixtures/session";

// Import health data in a real browser: the file layer (streams, inflate) only
// really runs here. A habit is linked to steps, the days that reach the bar are
// marked, a second import changes nothing, and Undo takes the marks back.
const pad = (n: number) => String(n).padStart(2, "0");
const dayAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const STEPS = [9000, 7000, 8500, 10000, 3000]; // yesterday back five days: three reach 8000

async function addWalkHabit(page: import("@playwright/test").Page) {
  await page.goto("/habits");
  await page.getByRole("button", { name: /new habit/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("e.g. Meditate").fill("Walk");
  await dialog.getByRole("button", { name: "Add habit" }).click();
  await expect(page.getByText("Walk").first()).toBeVisible();
}

async function openImport(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Health data" }).click();
  return page.getByRole("dialog");
}

test("a CSV marks the days that reach the bar, and a second import adds nothing", async ({ page }) => {
  await addWalkHabit(page);
  const csv = ["date,steps", ...STEPS.map((s, i) => `${dayAgo(i + 1)},${s}`)].join("\n");

  let dialog = await openImport(page);
  await dialog.getByLabel("Health data file").setInputFiles({ name: "steps.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(dialog.getByLabel("Walk: health data")).toHaveValue("steps"); // guessed from the name
  await dialog.getByRole("button", { name: "Mark 3 days done" }).click();
  await expect(dialog.getByText(/Marked 3 days across 1 habit/)).toBeVisible();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();

  // The marks (and the link) are stored: a reload, and the same file again, adds nothing.
  await page.reload();
  dialog = await openImport(page);
  await dialog.getByLabel("Health data file").setInputFiles({ name: "steps.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(dialog.getByLabel("Walk: health data")).toHaveValue("steps"); // remembered
  await expect(dialog.getByText(/3 qualifying days are already logged/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Mark 0 days done" })).toBeDisabled();
});

test("an Apple Health export.zip is read in the browser, and Undo takes the marks back", async ({ page }) => {
  await addWalkHabit(page);
  const rec = (day: string, steps: number, source: string) =>
    `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="${source}" unit="count" ` +
    `startDate="${day} 08:00:00 +0000" endDate="${day} 08:30:00 +0000" value="${steps}"/>`;
  const xml =
    `<?xml version="1.0"?><HealthData>` +
    STEPS.flatMap((s, i) => [rec(dayAgo(i + 1), s, "iPhone"), rec(dayAgo(i + 1), Math.round(s * 0.9), "Apple Watch")]).join("") +
    `</HealthData>`;
  const zip = makeZip([{ name: "apple_health_export/export.xml", data: xml }]);

  let dialog = await openImport(page);
  await dialog.getByLabel("Health data file").setInputFiles({ name: "export.zip", mimeType: "application/zip", buffer: zip });
  // Phone and watch both counted: the larger source per day, not their sum (which would pass 8000 on every day).
  await dialog.getByRole("button", { name: "Mark 3 days done" }).click();
  await expect(dialog.getByText(/Marked 3 days/)).toBeVisible();

  await dialog.getByRole("button", { name: "Undo" }).click();
  await expect(dialog.getByText(/Marked 3 days/)).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  // Undone: importing again offers all three days afresh.
  dialog = await openImport(page);
  await dialog.getByLabel("Health data file").setInputFiles({ name: "export.zip", mimeType: "application/zip", buffer: zip });
  await expect(dialog.getByRole("button", { name: "Mark 3 days done" })).toBeEnabled();
});

test("a file it can't use says why", async ({ page }) => {
  await addWalkHabit(page);
  const dialog = await openImport(page);
  await dialog.getByLabel("Health data file").setInputFiles({ name: "notes.csv", mimeType: "text/csv", buffer: Buffer.from("name,value\na,1\n") });
  await expect(dialog.getByRole("alert")).toContainText(/date column/i);
});
