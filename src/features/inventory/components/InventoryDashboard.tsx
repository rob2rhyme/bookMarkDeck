"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { HandHelping, Layers, MapPin, Package, Plus, Search, Sparkles, Tag, X } from "@/components/icons";
import { downloadText } from "@/utils/download";
import {
  deleteItemDoc,
  deleteItemDocs,
  fetchItemDocs,
  restoreInventoryBackup,
  saveItemDoc,
} from "@/features/inventory/data/inventoryData";
import { useBookmarkLibrary } from "@/features/inventory/hooks/useBookmarkLibrary";
import { useWishlist } from "@/features/inventory/hooks/useWishlist";
import { useFocusProjects } from "@/features/inventory/hooks/useFocusProjects";
import { useInventory, blankItem } from "@/features/inventory/hooks/useInventory";
import {
  flattenTree,
  useInventoryLocations,
} from "@/features/inventory/hooks/useInventoryLocations";
import { useInventorySettings } from "@/features/inventory/hooks/useInventorySettings";
import { useInventorySync } from "@/features/inventory/hooks/useInventorySync";
import {
  backupCount,
  inventoryFromJson,
  inventoryToJson,
  itemsToCsv,
} from "@/features/inventory/lib/exportInventory";
import { todayKey } from "@/features/inventory/data/inventoryData";
import {
  logActivity,
  type ActivityType,
} from "@/features/focus/data/focusData";
import { deleteInventoryObjects } from "@/features/inventory/lib/uploadPhoto";
import type {
  InventoryItem,
  ItemDoc,
  WishlistItem,
} from "@/features/inventory/lib/types";
import { locationPathsById } from "@/features/inventory/lib/inventorySearch";
import { formatMoney, totalValue } from "@/features/inventory/lib/value";
import { useRediscover } from "@/features/inventory/hooks/useRediscover";
import { AttentionPanel } from "@/features/inventory/components/AttentionPanel";
import { ItemCard } from "@/features/inventory/components/ItemCard";
import { ItemDetailModal } from "@/features/inventory/components/ItemDetailModal";
import { RediscoverCard } from "@/features/inventory/components/RediscoverCard";
import { WishlistModal } from "@/features/inventory/components/WishlistModal";
import { wishlistToInventoryItem } from "@/features/inventory/lib/wishlist";
import { MaintenanceCalendarModal } from "@/features/inventory/components/MaintenanceCalendarModal";
import { upkeepCount } from "@/features/inventory/lib/maintenanceCalendar";
import { StarterRoomsCard } from "@/features/inventory/components/StarterRoomsCard";
import { useStarterRooms } from "@/features/inventory/hooks/useStarterRooms";
import { missingStarterRooms } from "@/features/inventory/lib/starterRooms";
import { ItemFormModal } from "@/features/inventory/components/ItemFormModal";
import { LocationManager } from "@/features/inventory/components/LocationManager";
import { ValuePanel } from "@/features/inventory/components/ValuePanel";
import { WhereIsModal } from "@/features/inventory/components/WhereIsModal";
import { LendingLedgerModal } from "@/features/inventory/components/LendingLedgerModal";
import { DeclutterModal } from "@/features/inventory/components/DeclutterModal";
import { CollectionsModal } from "@/features/inventory/components/CollectionsModal";
import { lendingLedger } from "@/features/inventory/lib/lending";
import { declutterSummary } from "@/features/inventory/lib/declutter";
import { collectionGroups, collectionNames } from "@/features/inventory/lib/collections";
import {
  buildInsuranceReport,
  insuranceReportHtml,
} from "@/features/inventory/lib/insuranceReport";

/** Merge-by-id where EXISTING records win — imports only add what's missing,
 *  keeping the "nothing is overwritten" promise (a stale backup can't clobber
 *  recent edits). */
function mergeById<T extends { id: string }>(prev: T[], incoming: T[]): T[] {
  const map = new Map(prev.map((x) => [x.id, x]));
  for (const x of incoming) if (!map.has(x.id)) map.set(x.id, x);
  return [...map.values()];
}

function matches(item: InventoryItem, q: string): boolean {
  if (!q) return true;
  const hay = [
    item.name,
    item.category,
    item.manufacturer,
    item.model,
    item.serial,
    item.barcode,
    item.notes,
    item.projectName,
    item.collection,
    item.tags.join(" "),
    item.links.map((l) => l.title).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

export function InventoryDashboard() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;
  const { connected, connecting, error, connect } = useInventorySync(email);

  const { settings, update } = useInventorySettings(email, connected);
  const inv = useInventory(email, connected);
  const loc = useInventoryLocations(email, connected);
  const bookmarkLibrary = useBookmarkLibrary(email);
  const wishlist = useWishlist(email, connected);
  const focusProjects = useFocusProjects(email);

  // Compute "today" after mount so warranty math is hydration-safe.
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(todayKey());
    // Refresh across midnight so long-lived tabs don't stamp yesterday on
    // lends/releases or show day-off warranty chips.
    const id = setInterval(() => {
      setToday((prev) => {
        const now = todayKey();
        return prev === now ? prev : now;
      });
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [locOpen, setLocOpen] = useState(false);
  const [whereOpen, setWhereOpen] = useState(false);
  const [lendOpen, setLendOpen] = useState(false);
  const [declutterOpen, setDeclutterOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [dataMsg, setDataMsg] = useState<string | null>(null);

  const categorySuggestions = useMemo(
    () =>
      [...new Set(inv.items.map((i) => i.category?.trim()).filter(Boolean))].sort() as string[],
    [inv.items]
  );

  const countByLocation = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of inv.active) if (i.locationId) c[i.locationId] = (c[i.locationId] ?? 0) + 1;
    return c;
  }, [inv.active]);

  const lending = useMemo(() => lendingLedger(inv.active, today), [inv.active, today]);
  const overdueCount = lending.filter((e) => e.status === "overdue").length;
  const declutter = useMemo(() => declutterSummary(inv.active), [inv.active]);
  const collections = useMemo(() => collectionNames(inv.active), [inv.active]);
  const collectionCount = useMemo(() => collectionGroups(inv.active).length, [inv.active]);
  const upkeepDates = useMemo(() => upkeepCount(inv.active, today), [inv.active, today]);
  const missingRooms = useMemo(
    () => missingStarterRooms(loc.locations.map((l) => l.name)),
    [loc.locations]
  );
  const starterRooms = useStarterRooms(email, loc.locations.length > 0);
  const seedStarterRooms = () => {
    for (const name of missingRooms) loc.addLocation(name);
    starterRooms.dismiss();
  };

  const visible = useMemo(() => {
    const base = showArchived ? inv.items : inv.active;
    return base
      .filter((i) => matches(i, query.trim()))
      .filter((i) => {
        if (!locationFilter) return true;
        // A dangling locationId (location deleted before this fix, or by an
        // older client) counts as unassigned so the item never vanishes.
        if (locationFilter === "__none__")
          return !i.locationId || !loc.nameById[i.locationId];
        return i.locationId === locationFilter;
      })
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }, [inv.items, inv.active, showArchived, query, locationFilter, loc.nameById]);

  const openAdd = () => {
    setEditing(blankItem(settings.defaultCurrency));
    setFormOpen(true);
  };
  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setFormOpen(true);
  };
  // Surface My Stuff moments in the unified Focus activity timeline —
  // fire-and-forget nicety, never in the save path (open decision #3).
  const logEvent = (type: ActivityType, summary: string) => {
    if (connected && email) {
      logActivity(email, type, summary, today || todayKey()).catch(() => {});
    }
  };
  const saveItem = (item: InventoryItem) => {
    const prev = inv.items.find((i) => i.id === item.id);
    inv.upsertItem(item);
    if (!prev) {
      logEvent("item_added", `Added to My Stuff: ${item.name}`);
    } else {
      if (!prev.lentTo?.trim() && item.lentTo?.trim())
        logEvent("item_lent", `Lent out: ${item.name} → ${item.lentTo.trim()}`);
      if (prev.lentTo?.trim() && !item.lentTo?.trim())
        logEvent("item_returned", `Returned: ${item.name}`);
    }
  };
  const returnItem = (id: string) => {
    const it = inv.items.find((i) => i.id === id);
    inv.markReturned(id);
    if (it) {
      logEvent(
        "item_returned",
        `Returned: ${it.name}${it.lentTo?.trim() ? ` (from ${it.lentTo.trim()})` : ""}`
      );
    }
  };
  const releaseAndLog = (id: string) => {
    const it = inv.items.find((i) => i.id === id);
    inv.releaseItem(id, today || todayKey());
    if (it) logEvent("item_released", `Let go of: ${it.name}`);
  };

  // Wishlist → My Stuff: bought it, so make it a real item and clear the wish.
  const gotItFromWishlist = (w: WishlistItem) => {
    saveItem(wishlistToInventoryItem(w, settings.defaultCurrency));
    wishlist.remove(w.id);
  };

  // Read-only detail view; its Edit button hands off to the form.
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
  const openDetail = (item: InventoryItem) => setDetailItem(item);
  const editFromDetail = (item: InventoryItem) => {
    setDetailItem(null);
    openEdit(item);
  };

  // Calm daily "rediscover a forgotten item" nudge.
  const rediscover = useRediscover(email, inv.active, today);

  // Keep LocationManager's promise: items in a deleted location become
  // Unassigned for real (their docs update too, when connected) instead of
  // dangling with an id no view can surface.
  const removeLocationAndUnassign = (id: string) => {
    inv.items
      .filter((i) => i.locationId === id)
      .forEach((i) => inv.upsertItem({ ...i, locationId: null }));
    loc.removeLocation(id);
  };

  // Print a QR label per location — scanning one opens /inventory?location=<id>
  // (handled below), i.e. this device filtered to that spot. QR + print libs
  // load on demand.
  const printLocationLabels = async () => {
    const { qrSvg } = await import("@/features/inventory/lib/qr");
    const { labelUrl, locationLabelsHtml } = await import(
      "@/features/inventory/lib/locationLabels"
    );
    const { printHtml } = await import("@/utils/download");
    const paths = locationPathsById(loc.locations);
    const origin = window.location.origin;
    const labels = await Promise.all(
      flattenTree(loc.tree).map(async (l) => ({
        id: l.id,
        name: l.name,
        path: paths[l.id] ?? [l.name],
        count: countByLocation[l.id] ?? 0,
        qrSvg: await qrSvg(labelUrl(origin, l.id)),
      }))
    );
    if (labels.length > 0) printHtml(locationLabelsHtml(labels));
  };

  // Deep link: a scanned label lands on /inventory?location=<id>; once that
  // location is known, filter to it — exactly once, so it never overrides a
  // filter the user later changes.
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    const id = new URLSearchParams(window.location.search).get("location");
    if (id && loc.nameById[id]) {
      setLocationFilter(id);
      deepLinkApplied.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.nameById]);

  // Attachments live in their own subcollection; the form drives them via
  // these. fetchDocs is memoized because the detail modal's load effect
  // depends on it — a fresh identity every render would reset its carousel
  // and refetch docs whenever any background snapshot re-renders us.
  const fetchDocs = useCallback(
    (itemId: string): Promise<ItemDoc[]> =>
      connected && email ? fetchItemDocs(email, itemId) : Promise.resolve([]),
    [connected, email]
  );
  const addDoc = (d: ItemDoc): Promise<void> =>
    connected && email ? saveItemDoc(email, d) : Promise.resolve();
  const removeDoc = (id: string): Promise<void> =>
    connected && email ? deleteItemDoc(email, id) : Promise.resolve();
  const removeItemAndDocs = (item: InventoryItem) => {
    // Sweep the item's R2 objects (photo + attachments) before their pointer
    // records disappear — best-effort orphan control, then delete the records.
    const photoPaths = (item.photos ?? []).map((p) => p.path);
    if (connected && email) {
      fetchItemDocs(email, item.id)
        .then((ds) =>
          deleteInventoryObjects([...photoPaths, ...ds.map((d) => d.path)])
        )
        .catch(() => deleteInventoryObjects(photoPaths))
        .finally(() => deleteItemDocs(email, item.id).catch(() => {}));
    } else {
      deleteInventoryObjects(photoPaths);
    }
    inv.removeItem(item.id);
  };

  const exportCsv = () =>
    downloadText("my-stuff.csv", itemsToCsv(inv.items, loc.nameById), "text/csv");
  const exportJson = () =>
    downloadText(
      "my-stuff-backup.json",
      inventoryToJson(
        { items: inv.items, locations: loc.locations, settings },
        new Date().toISOString()
      ),
      "application/json"
    );

  // Client-side "insurance PDF": render a schedule into a hidden iframe and open
  // the print dialog (Save as PDF). No dependency, nothing leaves the device.
  const printInsuranceReport = () => {
    const report = buildInsuranceReport(inv.active, loc.nameById, today || todayKey());
    const html = insuranceReportHtml(report, {
      owner: session?.user?.name ?? undefined,
      generatedAt: new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      currency: settings.defaultCurrency,
    });
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    const cdoc = win?.document;
    if (!win || !cdoc) {
      iframe.remove();
      return;
    }
    cdoc.open();
    cdoc.write(html);
    cdoc.close();
    win.onafterprint = () => iframe.remove();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 300);
    // Safety net if onafterprint never fires (e.g. dialog dismissed oddly).
    setTimeout(() => iframe.parentNode && iframe.remove(), 60000);
  };

  const importJson = async (file: File) => {
    const backup = inventoryFromJson(await file.text());
    if (!backup) {
      setDataMsg("That file didn't contain any inventory records.");
      return;
    }
    loc.setLocations((prev) => mergeById(prev, backup.locations));
    inv.setItems((prev) => mergeById(prev, backup.items));
    update(backup.settings);
    if (connected && email) {
      // Push only the records that were actually NEW locally — restoring the
      // whole backup would overwrite newer cloud docs, and the snapshot echo
      // would then undo the local no-overwrite merge.
      const itemIds = new Set(inv.items.map((i) => i.id));
      const locIds = new Set(loc.locations.map((l) => l.id));
      await restoreInventoryBackup(email, {
        ...backup,
        items: backup.items.filter((i) => !itemIds.has(i.id)),
        locations: backup.locations.filter((l) => !locIds.has(l.id)),
      });
    }
    setDataMsg(`Imported ${backupCount(backup)} record${backupCount(backup) === 1 ? "" : "s"}.`);
  };

  const total = inv.active.length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 px-3 sm:flex-row sm:items-center sm:justify-between sm:px-0">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold text-slate-50">
            <Package className="h-6 w-6 text-blue-300" /> My Stuff
          </h2>
          <p className="mt-0.5 text-sm text-slate-400">
            A calm catalog of what you own — where it is, what it&apos;s worth, what needs a look.
          </p>
        </div>
        {/* Wrap onto multiple rows rather than a single scrolling strip — at
            large font sizes a fixed row overflowed the mobile viewport. */}
        <div className="flex shrink-0 flex-wrap gap-2">
          {total > 0 && (
            <button
              type="button"
              onClick={() => setWhereOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
            >
              <MapPin className="h-4 w-4" /> Find &amp; ask
            </button>
          )}
          {lending.length > 0 && (
            <button
              type="button"
              onClick={() => setLendOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-violet-400 hover:text-violet-300"
            >
              <HandHelping className="h-4 w-4" /> On loan
              <span
                className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                  overdueCount > 0
                    ? "bg-red-500/25 text-red-200"
                    : "bg-violet-500/20 text-violet-100"
                }`}
              >
                {lending.length}
              </span>
            </button>
          )}
          {declutter.count > 0 && (
            <button
              type="button"
              onClick={() => setDeclutterOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300"
            >
              <Sparkles className="h-4 w-4" /> Declutter
              <span className="rounded-full bg-emerald-500/20 px-1.5 text-[11px] tabular-nums text-emerald-100">
                {declutter.count}
              </span>
            </button>
          )}
          {collectionCount > 0 && (
            <button
              type="button"
              onClick={() => setCollectionsOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-teal-400 hover:text-teal-300"
            >
              <Layers className="h-4 w-4" /> Kits
              <span className="rounded-full bg-teal-500/20 px-1.5 text-[11px] tabular-nums text-teal-100">
                {collectionCount}
              </span>
            </button>
          )}
          {upkeepDates > 0 && (
            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-sky-300"
            >
              📅 Upkeep
              <span className="rounded-full bg-sky-500/20 px-1.5 text-[11px] tabular-nums text-sky-100">
                {upkeepDates}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setWishlistOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-pink-400 hover:text-pink-300"
          >
            ♡ Wishlist
            {wishlist.items.length > 0 && (
              <span className="rounded-full bg-pink-500/20 px-1.5 text-[11px] tabular-nums text-pink-100">
                {wishlist.items.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setLocOpen(true)}
            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
          >
            Locations
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" /> Add item
          </button>
        </div>
      </div>

      {/* Sync banner */}
      {!connected ? (
        <div className="mx-3 flex flex-col gap-2 rounded-xl border border-slate-800/70 bg-slate-900/80 px-4 py-3 sm:mx-0 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-400">
            Your inventory stays on this device.{" "}
            <span className="text-slate-300">Sync to save it to your account.</span>
            {error && <span className="block text-xs text-red-400">{error}</span>}
          </p>
          <button
            type="button"
            onClick={connect}
            disabled={connecting || !email}
            className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {connecting ? "Connecting…" : "Sign in to sync"}
          </button>
        </div>
      ) : (
        <div className="mx-3 flex flex-col gap-2 rounded-xl border border-slate-800/70 bg-slate-900/80 px-4 py-3 sm:mx-0 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-400">
            <span className="text-emerald-400">●</span> Synced to your account — changes save automatically.
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => inv.pullFromCloud()}
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
            >
              Sync from cloud
            </button>
            <button
              type="button"
              onClick={() => inv.pushToCloud()}
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
            >
              Sync to cloud
            </button>
          </div>
        </div>
      )}

      {starterRooms.show && (
        <StarterRoomsCard
          rooms={missingRooms}
          onSeed={seedStarterRooms}
          onDismiss={starterRooms.dismiss}
        />
      )}

      {rediscover.item && (
        <RediscoverCard
          item={rediscover.item}
          locationPath={
            rediscover.item.locationId
              ? locationPathsById(loc.locations)[rediscover.item.locationId] ?? []
              : []
          }
          currency={settings.defaultCurrency}
          onOpen={openDetail}
          onDismiss={rediscover.dismiss}
        />
      )}

      {total > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <ValuePanel items={inv.active} locations={loc.locations} currency={settings.defaultCurrency} today={today} />
          <AttentionPanel items={inv.active} today={today} onSelect={openDetail} />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items, tags, serials…"
            aria-label="Search items"
            className="w-full rounded-lg border border-slate-700 bg-slate-950/60 py-2 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute inset-y-0 right-2 flex items-center text-slate-500 transition hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          aria-label="Filter by location"
          className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-blue-400 focus:outline-none"
        >
          <option value="">All locations</option>
          <option value="__none__">Unassigned</option>
          {loc.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/50 p-0.5 text-xs font-medium">
          {(["grid", "list", "shelf"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => update({ defaultView: v })}
              aria-pressed={settings.defaultView === v}
              className={`rounded-md px-3 py-1.5 capitalize transition ${
                settings.defaultView === v ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      {total === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-700/70 bg-slate-950/30 px-4 py-16 text-center">
          <Package className="h-10 w-10 text-slate-600" />
          <p className="text-sm text-slate-400">
            Nothing catalogued yet. Add your first item — a laptop, a bike, a kitchen gadget.
          </p>
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" /> Add item
          </button>
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-950/30 px-4 py-10 text-center text-sm text-slate-400">
          No items match your search.
        </p>
      ) : settings.defaultView === "shelf" ? (
        /* Shelf view — items grouped by where they live, tree order,
           Unassigned last. */
        <div className="flex flex-col gap-6">
          {[
            ...flattenTree(loc.tree).map((l) => ({
              key: l.id,
              label: (locationPathsById(loc.locations)[l.id] ?? [l.name]).join(" → "),
              items: visible.filter((i) => i.locationId === l.id),
            })),
            {
              key: "__none__",
              label: "Unassigned",
              items: visible.filter(
                (i) => !i.locationId || !loc.nameById[i.locationId]
              ),
            },
          ]
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <section key={g.key}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h3 className="min-w-0 truncate text-sm font-semibold text-slate-200">
                    📍 {g.label}
                  </h3>
                  <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                    {g.items.length} item{g.items.length === 1 ? "" : "s"}
                    {totalValue(g.items) > 0 &&
                      ` · ${formatMoney(totalValue(g.items), settings.defaultCurrency)}`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {g.items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      fallbackCurrency={settings.defaultCurrency}
                      today={today}
                      onOpen={openDetail}
                      onEdit={openEdit}
                      onArchive={(it) => inv.setArchived(it.id, !it.archived)}
                      onRemove={removeItemAndDocs}
                    />
                  ))}
                </div>
              </section>
            ))}
        </div>
      ) : (
        <div
          className={
            settings.defaultView === "grid"
              ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              : "grid grid-cols-1 gap-3 sm:grid-cols-2"
          }
        >
          {visible.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              locationName={item.locationId ? loc.nameById[item.locationId] : undefined}
              fallbackCurrency={settings.defaultCurrency}
              today={today}
              onOpen={openDetail}
              onEdit={openEdit}
              onArchive={(it) => inv.setArchived(it.id, !it.archived)}
              onRemove={removeItemAndDocs}
            />
          ))}
        </div>
      )}

      {/* Show-archived toggle */}
      {inv.items.some((i) => i.archived) && (
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="self-start text-xs font-medium text-slate-500 transition hover:text-slate-300"
        >
          {showArchived ? "Hide" : "Show"} archived ({inv.items.filter((i) => i.archived).length})
        </button>
      )}

      {/* Data (export / import) */}
      <details className="rounded-2xl border border-slate-800/70 bg-slate-900/50 px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-300">
          <Tag className="h-4 w-4" /> Your data
          {dataMsg && <span className="text-xs font-normal text-emerald-300">{dataMsg}</span>}
        </summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            Items CSV
          </button>
          <button
            type="button"
            onClick={exportJson}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={printInsuranceReport}
            disabled={inv.active.length === 0}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100 disabled:opacity-50"
          >
            Insurance report (PDF)
          </button>
          <label className="cursor-pointer rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100">
            Import JSON
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) importJson(file);
              }}
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Import merges by id — nothing is overwritten or duplicated.
        </p>
      </details>

      <ItemFormModal
        open={formOpen}
        item={editing}
        tree={loc.tree}
        categorySuggestions={categorySuggestions}
        focusProjects={focusProjects}
        collections={collections}
        defaultCurrency={settings.defaultCurrency}
        today={today}
        bookmarks={bookmarkLibrary}
        existingItems={inv.items}
        canAttach={connected}
        onFetchDocs={fetchDocs}
        onAddDoc={addDoc}
        onRemoveDoc={removeDoc}
        onSave={saveItem}
        onClose={() => setFormOpen(false)}
      />
      <LocationManager
        open={locOpen}
        tree={loc.tree}
        countByLocation={countByLocation}
        onAdd={loc.addLocation}
        onRename={loc.renameLocation}
        onRemove={removeLocationAndUnassign}
        onPrintLabels={printLocationLabels}
        onSeedCommon={missingRooms.length > 0 ? seedStarterRooms : undefined}
        onClose={() => setLocOpen(false)}
      />
      <WhereIsModal
        open={whereOpen}
        items={inv.active}
        locations={loc.locations}
        today={today}
        onPick={openDetail}
        onClose={() => setWhereOpen(false)}
      />
      <WishlistModal
        open={wishlistOpen}
        items={wishlist.items}
        ownedItems={inv.items}
        bookmarks={bookmarkLibrary}
        categorySuggestions={categorySuggestions}
        defaultCurrency={settings.defaultCurrency}
        onUpsert={wishlist.upsert}
        onRemove={wishlist.remove}
        onGotIt={gotItFromWishlist}
        onClose={() => setWishlistOpen(false)}
      />
      <MaintenanceCalendarModal
        open={calendarOpen}
        items={inv.active}
        today={today}
        onSelect={openDetail}
        onClose={() => setCalendarOpen(false)}
      />
      <ItemDetailModal
        open={detailItem !== null}
        item={detailItem}
        locations={loc.locations}
        fallbackCurrency={settings.defaultCurrency}
        today={today}
        canAttach={connected && Boolean(email)}
        onFetchDocs={fetchDocs}
        onEdit={editFromDetail}
        onClose={() => setDetailItem(null)}
      />
      <LendingLedgerModal
        open={lendOpen}
        items={inv.active}
        today={today}
        onReturned={returnItem}
        onEdit={openEdit}
        onClose={() => setLendOpen(false)}
      />
      <DeclutterModal
        open={declutterOpen}
        items={inv.active}
        currency={settings.defaultCurrency}
        onReleased={releaseAndLog}
        onEdit={openEdit}
        onClose={() => setDeclutterOpen(false)}
      />
      <CollectionsModal
        open={collectionsOpen}
        items={inv.active}
        currency={settings.defaultCurrency}
        onEdit={openEdit}
        onClose={() => setCollectionsOpen(false)}
      />
    </div>
  );
}

export default InventoryDashboard;
