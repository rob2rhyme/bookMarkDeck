//src/utils/parseBookmarkHtml.ts

/** One link from a Netscape bookmarks file, with the folders it sits in. */
export type ParsedBookmark = {
  title: string;
  url: string;
  note: string;
  tags: string[];
  createdAt: string;
  /** Outermost first; [] for a link at the top level. */
  folderPath: string[];
  /** A favourite in the service it came from (CSV exports only). */
  pinned?: boolean;
};

/**
 * Read a Netscape bookmarks file — what every browser exports, and what our
 * own export writes. Each folder is `<DT><H3>name</H3><DL>…</DL>`, so a link's
 * folders are the headings of the `<DL>`s it sits in, walked outward. (Taking
 * the first `<H3>` inside each ancestor, as this used to, credits the direct
 * links of any list that also holds a subfolder to that subfolder.)
 */
export function parseBookmarkHtml(html: string): ParsedBookmark[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const links = Array.from(doc.querySelectorAll("a[href]")) as HTMLAnchorElement[];
  const now = new Date().toISOString();

  return links.map((a) => {
    const folderPath: string[] = [];
    let list = a.closest("dl");
    while (list) {
      const heading = list.parentElement?.querySelector(":scope > h3");
      const name = heading?.textContent?.trim();
      if (name) folderPath.unshift(name);
      list = list.parentElement?.closest("dl") ?? null;
    }

    // Pocket's export is not a Netscape file: <h1>Unread</h1><ul><li><a time_added=…>,
    // then <h1>Read Archive</h1> and another list. It has no folders, so its two
    // lists become one "Pocket" folder (and a "Read archive" subfolder).
    const pocketAdded = a.getAttribute("time_added");
    if (folderPath.length === 0 && pocketAdded !== null) {
      folderPath.push("Pocket");
      const heading = a.closest("ul")?.previousElementSibling;
      if (heading?.tagName === "H1" && /archive/i.test(heading.textContent ?? "")) {
        folderPath.push("Read archive");
      }
    }

    // A description is the <DD> straight after the link's <DT>.
    const next = a.closest("dt")?.nextElementSibling;
    const note = next?.tagName === "DD" ? (next.textContent ?? "").trim() : "";

    const tags = (a.getAttribute("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const added = Number(a.getAttribute("add_date") ?? pocketAdded);
    const createdAt =
      Number.isFinite(added) && added > 0 ? new Date(added * 1000).toISOString() : now;

    return {
      title: a.textContent?.trim() || a.href,
      url: a.href,
      note,
      tags,
      createdAt,
      folderPath,
    };
  });
}
