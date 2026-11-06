import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FilingAttachment } from "@/features/filing/lib/types";
import { LeftoverScans } from "./LeftoverScans";

const scan = (id: string, size: number) =>
  ({ id, documentId: "gone", name: id, contentType: "application/pdf", size, path: `filing/u/${id}`, addedAt: null }) as FilingAttachment;

describe("LeftoverScans", () => {
  it("finds first, and removes only on a second tap", async () => {
    const found = [scan("a", 600_000), scan("b", 700_000)];
    const api = { find: vi.fn(async () => found), remove: vi.fn(async () => true) };
    render(<LeftoverScans api={api} />);

    fireEvent.click(screen.getByRole("button", { name: "Check for leftover scans" }));
    expect(await screen.findByText(/2 scans \(1\.3 MB\) belong to papers that no longer exist/)).toBeTruthy();
    expect(api.remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove 2 scans" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Removed 2 scans."));
    expect(api.remove).toHaveBeenCalledWith(found);
  });

  it("removes nothing on Keep them, and says so when there is nothing to find", async () => {
    const api = { find: vi.fn(async () => [scan("a", 1)]), remove: vi.fn(async () => true) };
    render(<LeftoverScans api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Check for leftover scans" }));
    fireEvent.click(await screen.findByRole("button", { name: "Keep them" }));
    expect(api.remove).not.toHaveBeenCalled();

    api.find.mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Check for leftover scans" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("No leftover scans."));
  });

  it("says when the cloud can't be reached, or a removal fails", async () => {
    const api = {
      find: vi.fn(async (): Promise<FilingAttachment[]> => Promise.reject(new Error("offline"))),
      remove: vi.fn(async () => false),
    };
    render(<LeftoverScans api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Check for leftover scans" }));
    expect(await screen.findByText(/Couldn.t reach the cloud/)).toBeTruthy();

    api.find.mockResolvedValue([scan("a", 1)]);
    fireEvent.click(screen.getByRole("button", { name: "Check for leftover scans" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove 1 scan" }));
    expect(await screen.findByText(/Nothing was lost/)).toBeTruthy();
  });
});
