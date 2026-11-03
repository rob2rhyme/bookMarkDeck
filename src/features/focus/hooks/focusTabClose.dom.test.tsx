import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Signed in but offline, Firestore holds a write in this tab's memory until the
// server has it, so its promise never settles — and a tab closed meanwhile lost
// it. The next load's snapshot then put the old copy back, brought a deleted
// record back, or (Focus keeps no record of what the cloud had) dropped a new
// one. Each change is now queued first and sent again on the next load.
vi.mock("@/features/focus/data/focusData", () => ({
  saveTodo: vi.fn(),
  deleteTodo: vi.fn(),
  fetchTodos: vi.fn(async () => []),
  subscribeTodos: vi.fn(),
  saveTask: vi.fn(),
  deleteTask: vi.fn(),
  touchTask: vi.fn(),
  fetchTasks: vi.fn(async () => []),
  subscribeTasks: vi.fn(),
  addNote: vi.fn(),
  deleteNote: vi.fn(),
  saveMood: vi.fn(),
  setJournalNote: vi.fn(),
  fetchJournal: vi.fn(async () => []),
  fetchNotes: vi.fn(async () => []),
  subscribeJournal: vi.fn(),
  subscribeNotes: vi.fn(),
  fetchSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

import * as data from "@/features/focus/data/focusData";
import { DEFAULT_SETTINGS } from "@/features/focus/lib/settings";
import { pendingUpsertIds } from "@/utils/pendingDeletes";
import { useFocusJournal } from "./useFocusJournal";
import { useFocusSettings } from "./useFocusSettings";
import { useFocusTasks } from "./useFocusTasks";
import { useTodos } from "./useTodos";

const EMAIL = "a@example.com";
const never = () => new Promise<never>(() => {});
const writes = [
  data.saveTodo,
  data.deleteTodo,
  data.saveTask,
  data.deleteTask,
  data.touchTask,
  data.addNote,
  data.deleteNote,
  data.saveMood,
  data.setJournalNote,
  data.saveSettings,
].map((f) => vi.mocked(f) as unknown as ReturnType<typeof vi.fn>);
const subs = [data.subscribeTodos, data.subscribeTasks, data.subscribeJournal, data.subscribeNotes].map(
  (f) => vi.mocked(f) as unknown as ReturnType<typeof vi.fn>
);

beforeEach(() => {
  window.localStorage.clear();
  writes.forEach((w) => w.mockReset().mockImplementation(never));
  subs.forEach((s) => s.mockReset().mockReturnValue(() => {}));
  vi.mocked(data.fetchSettings).mockReset().mockResolvedValue(null);
});

/** The network is back: every write lands. */
const online = () => writes.forEach((w) => w.mockReset().mockResolvedValue(undefined));

describe("to-dos", () => {
  const KEY = `bookmarkdeck:focus:todos:v1:${EMAIL}`;
  const todo = (id: string, text: string) => ({ id, text, note: "", done: false, dueAt: null, day: "" });

  it("a create, an edit and a delete made offline are sent on the next load", async () => {
    window.localStorage.setItem(KEY, JSON.stringify([todo("T1", "Old"), todo("T2", "Gone")]));
    const tab = renderHook(() => useTodos(EMAIL, true));
    await waitFor(() => expect(data.subscribeTodos).toHaveBeenCalled());
    let created = "";
    act(() => {
      created = tab.result.current.addTodo("New", null)!.id;
    });
    act(() => tab.result.current.editTodo("T1", { text: "Renamed" }));
    act(() => tab.result.current.removeTodo("T2"));
    tab.unmount();

    online();
    renderHook(() => useTodos(EMAIL, true));
    await waitFor(() => expect(data.subscribeTodos).toHaveBeenCalledTimes(2));
    expect(data.deleteTodo).toHaveBeenCalledWith(EMAIL, "T2");
    const sent = vi.mocked(data.saveTodo).mock.calls.map(([, t]) => [t.id, t.text]);
    expect(sent).toEqual(expect.arrayContaining([["T1", "Renamed"], [created, "New"]]));
    expect(pendingUpsertIds("todos", EMAIL).size).toBe(0);
  });
});

describe("tasks", () => {
  const KEY = `bookmarkdeck:focus:tasks:v1:${EMAIL}`;

  it("a rename and a delete made offline are sent on the next load", async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify([
        { id: "K1", text: "Write", done: false, lastUsedAt: null },
        { id: "K2", text: "Read", done: false, lastUsedAt: null },
      ])
    );
    const tab = renderHook(() => useFocusTasks(EMAIL, true));
    await waitFor(() => expect(data.subscribeTasks).toHaveBeenCalled());
    act(() => tab.result.current.renameTask("K1", "Write more"));
    act(() => tab.result.current.removeTask("K2"));
    tab.unmount();

    online();
    renderHook(() => useFocusTasks(EMAIL, true));
    await waitFor(() => expect(data.subscribeTasks).toHaveBeenCalledTimes(2));
    expect(data.deleteTask).toHaveBeenCalledWith(EMAIL, "K2");
    expect(vi.mocked(data.saveTask).mock.calls.map(([, t]) => t.text)).toEqual(["Write more"]);
  });
});

describe("journal", () => {
  const MOODS = `bookmarkdeck:focus:journal:v1:${EMAIL}`;

  it("a mood, a note and an edit to a day's legacy note are sent on the next load", async () => {
    window.localStorage.setItem(MOODS, JSON.stringify([{ day: "2026-10-01", note: "Old day note", mood: null }]));
    const tab = renderHook(() => useFocusJournal(EMAIL, true));
    await waitFor(() => expect(data.subscribeNotes).toHaveBeenCalled());
    act(() => tab.result.current.setMood("good", "2026-10-02"));
    act(() => tab.result.current.addNote("A thought", "note", "2026-10-02"));
    act(() => tab.result.current.editNote("legacy-2026-10-01", "New day note"));
    tab.unmount();

    online();
    renderHook(() => useFocusJournal(EMAIL, true));
    await waitFor(() => expect(data.subscribeNotes).toHaveBeenCalledTimes(2));
    expect(data.saveMood).toHaveBeenCalledWith(EMAIL, "2026-10-02", "good");
    expect(data.addNote).toHaveBeenCalledWith(EMAIL, expect.objectContaining({ text: "A thought" }));
    expect(data.setJournalNote).toHaveBeenCalledWith(EMAIL, "2026-10-01", "New day note");
  });
});

describe("settings", () => {
  it("a change closed inside the save delay wins on the next load", async () => {
    vi.mocked(data.fetchSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, dailyGoalHours: 2 });
    const tab = renderHook(() => useFocusSettings(EMAIL, true));
    await waitFor(() => expect(tab.result.current.settings.dailyGoalHours).toBe(2));
    act(() => tab.result.current.update({ dailyGoalHours: 9 }));
    tab.unmount(); // before the 600 ms save went out

    online();
    const next = renderHook(() => useFocusSettings(EMAIL, true));
    await waitFor(() => expect(data.saveSettings).toHaveBeenCalled());
    expect(vi.mocked(data.saveSettings).mock.calls[0][1]).toMatchObject({ dailyGoalHours: 9 });
    expect(next.result.current.settings.dailyGoalHours).toBe(9);
  });

  it("with nothing waiting, adopts the cloud's copy", async () => {
    vi.mocked(data.fetchSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, dailyGoalHours: 6 });
    const { result } = renderHook(() => useFocusSettings(EMAIL, true));
    await waitFor(() => expect(result.current.settings.dailyGoalHours).toBe(6));
    expect(data.saveSettings).not.toHaveBeenCalled();
  });
});

// Another tab edited a queued to-do after this one loaded. The replay used to
// send this tab's copy from load time, landing after the edit and undoing it.
describe("to-dos — replays the device's copy, not this tab's", () => {
  it("sends the other tab's later edit", async () => {
    const KEY = `bookmarkdeck:focus:todos:v1:${EMAIL}`;
    const row = (text: string) => ({ id: "T1", text, note: "", done: false, dueAt: null, day: "" });
    window.localStorage.setItem(KEY, JSON.stringify([row("Old")]));
    online();
    const { result, rerender } = renderHook(({ on }) => useTodos(EMAIL, on), { initialProps: { on: false } });
    await waitFor(() => expect(result.current.todos).toHaveLength(1));
    // The other tab: its edit in the shared cache, and queued.
    window.localStorage.setItem(KEY, JSON.stringify([row("Renamed elsewhere")]));
    window.localStorage.setItem(`bookmarkdeck:pending-up:todos:${EMAIL}`, JSON.stringify(["T1"]));
    rerender({ on: true });
    await waitFor(() => expect(data.subscribeTodos).toHaveBeenCalled());
    expect(vi.mocked(data.saveTodo).mock.calls.map(([, t]) => t.text)).toEqual(["Renamed elsewhere"]);
  });
});
