// Who has the folder, and when it's due back (ANALYSIS-FILING-LOG.md §5).
//
// There is no `checkedOut` flag anywhere in the model, on purpose. A folder has
// a home and a current place, and being out IS `current !== home` — the digital
// form of the charge-out card file rooms have used for a century. One comparison
// covers "Dad borrowed it", "it's on my desk" and "it's at the accountant's",
// and it can't drift out of sync with itself the way a duplicate flag can.
//
// Pure — see custody.test.ts.

import { daysBetween, isDate } from "@/features/filing/lib/obligations";
import { isCheckedOut } from "@/features/filing/lib/breadcrumb";
import type { FilingFolder } from "@/features/filing/lib/types";

export type CustodyItem = {
  folder: FilingFolder;
  heldBy: string | null;
  /** When it went out. */
  since: string | null;
  dueBack: string | null;
  /** Days it has been out, or null if we never recorded when it left. */
  daysOut: number | null;
  /** Days until it's due back; negative when late. Null when no date was set. */
  daysAway: number | null;
  overdue: boolean;
};

/** The fields that change when a folder leaves its home. */
export function checkOutPatch(input: {
  toPlaceId: string | null;
  heldBy?: string | null;
  dueBack?: string | null;
  on: string;
}): Pick<FilingFolder, "currentPlaceId" | "heldBy" | "takenAt" | "dueBack"> {
  return {
    currentPlaceId: input.toPlaceId,
    heldBy: input.heldBy?.trim() || null,
    takenAt: input.on,
    dueBack: isDate(input.dueBack) ? input.dueBack : null,
  };
}

/**
 * Coming home clears the whole custody record rather than keeping a stale
 * "borrowed by Dad" next to a folder sitting in its drawer. The event itself is
 * kept on the activity timeline, which is where history belongs.
 */
export function returnPatch(): Pick<
  FilingFolder,
  "currentPlaceId" | "heldBy" | "takenAt" | "dueBack"
> {
  return { currentPlaceId: null, heldBy: null, takenAt: null, dueBack: null };
}

export function isOverdueBack(
  folder: Pick<FilingFolder, "homePlaceId" | "currentPlaceId" | "dueBack">,
  today: string
): boolean {
  if (!isCheckedOut(folder) || !isDate(folder.dueBack)) return false;
  return daysBetween(today, folder.dueBack) < 0;
}

/** Everything currently away from home — latest departure first, late ones on top. */
export function custodyItems(folders: FilingFolder[], today: string): CustodyItem[] {
  return folders
    .filter((f) => !f.archived && isCheckedOut(f))
    .map((folder) => {
      const dueBack = isDate(folder.dueBack) ? folder.dueBack : null;
      const since = isDate(folder.takenAt) ? folder.takenAt : null;
      return {
        folder,
        heldBy: folder.heldBy?.trim() || null,
        since,
        dueBack,
        daysOut: since ? daysBetween(since, today) : null,
        daysAway: dueBack ? daysBetween(today, dueBack) : null,
        overdue: dueBack ? daysBetween(today, dueBack) < 0 : false,
      };
    })
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      // Then by how soon it's wanted back; undated ones sink below dated ones.
      if (a.dueBack && b.dueBack) return a.dueBack.localeCompare(b.dueBack);
      if (a.dueBack) return -1;
      if (b.dueBack) return 1;
      return a.folder.name.localeCompare(b.folder.name);
    });
}

export function overdueBackCount(folders: FilingFolder[], today: string): number {
  return folders.filter((f) => !f.archived && isOverdueBack(f, today)).length;
}
