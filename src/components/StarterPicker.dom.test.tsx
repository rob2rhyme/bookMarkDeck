import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { StarterPicker } from "@/components/StarterPicker";

const sections = [
  { name: "A", items: [{ key: "a1", label: "One" }, { key: "a2", label: "Two", hint: "two.com" }] },
  { name: "B", emoji: "🌱", items: [{ key: "b1", label: "Three" }] },
];

const renderPicker = (onAdd = vi.fn(), onClose = vi.fn()) => {
  render(
    <StarterPicker
      open
      onClose={onClose}
      onAdd={onAdd}
      title="Start with a few"
      intro="Pick some."
      noun={["thing", "things"]}
      sections={sections}
    />
  );
  return { onAdd, onClose };
};

describe("StarterPicker", () => {
  it("adds nothing until something is picked", () => {
    renderPicker();
    expect((screen.getByRole("button", { name: "Add things" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("toggles picks and adds them in one go", () => {
    const { onAdd, onClose } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /One/ }));
    fireEvent.click(screen.getByRole("button", { name: /Three/ }));
    fireEvent.click(screen.getByRole("button", { name: /Two/ }));
    fireEvent.click(screen.getByRole("button", { name: /Two/ })); // un-picked again
    expect(screen.getByRole("button", { name: /One/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Add 2 things" }));
    expect(onAdd).toHaveBeenCalledWith(["a1", "b1"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("says the singular for one pick, and adds nothing on 'I'll add my own'", () => {
    const { onAdd, onClose } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /One/ }));
    expect((screen.getByRole("button", { name: "Add 1 thing" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "I'll add my own" }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
