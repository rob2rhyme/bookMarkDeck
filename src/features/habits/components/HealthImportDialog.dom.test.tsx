import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, type Mock } from "vitest";

import type { DailyHealth } from "@/features/habits/lib/healthImport";
import type { Habit, HabitEntry } from "@/features/habits/lib/types";

// The file reading has its own tests; here the dialog gets a ready-made result.
const read = vi.fn();
vi.mock("@/features/habits/lib/healthFile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/habits/lib/healthFile")>()),
  readHealthFiles: (...a: unknown[]) => read(...a),
}));

import { HealthImportError } from "@/features/habits/lib/healthFile";
import { HealthImportDialog } from "./HealthImportDialog";

const habit = (over: Partial<Habit> & { id: string; name: string }): Habit => ({
  emoji: "✅",
  hue: 200,
  type: "binary",
  schedule: { type: "daily" },
  reminder: null,
  archived: false,
  sortOrder: 0,
  createdAt: null,
  ...over,
});

const TODAY = "2026-03-10";
const DAILY: DailyHealth = new Map([
  ["2026-03-05", { steps: 9000, exerciseMin: 40 }],
  ["2026-03-06", { steps: 6000, exerciseMin: 35 }],
  ["2026-03-07", { steps: 8500 }],
]);

let onApply: Mock<(entries: HabitEntry[], changed: Habit[]) => void>;
let onUndo: Mock<(ids: string[]) => void>;

function setup(habits: Habit[], existing: string[] = []) {
  onApply = vi.fn<(entries: HabitEntry[], changed: Habit[]) => void>();
  onUndo = vi.fn<(ids: string[]) => void>();
  read.mockResolvedValue(DAILY);
  render(
    <HealthImportDialog
      open
      onClose={() => {}}
      habits={habits}
      existingEntryIds={new Set(existing)}
      today={TODAY}
      onApply={onApply}
      onUndo={onUndo}
    />
  );
}

async function pickFile() {
  const input = screen.getByLabelText("Health data file") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "export.zip")] } });
  await screen.findByText(/covers 2026-03-05 to 2026-03-07/);
}



describe("HealthImportDialog", () => {
  it("summarises the file, guesses a link from the habit's name, and previews what it will mark", async () => {
    setup([habit({ id: "w", name: "Walk" }), habit({ id: "r", name: "Read" })]);
    await pickFile();
    // "Walk" → steps ≥ 8000 is suggested; "Read" has no guess.
    expect((screen.getByLabelText("Walk: health data") as HTMLSelectElement).value).toBe("steps");
    expect((screen.getByLabelText("Read: health data") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Walk: threshold") as HTMLInputElement).value).toBe("8000");
    // 9000 and 8500 reach 8000; 6000 doesn't.
    expect(screen.getByText(/Will mark/).textContent).toContain("2");
    expect(screen.getByRole("button", { name: "Mark 2 days done" })).toBeTruthy();
  });

  it("applies the plan, saving the new link, and undoes it", async () => {
    setup([habit({ id: "w", name: "Walk" })]);
    await pickFile();
    fireEvent.click(screen.getByRole("button", { name: "Mark 2 days done" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const [entries, changed] = onApply.mock.calls[0];
    expect(entries.map((e: { id: string }) => e.id)).toEqual(["w_2026-03-05", "w_2026-03-07"]);
    // The suggested link was new on the habit, so it is saved with it.
    expect(changed).toHaveLength(1);
    expect(changed[0].healthLink).toEqual({ metric: "steps", threshold: 8000 });

    await screen.findByText(/Marked 2 days across 1 habit/);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledWith(["w_2026-03-05", "w_2026-03-07"]);
    expect(screen.queryByText(/Marked 2 days/)).toBeNull();
  });

  it("changing the bar changes the preview", async () => {
    setup([habit({ id: "w", name: "Walk" })]);
    await pickFile();
    fireEvent.change(screen.getByLabelText("Walk: threshold"), { target: { value: "5000" } });
    expect(screen.getByRole("button", { name: "Mark 3 days done" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Walk: threshold"), { target: { value: "99999" } });
    expect(screen.getByText(/Nothing to mark yet/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Mark 0 days done" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("leaves days already logged alone and says so", async () => {
    setup([habit({ id: "w", name: "Walk" })], ["w_2026-03-05"]);
    await pickFile();
    expect(screen.getByRole("button", { name: "Mark 1 day done" })).toBeTruthy();
    expect(screen.getByText(/1 qualifying day is already logged/)).toBeTruthy();
  });

  it("uses a habit's saved link in preference to a guess, and saves nothing it didn't change", async () => {
    setup([habit({ id: "w", name: "Walk", healthLink: { metric: "exerciseMin", threshold: 30 } })]);
    await pickFile();
    expect((screen.getByLabelText("Walk: health data") as HTMLSelectElement).value).toBe("exerciseMin");
    fireEvent.click(screen.getByRole("button", { name: /Mark 2 days done/ }));
    expect(onApply.mock.calls[0][1]).toEqual([]); // the link was already stored as it is
  });

  it("offers only the metrics a habit's type can take, and not ones the file lacks", async () => {
    setup([habit({ id: "m", name: "Steps", type: "measurable" })]);
    await pickFile();
    const select = screen.getByLabelText("Steps: health data") as HTMLSelectElement;
    const options = [...select.options].map((o) => [o.value, o.disabled]);
    // No sleep for a measurable habit; the file has no sleep or mindful days anyway.
    expect(options.map(([v]) => v)).not.toContain("sleepHours");
    expect(options).toContainEqual(["mindfulMin", true]);
    expect(options).toContainEqual(["steps", false]);
    // A measurable habit takes the day's value, so it has no threshold box.
    expect(screen.queryByLabelText("Steps: threshold")).toBeNull();
  });

  it("clearing a saved link saves the habit without it", async () => {
    setup([habit({ id: "w", name: "Walk", healthLink: { metric: "steps", threshold: 8000 } }), habit({ id: "x", name: "Read" })]);
    await pickFile();
    fireEvent.change(screen.getByLabelText("Read: health data"), { target: { value: "steps" } });
    fireEvent.change(screen.getByLabelText("Walk: health data"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Mark \d+ days? done/ }));
    const changed = onApply.mock.calls[0][1] as Habit[];
    expect(changed.find((h) => h.id === "w")?.healthLink).toBeUndefined();
    expect(changed.find((h) => h.id === "x")?.healthLink?.metric).toBe("steps");
  });

  it("shows the reader's message when a file can't be used, and lets you try again", async () => {
    setup([habit({ id: "w", name: "Walk" })]);
    read.mockImplementation(async () => {
      throw new HealthImportError("No date column in that file.");
    });
    fireEvent.change(screen.getByLabelText("Health data file"), { target: { files: [new File(["x"], "a.csv")] } });
    expect((await screen.findByRole("alert")).textContent).toBe("No date column in that file.");
    expect(screen.getByRole("button", { name: "Choose a file" })).toBeTruthy();
  });

  it("explains an unexpected failure without a stack trace", async () => {
    setup([habit({ id: "w", name: "Walk" })]);
    read.mockImplementation(async () => {
      throw new TypeError("boom");
    });
    fireEvent.change(screen.getByLabelText("Health data file"), { target: { files: [new File(["x"], "a.zip")] } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/export\.zip/));
    expect(screen.getByRole("alert").textContent).not.toMatch(/boom/);
  });

  it("tells you what to do when there are no habits", async () => {
    setup([]);
    await pickFile();
    expect(screen.getByText(/Add a habit first/)).toBeTruthy();
  });
});
