"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { HandHelping, MapPin, Package, Plus, Search, Tag, X } from "@/components/icons";
import { downloadText } from "@/utils/download";
import { restoreInventoryBackup } from "@/features/inventory/data/inventoryData";
import { useBookmarkLibrary } from "@/features/inventory/hooks/useBookmarkLibrary";
import { useFocusProjects } from "@/features/inventory/hooks/useFocusProjects";
import { useInventory, blankItem } from "@/features/inventory/hooks/useInventory";
import { useInventoryLocations } from "@/features/inventory/hooks/useInventoryLocations";
import { useInventorySettings } from "@/features/inventory/hooks/useInventorySettings";
import { useInventorySync } from "@/features/inventory/hooks/useInventorySync";
import {
  backupCount,
  inventoryFromJson,
  inventoryToJson,
  itemsToCsv,
} from "@/features/inventory/lib/exportInventory";
import { todayKey } from "@/features/inventory/data/inventoryData";
import type { InventoryItem } from "@/features/inventory/lib/types";
import { AttentionPanel } from "@/features/inventory/components/AttentionPanel";
import { ItemCard } from "@/features/inventory/components/ItemCard";
import { ItemFormModal } from "@/features/inventory/components/ItemFormModal";
import { LocationManager } from "@/features/inventory/components/LocationManager";
import { ValuePanel } from "@/features/inventory/components/ValuePanel";
import { WhereIsModal } from "@/features/inventory/components/WhereIsModal";
import { LendingLedgerModal } from "@/features/inventory/components/LendingLedgerModal";
import { lendingLedger } from "@/features/inventory/lib/lending";

function mergeById<T extends { id: string }>(prev: T[], incoming: T[]): T[] {
  const map = new Map(prev.map((x) => [x.id, x]));
  for (const x of incoming) map.set(x.id, x);
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
    item.notes,
    item.projectName,
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
  const focusProjects = useFocusProjects(email);

  // Compute "today" after mount so warranty math is hydration-safe.
  const [today, setToday] = useState("");
  useEffect(() => setToday(todayKey()), []);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [locOpen, setLocOpen] = useState(false);
  const [whereOpen, setWhereOpen] = useState(false);
  const [lendOpen, setLendOpen] = useState(false);
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

  const visible = useMemo(() => {
    const base = showArchived ? inv.items : inv.active;
    return base
      .filter((i) => matches(i, query.trim()))
      .filter((i) => {
        if (!locationFilter) return true;
        if (locationFilter === "__none__") return !i.locationId;
        return i.locationId === locationFilter;
      })
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }, [inv.items, inv.active, showArchived, query, locationFilter]);

  const openAdd = () => {
    setEditing(blankItem(settings.defaultCurrency));
    setFormOpen(true);
  };
  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setFormOpen(true);
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

  const importJson = async (file: File) => {
    const backup = inventoryFromJson(await file.text());
    if (!backup) {
      setDataMsg("That file didn't contain any inventory records.");
      return;
    }
    loc.setLocations((prev) => mergeById(prev, backup.locations));
    inv.setItems((prev) => mergeById(prev, backup.items));
    update(backup.settings);
    if (connected && email) await restoreInventoryBackup(email, backup);
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
        <div className="flex shrink-0 flex-wrap gap-2">
          {total > 0 && (
            <button
              type="button"
              onClick={() => setWhereOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
            >
              <MapPin className="h-4 w-4" /> Where is it?
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

      {total > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <ValuePanel items={inv.active} locations={loc.locations} currency={settings.defaultCurrency} />
          <AttentionPanel items={inv.active} today={today} onSelect={openEdit} />
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
          {(["grid", "list"] as const).map((v) => (
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
              onEdit={openEdit}
              onArchive={(it) => inv.setArchived(it.id, !it.archived)}
              onRemove={(it) => inv.removeItem(it.id)}
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
        defaultCurrency={settings.defaultCurrency}
        today={today}
        bookmarks={bookmarkLibrary}
        existingItems={inv.items}
        onSave={inv.upsertItem}
        onClose={() => setFormOpen(false)}
      />
      <LocationManager
        open={locOpen}
        tree={loc.tree}
        countByLocation={countByLocation}
        onAdd={loc.addLocation}
        onRename={loc.renameLocation}
        onRemove={loc.removeLocation}
        onClose={() => setLocOpen(false)}
      />
      <WhereIsModal
        open={whereOpen}
        items={inv.active}
        locations={loc.locations}
        onPick={openEdit}
        onClose={() => setWhereOpen(false)}
      />
      <LendingLedgerModal
        open={lendOpen}
        items={inv.active}
        today={today}
        onReturned={inv.markReturned}
        onEdit={openEdit}
        onClose={() => setLendOpen(false)}
      />
    </div>
  );
}

export default InventoryDashboard;
