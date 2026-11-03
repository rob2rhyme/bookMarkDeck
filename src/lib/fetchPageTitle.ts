// Server only: the title of a page a user typed. The fetch itself — and the fence
// that keeps it on the public internet — is `@/lib/fetchPage`; the parsing is
// `@/lib/pageTitle`. fetchPageTitle.test.ts runs this against a local server.

import { fetchHtml, type FetchHtmlOptions } from "@/lib/fetchPage";
import { extractTitle } from "@/lib/pageTitle";

export type FetchTitleOptions = Pick<FetchHtmlOptions, "allowAddress" | "anyPort">;

/**
 * The title of the page at `raw`, or null for anything else: a page with no
 * title, not HTML, an error, a timeout, more than three redirects, or any hop
 * that would leave the public internet. Never throws.
 */
export async function fetchPageTitle(raw: string, opts: FetchTitleOptions = {}): Promise<string | null> {
  const page = await fetchHtml(raw, { ...opts, stopAtHead: true });
  return page ? extractTitle(page.html) : null;
}
