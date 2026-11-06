#!/usr/bin/env node
/**
 * Verify firestore.rules against the Firestore emulator.
 *
 * Out of `npm test` because it needs Java and a running emulator; it runs in its
 * own workflow (.github/workflows/firestore-rules.yml), which gates the deploy
 * on it. A pass here proves the FILE is correct — scripts/check-deployed-rules.mjs
 * is what proves production is running it.
 *
 *   npm run verify:rules:emulated          # boots the emulator around this script
 *   node scripts/verify-firestore-rules.mjs  # against an emulator you already have
 *
 * FIRESTORE_EMULATOR_HOST selects the emulator; emulators:exec sets it. When
 * starting one by hand on a host without IPv6, bind it to IPv4 (`"host":
 * "127.0.0.1"` under emulators.firestore in firebase.json).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
// Named imports from the same @firebase/firestore instance rules-unit-testing
// hands back — a different copy of the module makes doc() reject its Firestore.
import { doc, setDoc, getDoc, deleteDoc } from "@firebase/firestore";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const [host, port] = HOST.split(":");

const env = await initializeTestEnvironment({
  projectId: "rules-check",
  firestore: {
    host,
    port: Number(port),
    rules: fs.readFileSync(path.join(root, "firestore.rules"), "utf8"),
  },
});

// The rules admit only the owner's verified email (allowedEmails() in
// firestore.rules). Read it from the file under test, so this script proves the
// ruleset as written rather than a copy of it.
const rulesText = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const OWNER = /allowedEmails\(\)\s*\{\s*return\s*\['([^']+)'/.exec(rulesText)?.[1];
if (!OWNER) throw new Error("firestore.rules: couldn't find the owner email in allowedEmails()");

// ALICE and BOB are both signed in as the owner's address on different uids, so
// every cross-uid denial below is the uid check alone, not the email check.
const ALICE = "alice-uid";
const BOB = "bob-uid";
const STRANGER = "stranger-uid";
const owner = { email: OWNER, email_verified: true };
const alice = env.authenticatedContext(ALICE, owner).firestore();
const bob = env.authenticatedContext(BOB, owner).firestore();
const anon = env.unauthenticatedContext().firestore();
// Any other Google account, the owner's address unverified, a token with no
// email at all (anonymous auth, phone auth), and the address in other casing.
const stranger = env.authenticatedContext(STRANGER, { email: "someone@example.com", email_verified: true }).firestore();
const unverified = env.authenticatedContext(STRANGER, { email: OWNER, email_verified: false }).firestore();
const noEmail = env.authenticatedContext(STRANGER).firestore();
const shouting = env.authenticatedContext(STRANGER, { email: OWNER.toUpperCase(), email_verified: true }).firestore();

// A SAMPLE of the collections pillars write under users/{uid} — not an
// inventory. firestore.rules matches any collection under users/{uid} by wildcard,
// so every name is covered whether or not it is listed here; the point is to
// exercise the rule against realistic paths. Names must be real ones, though:
// this list used to include "habitsLog", which the app has never written, while
// the collections habits actually uses went unsampled.
const FILING = ["filingPlaces", "filingParties", "filingFolders", "filingDocuments", "filingSettings"];
const OTHERS = [
  "focusTasks",
  "focusSessions",
  "habits",
  "habitEntries",
  "inventoryItems",
  "bookmarkBackups",
];

let pass = 0;
const failures = [];
const check = async (label, p) => {
  try {
    await p;
    pass++;
  } catch (err) {
    failures.push(`${label} — ${String(err).slice(0, 120)}`);
  }
};

for (const col of FILING) {
  await check(`owner writes ${col}`, assertSucceeds(setDoc(doc(alice, `users/${ALICE}/${col}/x1`), { a: 1 })));
  await check(`owner reads ${col}`, assertSucceeds(getDoc(doc(alice, `users/${ALICE}/${col}/x1`))));
  await check(`other uid cannot read ${col}`, assertFails(getDoc(doc(bob, `users/${ALICE}/${col}/x1`))));
  await check(`other uid cannot write ${col}`, assertFails(setDoc(doc(bob, `users/${ALICE}/${col}/x2`), { a: 1 })));
  await check(`bob owns his own ${col}`, assertSucceeds(setDoc(doc(bob, `users/${BOB}/${col}/x1`), { a: 1 })));
}

await check("owner writes the user doc", assertSucceeds(setDoc(doc(alice, `users/${ALICE}`), { bookmarks: [] })));
await check(
  "owner writes a deeply nested path",
  assertSucceeds(setDoc(doc(alice, `users/${ALICE}/filingDocuments/d1/filingDocs/a1`), { n: 1 }))
);
await check("other uid cannot delete", assertFails(deleteDoc(doc(bob, `users/${ALICE}/filingDocuments/x1`))));
await check("anonymous cannot read", assertFails(getDoc(doc(anon, `users/${ALICE}/filingDocuments/x1`))));
await check("anonymous cannot write", assertFails(setDoc(doc(anon, `users/${ALICE}/filingDocuments/x3`), { a: 1 })));

for (const col of OTHERS) {
  await check(`owner writes ${col}`, assertSucceeds(setDoc(doc(alice, `users/${ALICE}/${col}/x1`), { a: 1 })));
  await check(`other uid cannot write ${col}`, assertFails(setDoc(doc(bob, `users/${ALICE}/${col}/x9`), { a: 1 })));
}

// Notes (users/{uid}/notes/{noteId}) — covered by the same recursive rule, so
// no rule of its own; asserted in full here because notes hold free text.
const NOTE = { title: "t", body: "b", pinned: false, tags: [] };
await check("owner creates a note", assertSucceeds(setDoc(doc(alice, `users/${ALICE}/notes/n1`), NOTE)));
await check("owner reads a note", assertSucceeds(getDoc(doc(alice, `users/${ALICE}/notes/n1`))));
await check("owner updates a note", assertSucceeds(setDoc(doc(alice, `users/${ALICE}/notes/n1`), { ...NOTE, pinned: true })));
await check("other uid cannot read a note", assertFails(getDoc(doc(bob, `users/${ALICE}/notes/n1`))));
await check("other uid cannot overwrite a note", assertFails(setDoc(doc(bob, `users/${ALICE}/notes/n1`), NOTE)));
await check("other uid cannot create in another's notes", assertFails(setDoc(doc(bob, `users/${ALICE}/notes/n2`), NOTE)));
await check("other uid cannot delete a note", assertFails(deleteDoc(doc(bob, `users/${ALICE}/notes/n1`))));
await check("anonymous cannot read a note", assertFails(getDoc(doc(anon, `users/${ALICE}/notes/n1`))));
await check("anonymous cannot write a note", assertFails(setDoc(doc(anon, `users/${ALICE}/notes/n3`), NOTE)));
await check("root notes collection denied", assertFails(setDoc(doc(alice, `notes/n1`), NOTE)));
await check("owner deletes a note", assertSucceeds(deleteDoc(doc(alice, `users/${ALICE}/notes/n1`))));

// Locked-notes vaults hold only wrapped keys, but they are still the owner's alone.
const VAULT = { v: 1, pass: { salt: "s", iv: "i", ct: "c", iterations: 600000 } };
await check("owner writes a notes vault", assertSucceeds(setDoc(doc(alice, `users/${ALICE}/notesVaults/v1`), VAULT)));
await check("owner reads a notes vault", assertSucceeds(getDoc(doc(alice, `users/${ALICE}/notesVaults/v1`))));
await check("other uid cannot read a notes vault", assertFails(getDoc(doc(bob, `users/${ALICE}/notesVaults/v1`))));
await check("other uid cannot replace a notes vault", assertFails(setDoc(doc(bob, `users/${ALICE}/notesVaults/v1`), VAULT)));
await check("anonymous cannot read a notes vault", assertFails(getDoc(doc(anon, `users/${ALICE}/notesVaults/v1`))));

// Locked text stays sealed: the server refuses plaintext beside a lock, even from
// the owner. Shapes follow notesData toFirestore and filingData documentPayload.
const SEAL = { kid: "v1", iv: "i", ct: "c" };
const LOCKED_NOTE = { ...NOTE, body: "", lock: SEAL };
await check("owner writes a locked note with an empty body", assertSucceeds(setDoc(doc(alice, `users/${ALICE}/notes/l1`), LOCKED_NOTE)));
await check("owner updates a locked note, still sealed", assertSucceeds(setDoc(doc(alice, `users/${ALICE}/notes/l1`), { ...LOCKED_NOTE, pinned: true })));
await check("a locked note with a plaintext body is refused", assertFails(setDoc(doc(alice, `users/${ALICE}/notes/l1`), { ...LOCKED_NOTE, body: "secret" })));
await check("a new locked note with a plaintext body is refused", assertFails(setDoc(doc(alice, `users/${ALICE}/notes/l2`), { ...LOCKED_NOTE, body: "secret" })));
await check("an unlocked note (lock: null) keeps its body", assertSucceeds(setDoc(doc(alice, `users/${ALICE}/notes/l3`), { ...NOTE, lock: null })));
await check("owner deletes a locked note", assertSucceeds(deleteDoc(doc(alice, `users/${ALICE}/notes/l1`))));

const PAPER = { title: "Policy", confidential: false, lock: null, reference: "POL-1", note: "n", tags: [] };
const LOCKED_PAPER = { title: "Policy", confidential: true, lock: SEAL, tags: [] };
await check("an unlocked paper keeps its reference and note", assertSucceeds(setDoc(doc(alice, `users/${ALICE}/filingDocuments/p1`), PAPER)));
await check("a locked paper with no reference or note is accepted", assertSucceeds(setDoc(doc(alice, `users/${ALICE}/filingDocuments/p2`), LOCKED_PAPER)));
await check("a locked paper with empty reference and note is accepted", assertSucceeds(setDoc(doc(alice, `users/${ALICE}/filingDocuments/p2`), { ...LOCKED_PAPER, reference: "", note: "" })));
await check("a locked paper with a plaintext reference is refused", assertFails(setDoc(doc(alice, `users/${ALICE}/filingDocuments/p2`), { ...LOCKED_PAPER, reference: "POL-1" })));
await check("a locked paper with a plaintext note is refused", assertFails(setDoc(doc(alice, `users/${ALICE}/filingDocuments/p2`), { ...LOCKED_PAPER, note: "n" })));
await check("locking an existing paper without dropping its text is refused", assertFails(setDoc(doc(alice, `users/${ALICE}/filingDocuments/p1`), { ...PAPER, lock: SEAL })));
await check("the check is scoped to notes and papers", assertSucceeds(setDoc(doc(alice, `users/${ALICE}/inventoryItems/i1`), { lock: SEAL, body: "x", note: "x" })));
await check("documents nested under a note stay reachable", assertSucceeds(setDoc(doc(alice, `users/${ALICE}/notes/n9/sub/s1`), { body: "x", lock: SEAL })));

// Only the owner's account gets in at all — even to a users/{uid} of its own.
// Before the lock, any Google account could keep data here at the owner's cost.
await check("another account cannot write its own tree", assertFails(setDoc(doc(stranger, `users/${STRANGER}/notes/n1`), NOTE)));
await check("another account cannot read its own tree", assertFails(getDoc(doc(stranger, `users/${STRANGER}/notes/n1`))));
await check("another account cannot read the owner's", assertFails(getDoc(doc(stranger, `users/${ALICE}/notes/n1`))));
await check("the owner's address, unverified, is refused", assertFails(setDoc(doc(unverified, `users/${STRANGER}/x/1`), { a: 1 })));
await check("a token with no email is refused", assertFails(setDoc(doc(noEmail, `users/${STRANGER}/x/1`), { a: 1 })));
await check("the owner's address matches in any case", assertSucceeds(setDoc(doc(shouting, `users/${STRANGER}/x/1`), { a: 1 })));

// A bookmark library too big for one document is stored as chunks (bookmarkLibrary/{i}),
// and a backup of one as a subcollection of its backup document — a level deeper than
// anything else. They must be the owner's, like the rest.
await check(
  "owner writes a bookmark library chunk",
  assertSucceeds(setDoc(doc(alice, `users/${ALICE}/bookmarkLibrary/000`), { i: 0, folders: [], bookmarks: [] }))
);
await check(
  "owner writes a chunk of a chunked backup (a level deeper)",
  assertSucceeds(setDoc(doc(alice, `users/${ALICE}/bookmarkBackups/b1/chunks/000`), { i: 0, folders: [], bookmarks: [] }))
);
await check("other uid cannot read a library chunk", assertFails(getDoc(doc(bob, `users/${ALICE}/bookmarkLibrary/000`))));
await check(
  "other uid cannot read a backup chunk",
  assertFails(getDoc(doc(bob, `users/${ALICE}/bookmarkBackups/b1/chunks/000`)))
);

// The recursive rule must not leak outside users/{uid}.
await check("root collection denied", assertFails(setDoc(doc(alice, `filingDocuments/x1`), { a: 1 })));
await check("other top-level denied", assertFails(setDoc(doc(alice, `admin/config`), { a: 1 })));

await env.cleanup();

if (failures.length) {
  console.error(`✗ ${failures.length} rule assertion(s) failed:`);
  for (const f of failures) console.error("   " + f);
  process.exit(1);
}
console.log(`✓ firestore.rules: all ${pass} assertions passed`);
