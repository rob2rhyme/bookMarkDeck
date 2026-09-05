import { describe, expect, it } from "vitest";

import {
  countLabel,
  filingLabelsHtml,
  labelUrl,
  type FilingLabel,
} from "@/features/filing/lib/labels";

const label = (over: Partial<FilingLabel> = {}): FilingLabel => ({
  id: "d2",
  kind: "place",
  name: "Drawer 2",
  path: ["Garage", "Grey cabinet", "Drawer 2"],
  count: 3,
  qrSvg: "<svg><rect /></svg>",
  ...over,
});

describe("labelUrl", () => {
  it("deep-links a place so a phone camera lands on the filtered app", () => {
    expect(labelUrl("https://deck.app", "place", "d2")).toBe(
      "https://deck.app/filing?place=d2"
    );
  });

  it("uses a different key for folders", () => {
    expect(labelUrl("https://deck.app", "folder", "veh")).toBe(
      "https://deck.app/filing?folder=veh"
    );
  });

  it("tolerates a trailing slash on the origin", () => {
    expect(labelUrl("https://deck.app/", "place", "d2")).toBe(
      "https://deck.app/filing?place=d2"
    );
  });

  it("encodes ids that would otherwise break the query string", () => {
    expect(labelUrl("https://deck.app", "place", "a b&c=d")).toBe(
      "https://deck.app/filing?place=a%20b%26c%3Dd"
    );
  });
});

describe("countLabel", () => {
  it("counts folders in a place and papers in a folder", () => {
    expect(countLabel("place", 3)).toBe("3 folders");
    expect(countLabel("folder", 12)).toBe("12 papers");
  });

  it("singularises", () => {
    expect(countLabel("place", 1)).toBe("1 folder");
    expect(countLabel("folder", 1)).toBe("1 paper");
  });

  it("handles zero", () => {
    expect(countLabel("place", 0)).toBe("0 folders");
  });
});

describe("filingLabelsHtml", () => {
  it("embeds the pre-rendered QR", () => {
    expect(filingLabelsHtml([label()])).toContain("<svg><rect /></svg>");
  });

  it("shows the trail ABOVE the label, not the label's own name twice", () => {
    const html = filingLabelsHtml([label()]);
    expect(html).toContain("Garage › Grey cabinet");
    expect(html).not.toContain("Garage › Grey cabinet › Drawer 2</div>");
  });

  it("omits the trail for a top-level place", () => {
    const html = filingLabelsHtml([label({ path: ["Garage"], name: "Garage" })]);
    expect(html).not.toContain('class="path"');
  });

  it("keeps places and folders on separate sheets — they cut differently", () => {
    const html = filingLabelsHtml([
      label(),
      label({ id: "veh", kind: "folder", name: "Vehicles", count: 4 }),
    ]);
    expect(html).toContain("Places — for drawer fronts");
    expect(html).toContain("Folders — for the folder");
    expect(html).toContain('class="grid places"');
    expect(html).toContain('class="grid folders"');
  });

  it("drops a section entirely when it has no labels", () => {
    const html = filingLabelsHtml([label()]);
    expect(html).toContain("Places — for drawer fronts");
    expect(html).not.toContain("Folders — for the folder");
  });

  it("shows whose folder it is when a party is set", () => {
    const html = filingLabelsHtml([
      label({ kind: "folder", name: "Taxes", party: "Acme Ltd" }),
    ]);
    expect(html).toContain("Acme Ltd");
  });

  it("prints what a drawer holds, above its name", () => {
    const html = filingLabelsHtml([label({ name: "Drawer 2", contents: "K-P" })]);
    expect(html).toContain('<div class="holds">K-P</div>');
    expect(html.indexOf('class="holds"')).toBeLessThan(html.indexOf('class="name"'));
  });

  it("leaves the holds line out when a place has no rule", () => {
    expect(filingLabelsHtml([label()])).not.toContain('class="holds"');
  });

  it("escapes markup in what a drawer holds", () => {
    const html = filingLabelsHtml([label({ contents: "<b>A-J</b>" })]);
    expect(html).toContain("&lt;b&gt;A-J&lt;/b&gt;");
  });

  it("escapes names so a stray angle bracket can't break the document", () => {
    const html = filingLabelsHtml([label({ name: 'Bob & <script>alert("x")</script>' })]);
    expect(html).toContain("Bob &amp; &lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("escapes the document title too", () => {
    expect(filingLabelsHtml([label()], "A & B")).toContain("<title>A &amp; B</title>");
  });

  it("produces a valid standalone document even with no labels", () => {
    const html = filingLabelsHtml([]);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("</html>");
  });
});
