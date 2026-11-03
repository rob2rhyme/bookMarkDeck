import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { SyncBanner } from "@/components/SyncBanner";

const base = {
  subject: "inventory",
  email: "me@example.com",
  connected: false,
  connecting: false,
  onConnect: () => {},
};

describe("SyncBanner", () => {
  it("says where the data lives, singular and plural, and offers sign-in", () => {
    const onConnect = vi.fn();
    const { rerender, container } = render(<SyncBanner {...base} onConnect={onConnect} />);
    expect(container.textContent).toContain("Your inventory stays on this device. Sync to save it to your account.");
    fireEvent.click(screen.getByRole("button", { name: "Sign in to sync" }));
    expect(onConnect).toHaveBeenCalledTimes(1);

    rerender(<SyncBanner {...base} subject="notes" plural />);
    expect(container.textContent).toContain("Your notes stay on this device. Sync to save them to your account.");
  });

  it("shows connecting state and an error, and can't be pressed without an account", () => {
    const { rerender } = render(<SyncBanner {...base} connecting error="Popup closed" />);
    const button = screen.getByRole("button", { name: "Connecting…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Popup closed")).toBeTruthy();
    rerender(<SyncBanner {...base} email={null} />);
    expect((screen.getByRole("button", { name: "Sign in to sync" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("connected: a synced line with the two manual buttons, and a message", () => {
    const from = vi.fn();
    const to = vi.fn();
    render(
      <SyncBanner {...base} connected onSyncFromCloud={from} onSyncToCloud={to} message="Uploaded 3 items." />
    );
    expect(screen.getByText(/Synced to your account/)).toBeTruthy();
    expect(screen.getByText("Uploaded 3 items.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sync from cloud" }));
    fireEvent.click(screen.getByRole("button", { name: "Sync to cloud" }));
    expect(from).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledTimes(1);
  });

  it("disables both manual buttons while a sync is running", () => {
    render(<SyncBanner {...base} connected syncing onSyncFromCloud={() => {}} onSyncToCloud={() => {}} />);
    for (const name of ["Sync from cloud", "Sync to cloud"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("connected with no manual buttons shows only the status; a page can replace the line", () => {
    const { rerender, container } = render(<SyncBanner {...base} connected />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<SyncBanner {...base} connected connectedMessage={<p>Loading your papers…</p>} />);
    expect(container.textContent).toBe("Loading your papers…");
  });

  it("renders nothing once connected when the page asks to hide it", () => {
    const { container } = render(<SyncBanner {...base} connected hideWhenConnected />);
    expect(container.textContent).toBe("");
  });
});
