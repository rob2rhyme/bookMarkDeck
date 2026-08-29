#!/usr/bin/env node
/**
 * Verify firestore.rules against the Firestore emulator.
 *
 * Not part of `npm test` and not in CI: it needs Java and a running emulator,
 * which the CI image doesn't carry. Run it by hand after touching the rules —
 * and remember that Firestore evaluates the CONSOLE-DEPLOYED ruleset, so a pass
 * here proves the file is correct, not that production matches it.
 *
 *   npx firebase emulators:start --only firestore --project rules-check
 *   node scripts/verify-firestore-rules.mjs
 *
 * The emulator must be bound to IPv4 (`"host": "127.0.0.1"` under
 * emulators.firestore in firebase.json) on hosts without IPv6.
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

/** Every collection a pillar writes under users/{uid}. */
const FILING = ["filingPlaces", "filingParties", "filingFolders", "filingDocuments", "filingSettings"];
const OTHERS = ["focusTasks", "habitsLog", "inventoryItems", "bookmarkBackups"];

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
