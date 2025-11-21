//src/utils/parseBookmarkHtml.ts
import { Bookmark } from "@/types/bookmark";

export function parseBookmarkHtml(html: string): Bookmark[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const links = Array.from(
    doc.querySelectorAll("a[href]")
  ) as HTMLAnchorElement[];

  const now = new Date().toISOString();

  const bookmarks: Bookmark[] = links.map((a, index) => {
    // Find closest folder title (H3) above in the DOM tree
    let folder: string | undefined;
    let parent: HTMLElement | null = a.parentElement;
    while (parent && !folder) {
      const h3 = parent.querySelector("h3");
      if (h3?.textContent) folder = h3.textContent.trim();
      parent = parent.parentElement;
    }

    return {
      id: `import-${Date.now()}-${index}`,
      title: a.textContent?.trim() || a.href,
      url: a.href,
      note: "",
      folder,
      createdAt: now,
      tags: [], // NEW: start empty, user can add later
    };
  });

  return bookmarks;
}
