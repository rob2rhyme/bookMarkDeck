import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { email: "a@example.com" } }, status: "authenticated" }),
}));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: () => () => {} }));
vi.mock("@/lib/firebase", () => ({ auth: {}, ensureFirebaseGoogleAuth: vi.fn() }));
vi.mock("@/features/notes/data/notesData", () => ({
  deleteNote: vi.fn(async () => {}),
  fetchNotes: vi.fn(async () => []),
  saveNote: vi.fn(async () => {}),
  appendDeletion: vi.fn(async () => {}),
  saveDeletions: vi.fn(async () => {}),
  subscribeDeletions: vi.fn(() => () => {}),
  subscribeNotes: vi.fn(() => () => {}),
  noteTooLarge: vi.fn(() => null),
}));
vi.mock("@/lib/vault/vaultData", () => ({
  fetchVaults: vi.fn(async () => []),
  saveVault: vi.fn(async () => {}),
  subscribeVaults: vi.fn(() => () => {}),
}));
// Real WebCrypto, at a test-sized PBKDF2 cost.
vi.mock("@/lib/vault/vault", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/vault/vault")>();
  return {
    ...actual,
    createVault: (p: string, o = {}) => actual.createVault(p, { ...o, iterations: 1_000 }),
  };
});

import type { Note } from "@/features/notes/lib/notes";
import { lock as lockVault, resetVaultSessionForTests } from "@/lib/vault/vaultSession";
import { vaultIterationLimits } from "@/lib/vault/vault";

vaultIterationLimits.min = 1_000;
import { NoteEditorScreen } from "./NoteEditor";

const KEY = "bookmarkdeck:notes:v1:a@example.com";
const SECRET = "door code 4417";
const note = (over: Partial<Note> = {}): Note => ({
  id: "n1",
  title: "Cabin",
  body: SECRET,
  pinned: false,
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});
const cached = () => JSON.parse(localStorage.getItem(KEY) ?? "[]") as Note[];
/** Everything this app put in localStorage, as one string. */
const allStorage = () => Object.keys(localStorage).map((k) => localStorage.getItem(k)).join("\n");

beforeEach(() => {
  localStorage.clear();
  push.mockClear();
  resetVaultSessionForTests();
});

async function openNote(n: Note = note()) {
  localStorage.setItem(KEY, JSON.stringify([n]));
  return render(<NoteEditorScreen id={n.id} />);
}

async function setUpVaultAndLock(pass = "correct horse battery") {
  fireEvent.click(await screen.findByRole("button", { name: "Lock note" }));
  fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: pass } });
  fireEvent.change(screen.getByLabelText("Confirm passphrase"), { target: { value: pass } });
  fireEvent.click(screen.getByRole("button", { name: "Create passphrase" }));
  const code = (await screen.findByTestId("recovery-code")).textContent!;
  const done = screen.getByRole("button", { name: "Done" }) as HTMLButtonElement;
  expect(done.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(done);
  await waitFor(() => expect(cached()[0].lock).toBeTruthy());
  return code;
}

describe("locking a note", () => {
  it("encrypts it: nothing on the device holds the plaintext, and the editor still shows it", async () => {
    await openNote();
    const code = await setUpVaultAndLock();
    expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){7}$/);
    expect(cached()[0]).toMatchObject({ body: "", title: "Cabin" });
    expect(allStorage()).not.toContain("4417");
    expect(allStorage()).not.toContain("correct horse");
    expect((screen.getByLabelText("Note") as HTMLTextAreaElement).value).toBe(SECRET);
  });

  it("saves edits encrypted", async () => {
    await openNote();
    await setUpVaultAndLock();
    const before = cached()[0].lock!.ct;
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: `${SECRET}\nalarm 9031` } });
    await waitFor(() => expect(cached()[0].lock!.ct).not.toBe(before), { timeout: 2000 });
    expect(allStorage()).not.toContain("9031");
    expect(cached()[0].body).toBe("");
  });

  it("locking the vault saves pending typing first, then hides the note behind the passphrase", async () => {
    await openNote();
    await setUpVaultAndLock("pass phrase one");
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "typed just now" } });
    await act(async () => {
      await lockVault();
    });
    expect(screen.queryByLabelText("Note")).toBeNull();
    expect(screen.getByText("This note is locked. Enter your passphrase to open it.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "wrong one!" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/doesn't match/);

    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "pass phrase one" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    const body = (await screen.findByLabelText("Note")) as HTMLTextAreaElement;
    expect(body.value).toBe("typed just now");
  });

  it("the recovery code resets a forgotten passphrase", async () => {
    await openNote();
    const code = await setUpVaultAndLock("forgotten pass");
    await act(async () => {
      await lockVault();
    });
    fireEvent.click(screen.getByRole("button", { name: "Forgot passphrase?" }));
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: code.toLowerCase() } });
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "new pass phrase" } });
    fireEvent.change(screen.getByLabelText("Confirm passphrase"), { target: { value: "new pass phrase" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset passphrase" }));
    expect(((await screen.findByLabelText("Note")) as HTMLTextAreaElement).value).toBe(SECRET);
  });

  it("removing the lock stores the note in plain text again, after confirming", async () => {
    await openNote();
    await setUpVaultAndLock();
    fireEvent.click(screen.getByRole("button", { name: "Remove lock" }));
    expect(cached()[0].lock).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Remove lock" }).at(-1)!);
    await waitFor(() => expect(cached()[0].lock).toBeUndefined());
    expect(cached()[0].body).toBe(SECRET);
  });

  it("insists on a passphrase of 8+ characters, typed the same twice", async () => {
    await openNote();
    fireEvent.click(await screen.findByRole("button", { name: "Lock note" }));
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("Confirm passphrase"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Create passphrase" }));
    expect(screen.getByRole("alert").textContent).toMatch(/at least 8/);
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "long enough 1" } });
    fireEvent.change(screen.getByLabelText("Confirm passphrase"), { target: { value: "long enough 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Create passphrase" }));
    expect(screen.getByRole("alert").textContent).toMatch(/don't match/);
    expect(cached()[0].lock).toBeUndefined();
  });

  it("never discards a locked note with a blank title while it is locked", async () => {
    await openNote();
    await setUpVaultAndLock();
    // Blank title and body on screen, vault locked: still not a "blank note".
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "" } });
    await act(async () => {
      await lockVault();
    });
    screen.getByText(/This note is locked/);
  });
});
