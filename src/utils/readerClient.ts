// Client side of `/api/reader`: one request per link per page load. "No article"
// (null) and a failed request ("error") are told apart so the dialog can say which.

import type { Article } from "@/lib/readerExtract";

export type ReaderResult = { article: Article } | { article: null } | "error";

const known = new Map<string, Promise<ReaderResult>>();

export function fetchArticle(url: string): Promise<ReaderResult> {
  const hit = known.get(url);
  if (hit) return hit;
  const p: Promise<ReaderResult> = fetch(`/api/reader?url=${encodeURIComponent(url)}`)
    .then(async (res) => {
      if (!res.ok) return "error" as const;
      const body = (await res.json()) as { article?: Article | null };
      return body.article ? { article: body.article } : { article: null };
    })
    .catch(() => "error" as const);
  known.set(url, p);
  // A failed request isn't remembered: trying again later may well work.
  void p.then((r) => {
    if (r === "error") known.delete(url);
  });
  return p;
}
