import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { parseMarkdown } from "@/features/notes/lib/markdown";
import { Markdown } from "./Markdown";

const md = (src: string, onToggleTask?: (line: number) => void) =>
  render(<Markdown blocks={parseMarkdown(src)} onToggleTask={onToggleTask} />);

describe("Markdown", () => {
  it("renders structure as real elements", () => {
    md("# Plan\n\n**Bold** and *em*\n\n> quote\n\n1. one\n2. two\n\n| a | b |\n|---|--:|\n| 1 | 2 |\n\n```\ncode\n```");
    expect(screen.getByRole("heading", { level: 1, name: "Plan" })).toBeTruthy();
    expect(screen.getByText("Bold").tagName).toBe("STRONG");
    expect(screen.getByText("em").tagName).toBe("EM");
    expect(document.querySelector("blockquote")?.textContent).toBe("quote");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("cell", { name: "2" }).className).toContain("text-right");
    expect(document.querySelector("pre code")?.textContent).toBe("code");
  });

  it("opens links in a new tab without leaking the opener", () => {
    md("[docs](https://x.dev)");
    const a = screen.getByRole("link", { name: "docs" });
    expect(a.getAttribute("href")).toBe("https://x.dev");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("never turns note text into live HTML or a script link", () => {
    md('<img src=x onerror="alert(1)">\n\n[click](javascript:alert(1))');
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.body.textContent).toContain("<img src=x onerror=");
  });

  it("task checkboxes report their source line", () => {
    const onToggle = vi.fn();
    md("intro\n\n- [ ] one\n- [x] two", onToggle);
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([false, true]);
    fireEvent.click(boxes[1]);
    expect(onToggle).toHaveBeenCalledWith(3);
  });
});
