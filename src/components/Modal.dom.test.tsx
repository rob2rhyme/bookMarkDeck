import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { Modal } from "@/components/Modal";

// What every dialog in the app inherits. (Tab-cycling needs real layout — jsdom has
// no offsetParent — so that part is pinned in the browser, e2e/dialogs.spec.ts.)

function Harness({ onClose = () => {}, autoFocusInput = false }: { onClose?: () => void; autoFocusInput?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <Modal
          open
          label="Example"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <button>First</button>
          <input aria-label="Field" autoFocus={autoFocusInput} />
          <button>Last</button>
        </Modal>
      )}
    </>
  );
}

const openIt = () => {
  const opener = screen.getByRole("button", { name: "Open" });
  opener.focus();
  fireEvent.click(opener);
  return opener;
};

// The inner dialog is opened from the outer one, as Add link → New folder is.
function Stacked({ outer, inner }: { outer: () => void; inner: () => void }) {
  const [showInner, setShowInner] = useState(false);
  const [showOuter, setShowOuter] = useState(true);
  return (
    <>
      {showOuter && (
        <Modal open label="Outer" onClose={() => (outer(), setShowOuter(false))}>
          <button onClick={() => setShowInner(true)}>Open inner</button>
        </Modal>
      )}
      {showInner && (
        <Modal open label="Inner" onClose={() => (inner(), setShowInner(false))}>
          <button>Inner button</button>
        </Modal>
      )}
    </>
  );
}

describe("Modal", () => {
  it("is a labelled, modal dialog", () => {
    render(<Harness />);
    openIt();
    const dialog = screen.getByRole("dialog", { name: "Example" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("focuses the first focusable element, unless a field already took focus (autoFocus)", () => {
    const first = render(<Harness />);
    openIt();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
    first.unmount();

    render(<Harness autoFocusInput />);
    openIt();
    expect(document.activeElement).toBe(screen.getByLabelText("Field"));
  });

  it("gives focus back to what opened it even when a field inside took focus with autoFocus", () => {
    // The field grabs focus during React's commit, before any effect of the Modal
    // runs — so "what was focused before" has to be recorded earlier than that.
    render(<Harness autoFocusInput />);
    const opener = openIt();
    expect(document.activeElement).toBe(screen.getByLabelText("Field"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes on Escape, and gives focus back to what opened it", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = openIt();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes when the backdrop is pressed, not when the panel is", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openIt();
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(dialog);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Last" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(dialog.parentElement!); // the overlay
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a drag that starts inside and ends on the backdrop doesn't close it (only the press counts)", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openIt();
    const dialog = screen.getByRole("dialog");
    const overlay = dialog.parentElement!;
    fireEvent.mouseDown(screen.getByLabelText("Field")); // select text inside…
    fireEvent.mouseUp(overlay); // …release over the backdrop
    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks page scroll while open and restores it after", () => {
    render(<Harness />);
    expect(document.body.style.position).toBe("");
    openIt();
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.position).toBe("");
    expect(document.body.style.overflow).toBe("");
  });

  it("renders into the body, above the app's stacking contexts", () => {
    const { container } = render(<Harness />);
    openIt();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it("with one opened over another, Escape closes only the top one, then the next", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(<Stacked outer={outer} inner={inner} />);
    fireEvent.click(screen.getByRole("button", { name: "Open inner" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(outer).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a dialog rendered inside another's children is on top of it, even mounting together", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <Modal open label="Outer" onClose={outer}>
        <button>Outer button</button>
        <Modal open label="Inner" onClose={inner}>
          <button>Inner button</button>
        </Modal>
      </Modal>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
});
