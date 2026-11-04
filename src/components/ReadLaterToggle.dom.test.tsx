import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ReadLaterToggle } from "@/components/ReadLaterToggle";

const NOW = new Date().toISOString();

describe("ReadLaterToggle", () => {
  it("offers to queue a bookmark that isn't", () => {
    const onChange = vi.fn();
    render(<ReadLaterToggle bookmark={{}} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Read later/ }));
    const patch = onChange.mock.calls[0][0];
    expect(typeof patch.readLaterAt).toBe("string");
    expect(patch.readAt).toBeUndefined();
  });

  it("a queued one shows how long it has waited, and can be marked read or removed", () => {
    const onChange = vi.fn();
    const { container } = render(<ReadLaterToggle bookmark={{ readLaterAt: NOW }} onChange={onChange} />);
    expect(container.textContent).toContain("In your queue · today");
    fireEvent.click(screen.getByRole("button", { name: "Mark read" }));
    expect(typeof onChange.mock.calls[0][0].readAt).toBe("string");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onChange.mock.calls[1][0]).toEqual({ readLaterAt: undefined, readAt: undefined });
  });

  it("a finished one says so and can be queued again (which un-finishes it)", () => {
    const onChange = vi.fn();
    const { container } = render(<ReadLaterToggle bookmark={{ readLaterAt: NOW, readAt: NOW }} onChange={onChange} />);
    expect(container.textContent).toContain("Read");
    expect(screen.queryByRole("button", { name: "Mark read" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Queue again" }));
    expect(onChange.mock.calls[0][0].readAt).toBeUndefined();
    expect(typeof onChange.mock.calls[0][0].readLaterAt).toBe("string");
  });
});
