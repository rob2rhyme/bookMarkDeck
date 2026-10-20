import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { TagEditor } from "./TagEditor";
import type { TagCount } from "@/features/notes/lib/tags";

const COUNTS: TagCount[] = [
  { tag: "work", count: 5 },
  { tag: "home", count: 3 },
  { tag: "homework", count: 1 },
];

function Harness({ initial = [] as string[] }) {
  const [tags, setTags] = useState(initial);
  return (
    <>
      <TagEditor tags={tags} counts={COUNTS} onChange={setTags} />
      <output data-testid="tags">{tags.join(",")}</output>
    </>
  );
}
const tags = () => screen.getByTestId("tags").textContent;
const input = () => screen.getByRole("combobox", { name: "Add tag" });

describe("TagEditor", () => {
  it("adds a normalised tag on Enter and ignores duplicates", () => {
    render(<Harness initial={["work"]} />);
    fireEvent.change(input(), { target: { value: "#To Do" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(tags()).toBe("work,to-do");
    fireEvent.change(input(), { target: { value: "WORK" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(tags()).toBe("work,to-do");
  });

  it("commits on a typed or pasted comma", () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: "a, b,c" } });
    expect(tags()).toBe("a,b");
    expect((input() as HTMLInputElement).value).toBe("c");
  });

  it("suggests existing tags; arrow keys + Enter pick one", () => {
    render(<Harness initial={["home"]} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "ho" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["#homework"]);
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(tags()).toBe("home,homework");
  });

  it("Backspace on an empty input removes the last tag; × removes one", () => {
    render(<Harness initial={["a", "b", "c"]} />);
    fireEvent.keyDown(input(), { key: "Backspace" });
    expect(tags()).toBe("a,b");
    fireEvent.click(screen.getByRole("button", { name: "Remove tag a" }));
    expect(tags()).toBe("b");
  });

  it("keeps a typed tag on blur, but not after Esc", () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: "kept" } });
    fireEvent.blur(input());
    expect(tags()).toBe("kept");
    fireEvent.change(input(), { target: { value: "dropped" } });
    fireEvent.keyDown(input(), { key: "Escape" });
    fireEvent.blur(input());
    expect(tags()).toBe("kept");
  });
});
