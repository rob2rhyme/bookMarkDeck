import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { InventoryItem } from "@/features/inventory/lib/types";
import { BorrowedLedgerModal } from "./BorrowedLedgerModal";

// "Returned 2026-10-01" was the UTC date of the return: give a borrowed drill
// back on a US evening and the ledger said you returned it tomorrow. The same
// slice labelled lending history and attachments. CI runs in UTC, where the
// two dates agree, so this pins a zone.
describe("BorrowedLedgerModal — returned day", () => {
  const savedTz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "America/Los_Angeles";
  });
  afterEach(() => {
    process.env.TZ = savedTz;
  });

  it("labels a return with its LOCAL day", () => {
    const drill = {
      id: "i1",
      name: "Drill",
      photos: [],
      tags: [],
      origin: "borrowed",
      status: "returned",
      activity: [{ id: "a1", type: "refunded", at: "2026-10-01T03:00:00.000Z" }], // 8pm Sep 30
    } as unknown as InventoryItem;
    render(
      <BorrowedLedgerModal
        open
        items={[drill]}
        fallbackCurrency="USD"
        today="2026-10-01"
        onPick={() => {}}
        onGiveBack={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("returned 2026-09-30")).toBeTruthy();
  });
});
