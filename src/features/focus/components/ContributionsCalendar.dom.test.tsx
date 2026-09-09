import { describe, it, expect, vi } from "vitest";
// fireEvent rather than user-event: a click is all this needs, and
// @testing-library/react is already a dependency where user-event is not.
import { fireEvent, render, screen } from "@testing-library/react";

import { ContributionsCalendar, levelFor } from "./ContributionsCalendar";

/**
 * The help toggle exists because it was silently lost once: a large unrelated
 * commit deleted the button while reflowing this footer, leaving the `showHelp`
 * state and the paragraph it gates behind. The explanation was unreachable in
 * `main` for months, and the only complaint was an ESLint warning about an
 * unused setter. Nothing failed, so nothing noticed — hence this test.
 */
describe("ContributionsCalendar help toggle", () => {
  const setup = () =>
    render(
      <ContributionsCalendar
        counts={new Map([["2026-01-01", 3]])}
        selected=""
        onSelect={vi.fn()}
      />
    );

  const HELP = /each square is a day/i;
  const TRIGGER = /learn how we count contributions/i;

  it("hides the explanation until asked", () => {
    setup();
    expect(screen.getByRole("button", { name: TRIGGER })).toBeTruthy();
    expect(screen.queryByText(HELP)).toBeNull();
  });

  it("reveals the explanation when the link is clicked, and hides it again", () => {
    setup();
    const trigger = screen.getByRole("button", { name: TRIGGER });

    fireEvent.click(trigger);
    expect(screen.getByText(HELP)).toBeTruthy();

    fireEvent.click(trigger);
    expect(screen.queryByText(HELP)).toBeNull();
  });
});

describe("levelFor", () => {
  // The thresholds decide the heatmap's colour, so pin the boundaries.
  it("maps counts onto the five levels at their boundaries", () => {
    expect([0, -1].map(levelFor)).toEqual([0, 0]);
    expect([1, 2].map(levelFor)).toEqual([1, 1]);
    expect([3, 4].map(levelFor)).toEqual([2, 2]);
    expect([5, 7].map(levelFor)).toEqual([3, 3]);
    expect([8, 99].map(levelFor)).toEqual([4, 4]);
  });
});
