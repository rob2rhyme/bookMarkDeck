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

const ALICE = "alice-uid";
const BOB = "bob-uid";
const alice = env.authenticatedContext(ALICE).firestore();
const bob = env.authenticatedContext(BOB).firestore();
const anon = env.unauthenticatedContext().firestore();

// A SAMPLE of the collections pillars write under users/{uid} — not an
// inventory. firestore.rules is one recursive match on users/{uid}/{document=**},
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
