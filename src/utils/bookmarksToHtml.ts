//src/utils/bookmarksToHtml.ts
import { Bookmark } from "@/types/bookmark";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function bookmarksToNetscapeHtml(bookmarks: Bookmark[]): string {
  const sorted = [...bookmarks].sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const folders = new Map<string, Bookmark[]>();
  const root: Bookmark[] = [];

  for (const b of sorted) {
    if (b.folder) {
      if (!folders.has(b.folder)) folders.set(b.folder, []);
      folders.get(b.folder)!.push(b);
    } else {
      root.push(b);
    }
  }

  const lines: string[] = [];

  // Header
  lines.push(`<!DOCTYPE NETSCAPE-Bookmark-file-1>`);
  lines.push(`<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">`);
  lines.push(`<TITLE>Bookmark Deck Export</TITLE>`);
  lines.push(`<H1>Bookmark Deck Export</H1>`);
  lines.push(`<DL><p>`);

  const toUnix = (iso: string) =>
    Math.floor(new Date(iso).getTime() / 1000).toString();

  const writeBookmark = (b: Bookmark) => {
    const url = escapeHtml(b.url);
    const title = escapeHtml(b.title || b.url);
    const addDate = toUnix(b.createdAt);
    const tagsAttr =
      b.tags && b.tags.length > 0
        ? ` TAGS="${escapeHtml(b.tags.join(","))}"`
        : "";

    lines.push(
      `<DT><A HREF="${url}" ADD_DATE="${addDate}"${tagsAttr}>${title}</A>`
    );

    // Optionally include notes as a <DD> description
    if (b.note && b.note.trim().length > 0) {
      lines.push(`<DD>${escapeHtml(b.note.trim())}`);
    }
  };

  // Root bookmarks
  for (const b of root) {
    writeBookmark(b);
  }

  // Foldered bookmarks
  for (const [folderName, items] of folders.entries()) {
    lines.push(
      `<DT><H3>${escapeHtml(folderName)}</H3>`,
      `<DL><p>`
    );

    for (const b of items) {
      writeBookmark(b);
    }

    lines.push(`</DL><p>`);
  }

  // Close root DL
  lines.push(`</DL><p>`);

  return lines.join("\n");
}
