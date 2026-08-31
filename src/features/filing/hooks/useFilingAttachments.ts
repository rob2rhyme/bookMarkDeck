"use client";

// Scans attached to a paper (Phase 6, the deferred half).
//
// Loaded PER DOCUMENT, on demand — unlike every other collection in this
// pillar, which is subscribed whole. Attachments are the one thing here that
// grows without bound, and the point of the slim projection is that opening the
// filing log doesn't pay for every scan you've ever taken.
//
// Not cached in localStorage either: the pointers are small but the objects
// they point at aren't, and a stale pointer renders as a broken link. The cloud
// copy is the only source.

import { useCallback, useEffect, useState } from "react";

import {
  deleteAttachment,
  fetchAttachments,
  saveAttachment,
} from "@/features/filing/data/filingData";
import {
  attachmentsEnabled,
  deleteFilingObjects,
  sortAttachments,
} from "@/features/filing/lib/attachments";
import type { FilingAttachment } from "@/features/filing/lib/types";

export function useFilingAttachments(
  email: string | null | undefined,
  connected: boolean,
  documentId: string | null
) {
  const [attachments, setAttachments] = useState<FilingAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  // Null until probed, so the UI can withhold the affordance rather than
  // flashing a button that turns out not to work.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const canSync = connected && Boolean(email);

  useEffect(() => {
    let alive = true;
    attachmentsEnabled().then((ok) => {
      if (alive) setEnabled(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!documentId || !canSync || !email) {
      setAttachments([]);
      return;
    }
    // Cancel on cleanup so a slow response for a previously-open paper can't
    // land in a newly-opened one.
    let cancelled = false;
    setLoading(true);
    fetchAttachments(email, documentId)
      .then((list) => {
        if (!cancelled) setAttachments(sortAttachments(list));
      })
      .catch(() => {
        if (!cancelled) setAttachments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, canSync, email]);

  const add = useCallback(
    async (attachment: FilingAttachment) => {
      setAttachments((prev) => sortAttachments([...prev, attachment]));
      if (canSync && email) {
        await saveAttachment(email, attachment).catch((err) => {
          console.error("[filing] attachment save failed:", err);
        });
      }
    },
    [canSync, email]
  );

  /**
   * Remove the pointer, then the object. In that order on purpose: a failed
   * object delete leaves an orphan nobody sees, whereas a failed pointer delete
   * would leave a row pointing at bytes that are already gone.
   */
  const remove = useCallback(
    async (attachment: FilingAttachment) => {
      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
      if (canSync && email) {
        await deleteAttachment(email, attachment.id).catch((err) => {
          console.error("[filing] attachment delete failed:", err);
        });
      }
      deleteFilingObjects([attachment.path]);
    },
    [canSync, email]
  );

  return { attachments, loading, enabled, add, remove };
}
