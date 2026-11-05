import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PBKDF2_ITERATIONS, createVault, vaultIterationLimits } from "@/lib/vault/vault";
import { addKeys, lock as lockVault, resetVaultSessionForTests } from "@/lib/vault/vaultSession";
import { sealPaper } from "@/features/filing/lib/lock";
import type { FilingDocument } from "@/features/filing/lib/types";
import { DocumentFormModal } from "./DocumentFormModal";

// The paper form's lock: a reference and note are readable here only while the vault
// is open, locking needs a vault (asked for through ensureVault), and what the form
// reports back — seed, wantLock, secretsOpen — is what decides the write (lock.ts).
beforeAll(() => {
  vaultIterationLimits.min = 1_000;
});
afterAll(() => {
  vaultIterationLimits.min = PBKDF2_ITERATIONS;
});
beforeEach(() => resetVaultSessionForTests());
afterEach(() => resetVaultSessionForTests());

const PAPER: FilingDocument = {
  id: "p1",
  title: "Car insurance",
  folderId: null,
  aliases: [],
  tags: [],
  obligations: [],
  createdAt: null,
  updatedAt: null,
};

function setup(props: Partial<React.ComponentProps<typeof DocumentFormModal>> = {}) {
  const onSubmit = vi.fn(async () => true);
  const ensureVault = vi.fn(async () => true);
  render(
    <DocumentFormModal
      open
      onClose={() => {}}
      onSubmit={onSubmit}
      folders={[]}
      parties={[]}
      vaultReady
      ensureVault={ensureVault}
      {...props}
    />
  );
  return { onSubmit, ensureVault };
}

const openDetails = () => fireEvent.click(screen.getByRole("button", { name: /Add details/ }));
const lockBox = () => screen.getByRole("checkbox", { name: /Lock reference and note/ });

/** A vault opened for this tab, and a paper sealed with it. */
async function lockedPaper(reference = "POL-4829104772", note = "call Dana") {
  const { record, key } = await createVault("pw-pw-pw-pw", { iterations: 1_000 });
  const lock = await sealPaper(key, record.id, PAPER.id, { reference, note });
  return { record, key, paper: { ...PAPER, lock, confidential: true } as FilingDocument };
}

describe("locking a new paper", () => {
  it("asks for the vault when the box is ticked, and reports wantLock on submit", async () => {
    const { onSubmit, ensureVault } = setup();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Passport" } });
    openDetails();
    fireEvent.click(lockBox());
    await waitFor(() => expect((lockBox() as HTMLInputElement).checked).toBe(true));
    expect(ensureVault).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "P1234567" } });
    fireEvent.click(screen.getByRole("button", { name: "File it" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [draft, meta] = onSubmit.mock.calls[0] as unknown as [{ reference: string }, { wantLock: boolean; secretsOpen: boolean }];
    expect(draft.reference).toBe("P1234567");
    expect(meta).toMatchObject({ wantLock: true, secretsOpen: false });
  });

  it("stays unlocked when the vault dialog is dismissed", async () => {
    const ensureVault = vi.fn(async () => false);
    setup({ ensureVault });
    openDetails();
    fireEvent.click(lockBox());
    await waitFor(() => expect(ensureVault).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect((lockBox() as HTMLInputElement).checked).toBe(false);
  });

  it("says so, and does not lock, while the vault records are still loading", async () => {
    const { ensureVault } = setup({ vaultReady: false });
    openDetails();
    fireEvent.click(lockBox());
    expect((await screen.findByRole("alert")).textContent).toMatch(/still loading/i);
    expect(ensureVault).not.toHaveBeenCalled();
    expect((lockBox() as HTMLInputElement).checked).toBe(false);
  });

  it("still refuses a password in the reference, locked or not", async () => {
    setup();
    openDetails();
    fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "password: hunter2" } });
    expect(screen.getByRole("alert").textContent).toMatch(/not a password manager/);
    expect((screen.getByRole("button", { name: "File it" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("editing a locked paper", () => {
  it("with the vault closed: reference and note are locked, and the form says how to open them", async () => {
    const { paper } = await lockedPaper();
    const { onSubmit, ensureVault } = setup({ editing: paper });
    openDetails();
    expect((screen.getByLabelText("Reference") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Note") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByLabelText("Reference").getAttribute("placeholder")).toContain("Locked");
    expect(screen.queryByRole("checkbox", { name: /Lock reference and note/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Unlock to view or edit" }));
    expect(ensureVault).toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Auto insurance" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [, meta] = onSubmit.mock.calls[0] as unknown as [unknown, { secretsOpen: boolean }];
    expect(meta.secretsOpen).toBe(false);
  });

  it("with the vault open: the decrypted text appears, and the seed holds it", async () => {
    const { record, key, paper } = await lockedPaper();
    addKeys([[record.id, key]]);
    const { onSubmit } = setup({ editing: paper });
    openDetails();
    await waitFor(() => expect((screen.getByLabelText("Reference") as HTMLInputElement).value).toBe("POL-4829104772"));
    expect((screen.getByLabelText("Note") as HTMLInputElement).value).toBe("call Dana");
    expect((lockBox() as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [draft, meta] = onSubmit.mock.calls[0] as unknown as [
      { reference: string },
      { seed: { reference: string; note: string }; wantLock: boolean; secretsOpen: boolean },
    ];
    expect(draft.reference).toBe("POL-4829104772");
    expect(meta.seed).toMatchObject({ reference: "POL-4829104772", note: "call Dana" });
    expect(meta).toMatchObject({ wantLock: true, secretsOpen: true });
  });

  it("unticking the lock reports wantLock false (the write puts the text back as plain)", async () => {
    const { record, key, paper } = await lockedPaper();
    addKeys([[record.id, key]]);
    const { onSubmit } = setup({ editing: paper });
    openDetails();
    await waitFor(() => expect((screen.getByLabelText("Reference") as HTMLInputElement).value).toBe("POL-4829104772"));
    fireEvent.click(lockBox());
    await waitFor(() => expect((lockBox() as HTMLInputElement).checked).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [, meta] = onSubmit.mock.calls[0] as unknown as [unknown, { wantLock: boolean; secretsOpen: boolean }];
    expect(meta).toMatchObject({ wantLock: false, secretsOpen: true });
  });

  it("goes back to locked when the vault locks again", async () => {
    const { record, key, paper } = await lockedPaper();
    addKeys([[record.id, key]]);
    setup({ editing: paper });
    openDetails();
    await waitFor(() => expect((screen.getByLabelText("Reference") as HTMLInputElement).value).toBe("POL-4829104772"));
    await act(async () => {
      await lockVault();
    });
    await waitFor(() => expect((screen.getByLabelText("Reference") as HTMLInputElement).disabled).toBe(true));
    expect(screen.getByRole("button", { name: "Unlock to view or edit" })).toBeTruthy();
  });

  it("says when the sealed text cannot be opened (damaged, or sealed for another paper)", async () => {
    const { record, key, paper } = await lockedPaper();
    addKeys([[record.id, key]]);
    setup({ editing: { ...paper, id: "someone-else" } });
    openDetails();
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn.t be decrypted/i);
    expect((screen.getByLabelText("Reference") as HTMLInputElement).disabled).toBe(true);
  });
});
