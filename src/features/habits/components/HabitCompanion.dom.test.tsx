import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { HabitCompanion } from "@/features/habits/components/HabitCompanion";

const KEY = "bd:companion:v1:me@example.com";

const view = (over: Partial<React.ComponentProps<typeof HabitCompanion>> = {}) => (
  <HabitCompanion
    account="me@example.com"
    ready
    checkins={10}
    dueToday={3}
    doneToday={0}
    lastDoneDay="2026-11-02"
    today="2026-11-03"
    {...over}
  />
);

beforeEach(() => window.localStorage.clear());

describe("HabitCompanion", () => {
  it("shows its stage and how far to the next, and a kind line using its name", () => {
    render(view());
    const card = screen.getByRole("region", { name: "Your companion" });
    expect(card.textContent).toContain("Sprout"); // default name
    expect(card.textContent).toContain("Seedling"); // stage at 7–29
    expect(card.textContent).toContain("20 more check-ins to Young plant");
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Sprout, Seedling, waiting for you");
  });

  it("shows nothing until the page's data has loaded", () => {
    const { container } = render(view({ ready: false }));
    expect(container.textContent).toBe("");
  });

  it("grows on its own as check-ins rise", () => {
    const { rerender } = render(view({ checkins: 29 }));
    expect(screen.getByRole("region").textContent).toContain("1 more check-in to Young plant");
    rerender(view({ checkins: 30 }));
    expect(screen.getByRole("region").textContent).toContain("60 more check-ins to In leaf");
  });

  it("can be renamed, remembered per account, and cancelled", () => {
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Companion name"), { target: { value: "  Moss  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("heading", { name: "Moss" })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({ name: "Moss", hidden: false });

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Companion name"), { target: { value: "Nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Moss" })).toBeTruthy();
  });

  it("falls back to the default name for a blank rename", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ name: "Moss", hidden: false }));
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Companion name"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("heading", { name: "Sprout" })).toBeTruthy();
  });

  it("can be hidden and brought back, and a hidden one stays hidden on the next visit", () => {
    const first = render(view());
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("region")).toBeNull();
    first.unmount();

    render(view());
    expect(screen.queryByRole("region")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show Sprout" }));
    expect(screen.getByRole("region", { name: "Your companion" })).toBeTruthy();
  });

  it("keeps each account's companion separate", () => {
    window.localStorage.setItem("bd:companion:v1:other@example.com", JSON.stringify({ name: "Fern", hidden: false }));
    render(view());
    expect(screen.getByRole("heading").textContent).toBe("Sprout");
  });

  it("says welcome back after a gap, without scolding", () => {
    render(view({ lastDoneDay: "2026-10-20" }));
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("glad you're back");
    expect(screen.getByRole("region").textContent).not.toMatch(/miss|lost|wilt|streak|behind/i);
  });
});
