"use client";

// The Filing pillar's entry point. Phase 1: places, parties, folders and
// documents, with the search that is the whole point of the feature —
// type "car title", get "Garage › Grey cabinet › Drawer 2 › Vehicles".

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { Plus, Search, MapPin, Tag, FolderTree, Sparkles, Settings, Clock, BarChart } from "@/components/icons";
import { Input } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useFilingSync } from "@/features/filing/hooks/useFilingSync";
import { useFilingPlaces } from "@/features/filing/hooks/useFilingPlaces";
import { useFilingParties } from "@/features/filing/hooks/useFilingParties";
import { useFilingFolders } from "@/features/filing/hooks/useFilingFolders";
import { useFilingDocuments } from "@/features/filing/hooks/useFilingDocuments";
import { useFilingSettings } from "@/features/filing/hooks/useFilingSettings";
import { folderTrail, formatPath, isCheckedOut } from "@/features/filing/lib/breadcrumb";
import { misfiledFolders, placeLabel } from "@/features/filing/lib/drawers";
import { rollUpCounts, subtreeIds } from "@/features/filing/lib/tree";
import {
  categorySuggestions,
  searchFiling,
  unfiled,
} from "@/features/filing/lib/filingSearch";
import { DOC_TYPES } from "@/features/filing/lib/types";
import { PlaceManager } from "@/features/filing/components/PlaceManager";
import { PartyManager } from "@/features/filing/components/PartyManager";
import { FolderFormModal, type FolderDraft } from "@/features/filing/components/FolderFormModal";
import { DocumentFormModal, type DocumentDraft } from "@/features/filing/components/DocumentFormModal";
import { changedFields, draftFor } from "@/features/filing/lib/documentDraft";
import { WhereIsPaperModal } from "@/features/filing/components/WhereIsPaperModal";
import { LabelPrintModal } from "@/features/filing/components/LabelPrintModal";
import { UpcomingPanel } from "@/features/filing/components/UpcomingPanel";
import { ObligationsModal } from "@/features/filing/components/ObligationsModal";
import { FolderPapersModal } from "@/features/filing/components/FolderPapersModal";
import { ShredQueue } from "@/features/filing/components/ShredQueue";
import { CustodyModal } from "@/features/filing/components/CustodyModal";
import { FilingSettingsModal } from "@/features/filing/components/FilingSettingsModal";
import { BookmarkLinkModal } from "@/features/filing/components/BookmarkLinkModal";
import { ExpiryPanel } from "@/features/filing/components/ExpiryPanel";
import { AttachmentsModal } from "@/features/filing/components/AttachmentsModal";
import { useFilingAttachments } from "@/features/filing/hooks/useFilingAttachments";
import { FilingInsights } from "@/features/filing/components/FilingInsights";
import { expiryItems, expiringCount } from "@/features/filing/lib/expiry";
import type { FilingBackup } from "@/features/filing/lib/types";
import { useFilingPush } from "@/features/filing/hooks/useFilingPush";
import { dueItems } from "@/features/filing/lib/obligations";
import { shredItems } from "@/features/filing/lib/retention";
import { custodyItems } from "@/features/filing/lib/custody";
import { todayKey } from "@/lib/dayKey";
import { consumeFilingIntent, FILING_INTENT_NUDGE } from "@/lib/filingIntent";
import type { FilingDocument, FilingFolder } from "@/features/filing/lib/types";

const splitAliases = (raw: string) =>
  raw.split(",").map((a) => a.trim()).filter(Boolean);

const docIcon = (t?: string) => DOC_TYPES.find((d) => d.id === (t ?? ""))?.icon ?? "📄";

export function FilingDashboard() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;

  const { connected, connecting, error, connect } = useFilingSync(email);
  const places = useFilingPlaces(email, connected);
  const parties = useFilingParties(email, connected);
  const folders = useFilingFolders(email, connected);
  const documents = useFilingDocuments(email, connected);
  const { settings, update: updateSettings } = useFilingSettings(email, connected);

  const [query, setQuery] = useState("");
  const [partyFilter, setPartyFilter] = useState<string>("");
  const [placesOpen, setPlacesOpen] = useState(false);
  const [partiesOpen, setPartiesOpen] = useState(false);
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [documentFormOpen, setDocumentFormOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FilingFolder | null>(null);
  const [editingDocument, setEditingDocument] = useState<FilingDocument | null>(null);
  const [addToFolderId, setAddToFolderId] = useState<string | null>(null);
  const [whereOpen, setWhereOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [placeFilter, setPlaceFilter] = useState<string>("");
  const [obligationsFor, setObligationsFor] = useState<string | null>(null);
  const [papersFor, setPapersFor] = useState<string | null>(null);
  const [custodyOpen, setCustodyOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linkingFor, setLinkingFor] = useState<string | null>(null);
  const [scansFor, setScansFor] = useState<string | null>(null);
  // Which secondary surface is open. Only one at a time: the dashboard is
  // already long, and these are things you go looking for, not glance at.
  const [lens, setLens] = useState<"none" | "expiry" | "insights">("none");
  // Hydration-safe "today": never read the clock during render, and re-check on
  // an interval so a tab left open overnight rolls over instead of going stale.
  const [today, setToday] = useState("");
  useEffect(() => {
    const tick = () => setToday(todayKey());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const searchData = useMemo(
    () => ({ places: places.places, folders: folders.active, documents: documents.active }),
    [places.places, folders.active, documents.active]
  );

  const hits = useMemo(() => searchFiling(searchData, query), [searchData, query]);

  // Filtering to a place means everything inside it, not just what sits at that
  // exact node. Scanning a cabinet's printed label used to list nothing at all,
  // because the folders live in its drawers.
  const placeScope = useMemo(
    () => (placeFilter ? subtreeIds(places.places, placeFilter) : null),
    [places.places, placeFilter]
  );

  const visibleFolders = useMemo(
    () =>
      folders.active
        .filter((f) => (partyFilter ? f.partyId === partyFilter : true))
        .filter((f) => {
          if (!placeScope) return true;
          const at = f.currentPlaceId ?? f.homePlaceId;
          return at ? placeScope.has(at) : false;
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [folders.active, partyFilter, placeScope]
  );

  const inbox = useMemo(() => unfiled(documents.documents), [documents.documents]);

  const due = useMemo(
    () => (today ? dueItems(documents.active, today, settings.leadDays) : []),
    [documents.active, today, settings.leadDays]
  );

  /** Papers whose retention has run out. Same lead window as the reminders, so
   *  the two halves of the Attention surface agree on what "soon" means. */
  const shred = useMemo(
    () =>
      today
        ? shredItems(documents.active, folders.active, today, settings.leadDays)
        : [],
    [documents.active, folders.active, today, settings.leadDays]
  );

  // Loaded per document, on open — attachments are the one collection here that
  // grows without bound, so opening the filing log must not pay for them.
  const scans = useFilingAttachments(email, connected, scansFor);

  /** Everything with a validity date — the whole list, not just what's imminent. */
  const expiry = useMemo(
    () => (today ? expiryItems(documents.active, folders.active, today) : []),
    [documents.active, folders.active, today]
  );
  const expiringSoon = useMemo(() => expiringCount(expiry), [expiry]);

  /** Folders away from home — drives the header pill's count. */
  const out = useMemo(
    () => (today ? custodyItems(folders.active, today) : []),
    [folders.active, today]
  );
  const lateBack = useMemo(() => out.filter((i) => i.overdue).length, [out]);

  // The opt-in daily digest. `ready` gates on `today` so the first arm isn't
  // built from an empty dashboard.
  useFilingPush({
    email,
    enabled: settings.pushEnabled,
    hour: settings.pushHour,
    due,
    shred,
    custody: out,
    ready: Boolean(today) && documents.hydrated && folders.hydrated,
  });

  /** Where a paper's folder lives — the line the Upcoming panel shows. */
  const trailFor = useCallback(
    (documentId: string) => {
      const d = documents.active.find((x) => x.id === documentId);
      const f = d?.folderId ? folders.byId[d.folderId] : null;
      return f ? folderTrail(f, places.paths) : [];
    },
    [documents.active, folders.byId, places.paths]
  );

  // Rolled up, so a cabinet reports what its drawers hold. This number is also
  // printed onto the label stuck to the cabinet, where "0 folders" is a lie.
  const countByPlace = useMemo(() => {
    const direct: Record<string, number> = {};
    for (const f of folders.active) {
      const id = f.currentPlaceId ?? f.homePlaceId;
      if (id) direct[id] = (direct[id] ?? 0) + 1;
    }
    return rollUpCounts(places.places, direct);
  }, [folders.active, places.places]);

  const misfiled = useMemo(
    () => misfiledFolders(places.places, folders.active),
    [places.places, folders.active]
  );

  const placeById = useMemo(
    () => new Map(places.places.map((p) => [p.id, p])),
    [places.places]
  );

  const partyNameById = useMemo(
    () => Object.fromEntries(parties.parties.map((p) => [p.id, p.name])),
    [parties.parties]
  );

  const countByParty = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of folders.active) {
      if (f.partyId) counts[f.partyId] = (counts[f.partyId] ?? 0) + 1;
    }
    return counts;
  }, [folders.active]);

  // A scanned label lands on /filing?place=<id> or ?folder=<id>. Apply it once,
  // so it never overrides a filter the user changes afterwards. A folder link
  // filters to that folder's place and searches its name, which is the closest
  // thing to "open this folder" until Phase 4 gives folders their own view.
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    const params = new URLSearchParams(window.location.search);
    const placeId = params.get("place");
    const folderId = params.get("folder");
    if (placeId && places.nameById[placeId]) {
      setPlaceFilter(placeId);
      deepLinkApplied.current = true;
      return;
    }
    if (folderId && folders.byId[folderId]) {
      const f = folders.byId[folderId];
      const home = f.currentPlaceId ?? f.homePlaceId;
      if (home) setPlaceFilter(home);
      setQuery(f.name);
      deepLinkApplied.current = true;
    }
  }, [places.nameById, folders.byId]);

  // ⌘K handoff. The palette can't import feature code, so it writes an intent
  // (@/lib/filingIntent) and routes here. We consume it on mount for the
  // navigating case, and on the nudge event for the already-on-/filing case,
  // where Next re-renders without remounting.
  useEffect(() => {
    const consume = () => {
      const intent = consumeFilingIntent();
      if (intent === "where-is-it") setWhereOpen(true);
      if (intent === "add-paper") {
        setEditingDocument(null);
        setAddToFolderId(null);
        setDocumentFormOpen(true);
      }
    };
    consume();
    window.addEventListener(FILING_INTENT_NUDGE, consume);
    return () => window.removeEventListener(FILING_INTENT_NUDGE, consume);
  }, []);

  /**
   * Restoring a backup. Merges by id through each hook's setter — never deletes,
   * so importing a six-month-old file can't remove six months of filing.
   */
  const importBackup = useCallback(
    (data: FilingBackup) => {
      places.importMany(data.places);
      parties.importMany(data.parties);
      folders.importMany(data.folders);
      documents.importMany(data.documents);
    },
    [places, parties, folders, documents]
  );

  const submitFolder = useCallback(
    (draft: FolderDraft) => {
      const payload = {
        name: draft.name,
        homePlaceId: draft.homePlaceId,
        partyId: draft.partyId,
        category: draft.category.trim() || undefined,
        aliases: splitAliases(draft.aliases),
      };
      const retention = {
        retentionRuleId: draft.retentionRuleId,
        coversThrough: draft.coversThrough || undefined,
        eventDate: draft.eventDate,
      };
      if (editingFolder) folders.updateFolder(editingFolder.id, { ...payload, ...retention });
      else {
        const created = folders.addFolder(payload);
        // addFolder takes the fast path's fields only, so the optional retention
        // block is applied as a follow-up write rather than widening its input.
        if (created && draft.retentionRuleId) folders.updateFolder(created.id, retention);
      }
      setEditingFolder(null);
    },
    [editingFolder, folders]
  );

  const submitDocument = useCallback(
    (draft: DocumentDraft) => {
      const payload = {
        title: draft.title,
        folderId: draft.folderId,
        partyId: draft.partyId,
        docType: draft.docType || undefined,
        docDate: draft.docDate || undefined,
        reference: draft.reference.trim() || undefined,
        aliases: splitAliases(draft.aliases),
        note: draft.note.trim() || undefined,
      };
      if (editingDocument) {
        const changed = changedFields(draftFor(editingDocument), draft);
        if (changed.length > 0) {
          documents.updateDocument(
            editingDocument.id,
            Object.fromEntries(changed.map((k) => [k, payload[k]])) as Partial<typeof payload>
          );
        }
      } else documents.addDocument(payload);
      setEditingDocument(null);
      setAddToFolderId(null);
    },
    [editingDocument, documents]
  );

  const empty =
    folders.active.length === 0 && documents.active.length === 0 && places.places.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 px-3 sm:px-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-50">
              <FolderTree className="h-6 w-6 text-blue-400" /> Filing
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Where every paper lives — and what&rsquo;s due next.
            </p>
          </div>
          {/* One scrollable line rather than a wrapping block: the row stays a
              single band at every width, and the primary action sits first so
              it never scrolls out of reach. */}
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0 bd-no-scrollbar">
            <button
              type="button"
              onClick={() => {
                setEditingDocument(null);
                setAddToFolderId(null);
                setDocumentFormOpen(true);
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" /> File a paper
            </button>
            <button
              type="button"
              onClick={() => setWhereOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
            >
              <Search className="h-4 w-4" /> Where is it?
            </button>
            <button
              type="button"
              onClick={() => setLabelsOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
            >
              <Sparkles className="h-4 w-4" /> Labels
            </button>
            <button
              type="button"
              onClick={() => setPlacesOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
            >
              <MapPin className="h-4 w-4" /> Places
            </button>
            <button
              type="button"
              onClick={() => setPartiesOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
            >
              <Tag className="h-4 w-4" /> People
            </button>
            <button
              type="button"
              onClick={() => setLens(lens === "expiry" ? "none" : "expiry")}
              aria-pressed={lens === "expiry"}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border bg-slate-900 px-3 py-1.5 text-xs font-semibold transition ${
                expiringSoon > 0
                  ? "border-amber-500/60 text-amber-300 hover:border-amber-400"
                  : lens === "expiry"
                    ? "border-blue-400 text-blue-300"
                    : "border-slate-700 text-slate-200 hover:border-slate-500"
              }`}
            >
              <Clock className="h-4 w-4" /> Valid until
              {expiringSoon > 0 && (
                <span className="tabular-nums opacity-80">{expiringSoon}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setLens(lens === "insights" ? "none" : "insights")}
              aria-pressed={lens === "insights"}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition ${
                lens === "insights" ? "border-blue-400 text-blue-300" : "hover:border-slate-500"
              }`}
            >
              <BarChart className="h-4 w-4" /> History
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
            >
              <Settings className="h-4 w-4" /> Reminders
            </button>
            <button
              type="button"
              onClick={() => setCustodyOpen(true)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border bg-slate-900 px-3 py-1.5 text-xs font-semibold transition ${
                lateBack > 0
                  ? "border-red-500/60 text-red-300 hover:border-red-400"
                  : "border-slate-700 text-slate-200 hover:border-slate-500"
              }`}
            >
              <MapPin className="h-4 w-4" /> Who has it
              {out.length > 0 && (
                <span className="tabular-nums opacity-80">{out.length}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingFolder(null);
                setFolderFormOpen(true);
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
            >
              <Plus className="h-4 w-4" /> Folder
            </button>
          </div>
        </div>
      </div>

      {/* Sync banner */}
      {!connected ? (
        <div className="mx-3 flex flex-col gap-2 rounded-xl border border-slate-800/70 bg-slate-900/80 px-4 py-3 sm:mx-0 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-400">
            Your filing log stays on this device.{" "}
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
        <div className="mx-3 rounded-xl border border-slate-800/70 bg-slate-900/80 px-4 py-3 sm:mx-0">
          {documents.awaitingCloud ? (
            // Papers rebuilt from the slim on-device cache are missing their
            // notes and reminders until the snapshot lands, so edits to them
            // wait for it rather than overwrite the full copy.
            <p className="text-sm text-slate-400">
              <span className="text-amber-400">●</span> Loading your papers from your
              account — edits to them wait until they arrive.
            </p>
          ) : (
            <p className="text-sm text-slate-400">
              <span className="text-emerald-400">●</span> Synced to your account —
              changes save automatically.
            </p>
          )}
        </div>
      )}

      {/* Active place filter — usually arrived at by scanning a label */}
      {placeFilter && places.nameById[placeFilter] && (
        <div className="px-3 sm:px-0">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-2">
            <span className="text-[13px] text-blue-200">
              Showing folders in{" "}
              <strong className="font-semibold">
                {formatPath(places.paths[placeFilter] ?? [], places.nameById[placeFilter])}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => setPlaceFilter("")}
              className="ml-auto rounded-full px-3 py-1 text-xs font-semibold text-blue-200 transition hover:bg-blue-500/20"
            >
              Show everywhere
            </button>
          </div>
        </div>
      )}

      {/* Search — the pillar's whole promise */}
      <div className="px-3 sm:px-0">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Where's my car title?"
            aria-label="Search your filing log"
            className="pl-9"
          />
        </div>

        {query.trim().length >= 2 && (
          <div className="mt-3 flex flex-col gap-2">
            {hits.length === 0 ? (
              <EmptyState>
                Nothing matches &ldquo;{query.trim()}&rdquo;. Try a shorter word,
                or add it as an alias on the folder it belongs to.
              </EmptyState>
            ) : (
              hits.map((hit) => (
                <div
                  key={hit.kind === "folder" ? `f-${hit.folder.id}` : `d-${hit.document.id}`}
                  className="rounded-xl border border-slate-800/70 bg-slate-900/50 px-4 py-3"
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                    <span aria-hidden>
                      {hit.kind === "folder" ? "🗂️" : docIcon(hit.document.docType)}
                    </span>
                    {hit.kind === "folder" ? hit.folder.name : hit.document.title}
                    {hit.kind === "folder" && isCheckedOut(hit.folder) && (
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                        out
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-[13px] text-slate-400">
                    {formatPath(hit.trail, "Unfiled — no place yet")}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* First run */}
      {empty && query.trim().length < 2 && (
        <div className="px-3 sm:px-0">
          <EmptyState
            action={
              <button
                type="button"
                onClick={() => setPlacesOpen(true)}
                className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
              >
                Add your first place
              </button>
            }
          >
            Nothing filed yet. Start with where the paper actually is — a room, a
            cabinet, a drawer — then make a folder and drop papers into it.
          </EmptyState>
        </div>
      )}

      {lens === "expiry" && (
        <ExpiryPanel
          items={expiry}
          connected={connected}
          onRenew={(documentId, obligationId) =>
            documents.completeObligation(documentId, obligationId, today)
          }
          onOpen={(documentId) => setObligationsFor(documentId)}
        />
      )}

      {lens === "insights" && (
        <FilingInsights
          documents={documents.documents}
          folders={folders.folders}
          placeCount={places.places.length}
          today={today}
        />
      )}

      {/* What's due — the reason to open this page between filing sessions */}
      {query.trim().length < 2 && (due.length > 0 || documents.active.length > 0) && (
        <UpcomingPanel
          items={due}
          trailFor={trailFor}
          onComplete={(documentId, obligationId) =>
            documents.completeObligation(documentId, obligationId, today)
          }
        />
      )}

      {/* Ready to clear — the other half of the same Attention surface */}
      {query.trim().length < 2 && shred.length > 0 && (
        <ShredQueue
          items={shred}
          onShred={(documentId) => documents.markShredded(documentId)}
          onReviewed={(documentId) => documents.markReviewed(documentId)}
          onHold={(folderId) => folders.setKeepReason(folderId, "On hold")}
        />
      )}

      {/* In the wrong drawer — only ever raised when a neighbour claims it */}
      {query.trim().length < 2 && misfiled.length > 0 && (
        <section className="px-3 sm:px-0">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              In the wrong drawer
            </h3>
            <span className="text-[11px] tabular-nums text-slate-500">
              {misfiled.length}
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {misfiled.map((m) => (
              <li
                key={m.folder.id}
                className="flex items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2"
              >
                <span aria-hidden className="shrink-0">
                  🗂️
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-200">
                    {m.folder.name}
                  </span>
                  {/* The rule, not just the drawer's name — it is the whole
                      reason this row is here, so it has to be readable. */}
                  <span className="block text-[11px] text-slate-500">
                    in{" "}
                    <span className="whitespace-nowrap">
                      {placeLabel(placeById.get(m.placeId), "somewhere")}
                    </span>{" "}
                    — belongs in{" "}
                    <span className="whitespace-nowrap">
                      {placeLabel(placeById.get(m.suggestedPlaceId), "another drawer")}
                    </span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    folders.updateFolder(m.folder.id, {
                      homePlaceId: m.suggestedPlaceId,
                    })
                  }
                  className="shrink-0 rounded-md border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-blue-400 hover:text-blue-200"
                >
                  Move
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-slate-500">
            Raised only when another drawer in the same cabinet claims it. Moving
            it here updates the record — the paper itself is still your job.
          </p>
        </section>
      )}

      {/* Unfiled inbox */}
      {inbox.length > 0 && query.trim().length < 2 && (
        <section className="px-3 sm:px-0">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Unfiled
            </h3>
            <span className="text-[11px] tabular-nums text-slate-500">
              {inbox.length} waiting
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {inbox.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-2 rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-2"
              >
                <span aria-hidden>{docIcon(d.docType)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                  {d.title}
                </span>
                <select
                  value=""
                  onChange={(e) => e.target.value && documents.fileInto(d.id, e.target.value)}
                  aria-label={`File ${d.title}`}
                  className="shrink-0 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-[11px] text-slate-300 outline-none focus:border-blue-400"
                >
                  <option value="">File into…</option>
                  {folders.active.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Folders */}
      {query.trim().length < 2 && folders.active.length > 0 && (
        <section className="px-3 sm:px-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Folders
            </h3>
            {parties.active.length > 0 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by person">
                <button
                  type="button"
                  onClick={() => setPartyFilter("")}
                  aria-pressed={partyFilter === ""}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    partyFilter === ""
                      ? "bg-blue-500/15 text-blue-300"
                      : "text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  Everyone
                </button>
                {parties.active.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPartyFilter(p.id)}
                    aria-pressed={partyFilter === p.id}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      partyFilter === p.id
                        ? "bg-blue-500/15 text-blue-300"
                        : "text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {visibleFolders.length === 0 ? (
            <EmptyState>No folders for that person yet.</EmptyState>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {visibleFolders.map((f) => {
                const trail = folderTrail(f, places.paths);
                const count = documents.countByFolder[f.id] ?? 0;
                return (
                  <li
                    key={f.id}
                    className="rounded-xl border border-slate-800/70 bg-slate-900/50 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-100">
                          🗂️ {f.name}
                          {isCheckedOut(f) && (
                            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                              out
                            </span>
                          )}
                        </p>
                        <p className="mt-1 truncate text-[13px] text-slate-400">
                          {formatPath(trail.slice(0, -1), "No place yet")}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-300">
                        {count}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDocument(null);
                          setAddToFolderId(f.id);
                          setDocumentFormOpen(true);
                        }}
                        className="rounded-full px-3 py-1 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
                      >
                        + Paper
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFolder(f);
                          setFolderFormOpen(true);
                        }}
                        className="rounded-full px-3 py-1 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
                      >
                        Edit
                      </button>
                      {count > 0 && (
                        <button
                          type="button"
                          onClick={() => setPapersFor(f.id)}
                          className="rounded-full px-3 py-1 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
                        >
                          Papers
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <AttachmentsModal
        open={Boolean(scansFor)}
        onClose={() => setScansFor(null)}
        document={documents.active.find((d) => d.id === scansFor) ?? null}
        attachments={scans.attachments}
        loading={scans.loading}
        connected={connected}
        onAdd={(a) => {
          void scans.add(a);
          // Mirror onto the document so the papers list can show the clip
          // without loading every attachment.
          documents.updateDocument(a.documentId, { hasAttachment: true });
        }}
        onRemove={(a) => {
          void scans.remove(a);
          if (scans.attachments.length <= 1) {
            documents.updateDocument(a.documentId, { hasAttachment: false });
          }
        }}
      />

      <BookmarkLinkModal
        open={Boolean(linkingFor)}
        onClose={() => setLinkingFor(null)}
        document={documents.active.find((d) => d.id === linkingFor) ?? null}
        email={email}
        onLink={(documentId, link) => documents.updateDocument(documentId, { bookmarkLink: link })}
        onUnlink={(documentId) => documents.updateDocument(documentId, { bookmarkLink: null })}
      />

      <FilingSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={updateSettings}
        documents={documents.active}
        folders={folders.active}
        places={places.places}
        parties={parties.parties}
        trailFor={trailFor}
        connected={connected}
        onImport={importBackup}
      />

      <CustodyModal
        open={custodyOpen}
        onClose={() => setCustodyOpen(false)}
        folders={folders.active}
        places={places.places}
        placePaths={places.paths}
        today={today}
        onCheckOut={(folderId, input) =>
          folders.checkOut(folderId, input, (id) => (id ? places.nameById[id] : undefined))
        }
        onReturn={(folderId) =>
          folders.returnFolder(folderId, (id) => (id ? places.nameById[id] : undefined))
        }
      />

      <PlaceManager
        open={placesOpen}
        onClose={() => setPlacesOpen(false)}
        tree={places.tree}
        addPlace={places.addPlace}
        addCabinet={places.addCabinet}
        updatePlace={places.updatePlace}
        movePlace={places.movePlace}
        removePlace={places.removePlace}
        countByPlace={countByPlace}
      />
      <PartyManager
        open={partiesOpen}
        onClose={() => setPartiesOpen(false)}
        parties={parties.parties}
        addParty={parties.addParty}
        updateParty={parties.updateParty}
        removeParty={parties.removeParty}
        countByParty={countByParty}
      />
      <FolderFormModal
        open={folderFormOpen}
        onClose={() => {
          setFolderFormOpen(false);
          setEditingFolder(null);
        }}
        onSubmit={submitFolder}
        editing={editingFolder}
        tree={places.tree}
        parties={parties.active}
        categories={categorySuggestions(folders.active)}
      />
      <WhereIsPaperModal
        open={whereOpen}
        onClose={() => setWhereOpen(false)}
        data={searchData}
        partyNameById={partyNameById}
        onOpenFolder={(folderId) => {
          const f = folders.byId[folderId];
          const place = f?.currentPlaceId ?? f?.homePlaceId;
          if (place) setPlaceFilter(place);
        }}
      />
      <LabelPrintModal
        open={labelsOpen}
        onClose={() => setLabelsOpen(false)}
        tree={places.tree}
        folders={folders.active}
        paths={places.paths}
        partyNameById={partyNameById}
        countByPlace={countByPlace}
        countByFolder={documents.countByFolder}
      />
      <FolderPapersModal
        open={Boolean(papersFor)}
        onClose={() => setPapersFor(null)}
        folder={papersFor ? folders.byId[papersFor] ?? null : null}
        documents={documents.active.filter((d) => d.folderId === papersFor)}
        trail={
          papersFor && folders.byId[papersFor]
            ? folderTrail(folders.byId[papersFor], places.paths)
            : []
        }
        today={today}
        onEdit={(d) => {
          setPapersFor(null);
          setEditingDocument(d);
          setDocumentFormOpen(true);
        }}
        onRemind={(documentId) => {
          setPapersFor(null);
          setObligationsFor(documentId);
        }}
        onLink={(documentId) => {
          setPapersFor(null);
          setLinkingFor(documentId);
        }}
        onScans={(documentId) => {
          setPapersFor(null);
          setScansFor(documentId);
        }}
        scansEnabled={scans.enabled === true}
        onRemove={documents.removeDocument}
        onAdd={() => {
          setAddToFolderId(papersFor);
          setPapersFor(null);
          setEditingDocument(null);
          setDocumentFormOpen(true);
        }}
      />
      <ObligationsModal
        open={Boolean(obligationsFor)}
        onClose={() => setObligationsFor(null)}
        document={documents.active.find((d) => d.id === obligationsFor) ?? null}
        today={today}
        onAdd={documents.addObligation}
        onComplete={(documentId, obligationId) =>
          documents.completeObligation(documentId, obligationId, today)
        }
        onRemove={documents.removeObligation}
      />
      <DocumentFormModal
        open={documentFormOpen}
        onClose={() => {
          setDocumentFormOpen(false);
          setEditingDocument(null);
          setAddToFolderId(null);
        }}
        onSubmit={submitDocument}
        editing={editingDocument}
        folders={folders.active}
        parties={parties.active}
        defaultFolderId={addToFolderId}
      />
    </div>
  );
}
