"use client";

// The Filing pillar's entry point. Phase 1: places, parties, folders and
// documents, with the search that is the whole point of the feature —
// type "car title", get "Garage › Grey cabinet › Drawer 2 › Vehicles".

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { Plus, Search, MapPin, Tag, FolderTree, Sparkles } from "@/components/icons";
import { Input } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useFilingSync } from "@/features/filing/hooks/useFilingSync";
import { useFilingPlaces } from "@/features/filing/hooks/useFilingPlaces";
import { useFilingParties } from "@/features/filing/hooks/useFilingParties";
import { useFilingFolders } from "@/features/filing/hooks/useFilingFolders";
import { useFilingDocuments } from "@/features/filing/hooks/useFilingDocuments";
import { folderTrail, formatPath, isCheckedOut } from "@/features/filing/lib/breadcrumb";
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
import { WhereIsPaperModal } from "@/features/filing/components/WhereIsPaperModal";
import { LabelPrintModal } from "@/features/filing/components/LabelPrintModal";
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

  const searchData = useMemo(
    () => ({ places: places.places, folders: folders.active, documents: documents.active }),
    [places.places, folders.active, documents.active]
  );

  const hits = useMemo(() => searchFiling(searchData, query), [searchData, query]);

  const visibleFolders = useMemo(
    () =>
      folders.active
        .filter((f) => (partyFilter ? f.partyId === partyFilter : true))
        .filter((f) =>
          placeFilter ? (f.currentPlaceId ?? f.homePlaceId) === placeFilter : true
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [folders.active, partyFilter, placeFilter]
  );

  const inbox = useMemo(() => unfiled(documents.documents), [documents.documents]);

  const countByPlace = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of folders.active) {
      const id = f.currentPlaceId ?? f.homePlaceId;
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [folders.active]);

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

  const submitFolder = useCallback(
    (draft: FolderDraft) => {
      const payload = {
        name: draft.name,
        homePlaceId: draft.homePlaceId,
        partyId: draft.partyId,
        category: draft.category.trim() || undefined,
        aliases: splitAliases(draft.aliases),
      };
      if (editingFolder) folders.updateFolder(editingFolder.id, payload);
      else folders.addFolder(payload);
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
      if (editingDocument) documents.updateDocument(editingDocument.id, payload);
      else documents.addDocument(payload);
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setWhereOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
            >
              <Search className="h-4 w-4" /> Where is it?
            </button>
            <button
              type="button"
              onClick={() => setLabelsOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
            >
              <Sparkles className="h-4 w-4" /> Labels
            </button>
            <button
              type="button"
              onClick={() => setPlacesOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
            >
              <MapPin className="h-4 w-4" /> Places
            </button>
            <button
              type="button"
              onClick={() => setPartiesOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
            >
              <Tag className="h-4 w-4" /> People
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingFolder(null);
                setFolderFormOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
            >
              <Plus className="h-4 w-4" /> Folder
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingDocument(null);
                setAddToFolderId(null);
                setDocumentFormOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" /> File a paper
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
          <p className="text-sm text-slate-400">
            <span className="text-emerald-400">●</span> Synced to your account —
            changes save automatically.
          </p>
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
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <PlaceManager
        open={placesOpen}
        onClose={() => setPlacesOpen(false)}
        tree={places.tree}
        addPlace={places.addPlace}
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
