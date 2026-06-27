"use client";

// ⌘K / Ctrl-K command palette. Mounted once (in GlobalClientUI). Offers
// navigation, quick actions, and fuzzy bookmark open. Other UI can open it by
// dispatching a `bd:open-command-palette` window event (used by mobile nav).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Modal } from "@/components/Modal";

export const OPEN_COMMAND_PALETTE_EVENT = "bd:open-command-palette";

type CachedBookmark = { id: string; title: string; url: string };

type Command = {
  id: string;
  label: string;
  hint?: string;
  group: "Navigation" | "Actions" | "Bookmarks";
  keywords?: string;
  run: () => void;
};

/** Read bookmarks from every per-user localStorage cache, deduped by URL. */
function readCachedBookmarks(): CachedBookmark[] {
  if (typeof window === "undefined") return [];
  const seen = new Set<string>();
  const out: CachedBookmark[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith("bookmarkdeck:v2")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed?.bookmarks) ? parsed.bookmarks : [];
      for (const b of list) {
        if (typeof b?.url !== "string" || seen.has(b.url)) continue;
        seen.add(b.url);
        out.push({
          id: typeof b.id === "string" ? b.id : b.url,
          title: typeof b.title === "string" && b.title ? b.title : b.url,
          url: b.url,
        });
      }
    }
  } catch {
    /* ignore malformed cache */
  }
  return out;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [bookmarks, setBookmarks] = useState<CachedBookmark[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const openPalette = useCallback(() => {
    setBookmarks(readCachedBookmarks());
    setQuery("");
    setActive(0);
    setOpen(true);
  }, []);

  // Global ⌘K / Ctrl-K + the custom open event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (!v) {
            setBookmarks(readCachedBookmarks());
            setQuery("");
            setActive(0);
          }
          return !v;
        });
      }
    };
    const onOpen = () => openPalette();
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    };
  }, [openPalette]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => {
      close();
      router.push(href);
    };
    const nav: Command[] = [
      { id: "nav-home", label: "Go to Bookmarks", group: "Navigation", run: go("/") },
      { id: "nav-focus", label: "Go to Focus", group: "Navigation", run: go("/focus") },
      { id: "nav-folders", label: "Manage folders", group: "Navigation", run: go("/folders/manage") },
      { id: "nav-faq", label: "Open FAQ", group: "Navigation", run: go("/faq") },
    ];
    const actions: Command[] = [
      {
        id: "act-add",
        label: "Add a bookmark",
        hint: "on Bookmarks",
        group: "Actions",
        run: () => {
          close();
          try {
            localStorage.setItem("bd:intent:add-bookmark", "1");
          } catch {
            /* ignore */
          }
          router.push("/");
        },
      },
      {
        id: "act-focus",
        label: "Start a focus session",
        group: "Actions",
        run: go("/focus"),
      },
    ];
    const marks: Command[] = bookmarks.map((b) => ({
      id: `bm-${b.id}`,
      label: b.title,
      hint: b.url.replace(/^https?:\/\/(www\.)?/, ""),
      group: "Bookmarks",
      keywords: `${b.title} ${b.url}`,
      run: () => {
        close();
        window.open(b.url, "_blank", "noopener,noreferrer");
      },
    }));
    return [...nav, ...actions, ...marks];
  }, [bookmarks, router, close]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 50);
    return commands
      .filter((c) =>
        `${c.label} ${c.hint ?? ""} ${c.keywords ?? ""}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 50);
  }, [commands, query]);

  // Keep the active index in range and scrolled into view.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[active]?.run();
    }
  };

  let lastGroup = "";

  return (
    <Modal
      open={open}
      onClose={close}
      label="Command palette"
      overlayClassName="flex items-stretch justify-center sm:items-start sm:px-4 sm:py-[8vh]"
      panelClassName="flex h-[100dvh] w-full flex-col overflow-hidden border-slate-800 bg-slate-900 shadow-2xl outline-none sm:h-auto sm:max-w-[45rem] sm:rounded-2xl sm:border"
    >
      <input
        ref={inputRef}
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onInputKey}
        placeholder="Search actions and bookmarks…"
        aria-label="Search commands"
        className="w-full shrink-0 border-b border-slate-800 bg-transparent px-5 py-4 text-[15px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
      />
      <ul
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto py-2 sm:max-h-[65vh] sm:flex-none"
      >
        {filtered.length === 0 ? (
          <li className="px-5 py-6 text-center text-sm text-slate-500">
            No matches.
          </li>
        ) : (
          filtered.map((c, i) => {
            const showGroup = c.group !== lastGroup;
            lastGroup = c.group;
            return (
              <li key={c.id}>
                {showGroup && (
                  <p className="px-5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {c.group}
                  </p>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => c.run()}
                  className={`flex w-full items-center justify-between gap-3 px-5 py-2 text-left text-sm ${
                    i === active
                      ? "bg-slate-800 text-slate-50"
                      : "text-slate-200"
                  }`}
                >
                  <span className="min-w-0 truncate">{c.label}</span>
                  {c.hint && (
                    <span className="shrink-0 truncate text-xs text-slate-500">
                      {c.hint}
                    </span>
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>
      <div className="flex shrink-0 items-center justify-between border-t border-slate-800 px-5 py-2 text-[11px] text-slate-500">
        <span>↑↓ to navigate · ↵ to open</span>
        <span>⌘K</span>
      </div>
    </Modal>
  );
}

export default CommandPalette;
