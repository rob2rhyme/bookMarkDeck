import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfidentialBar } from "./ConfidentialBar";

// The Filing PIN lock's one line: what it says in each state, and that unlocking closes the
// dialog for good (it used to be able to pop open again the next time the lock came on).
function setup(props: Partial<React.ComponentProps<typeof ConfidentialBar>> = {}) {
  const handlers = {
    onUnlockPin: vi.fn(async (pin: string) => pin === "4821"),
    onUnlockBiometric: vi.fn(async () => false),
    onReset: vi.fn(),
    onLockNow: vi.fn(),
    onManage: vi.fn(),
  };
  const base = { ready: true, enabled: true, locked: true, count: 2, hasBiometric: false, biometricAvailable: false, ...handlers };
  const view = render(<ConfidentialBar {...base} {...props} />);
  const again = (next: Partial<React.ComponentProps<typeof ConfidentialBar>>) =>
    view.rerender(<ConfidentialBar {...base} {...props} {...next} />);
  return { ...handlers, again };
}

describe("ConfidentialBar", () => {
  it("says nothing until the lock's settings have been read", () => {
    setup({ ready: false });
    expect(document.body.textContent).toBe("");
  });

  it("with no PIN set, offers one — but only if there is something to hide", () => {
    const { onManage } = setup({ enabled: false, locked: false });
    expect(document.body.textContent).toMatch(/2 confidential papers — set a PIN to hide them/);
    fireEvent.click(screen.getByRole("button", { name: "Set a PIN" }));
    expect(onManage).toHaveBeenCalled();
  });

  it("with no PIN and no confidential papers, shows nothing", () => {
    setup({ enabled: false, locked: false, count: 0 });
    expect(document.body.textContent).toBe("");
  });

  it("locked: says how many are hidden, and says nothing when none are", () => {
    setup();
    expect(screen.getByRole("status").textContent).toMatch(/2 confidential papers hidden/);
  });

  it("locked with nothing confidential: no bar at all", () => {
    setup({ count: 0 });
    expect(document.body.textContent).toBe("");
  });

  it("singular reads right", () => {
    setup({ count: 1 });
    expect(screen.getByRole("status").textContent).toMatch(/1 confidential paper hidden/);
  });

  it("a wrong PIN keeps the dialog open; the right one closes it", async () => {
    const { onUnlockPin, again } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    const dialog = await screen.findByRole("dialog", { name: "Unlock confidential papers" });
    expect(dialog.textContent).toMatch(/reference and note stay sealed until you unlock your vault/);

    const pin = screen.getByLabelText("PIN");
    fireEvent.change(pin, { target: { value: "0000" } });
    fireEvent.submit(pin.closest("form")!);
    await waitFor(() => expect(onUnlockPin).toHaveBeenCalledWith("0000"));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "4821" } });
    fireEvent.submit(screen.getByLabelText("PIN").closest("form")!);
    await waitFor(() => expect(onUnlockPin).toHaveBeenCalledWith("4821"));

    // The parent now reports unlocked; and when the lock comes on AGAIN the dialog stays shut.
    again({ locked: false });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    again({ locked: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("unlocked: says so and offers Lock now", () => {
    const { onLockNow } = setup({ locked: false });
    expect(screen.getByRole("status").textContent).toMatch(/2 confidential papers showing/);
    fireEvent.click(screen.getByRole("button", { name: "Lock now" }));
    expect(onLockNow).toHaveBeenCalled();
  });

  it("unlocked with none confidential: still says the lock is on, so Lock now is reachable", () => {
    setup({ locked: false, count: 0 });
    expect(screen.getByRole("status").textContent).toMatch(/PIN lock is on/);
  });

  it("resetting from the dialog turns the lock off and closes it", async () => {
    const { onReset } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Forgot your PIN?" }));
    expect(document.body.textContent).toMatch(/Nothing is deleted/);
    fireEvent.click(screen.getByRole("button", { name: /Reset & reveal/ }));
    expect(onReset).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
