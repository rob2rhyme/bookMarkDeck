#!/usr/bin/env node
/**
 * Validate a Google service-account key without ever echoing its contents.
 *
 * A malformed credential must not put any of itself in a log: GitHub masks the
 * exact secret value, but a parser's error message quotes a FRAGMENT, which the
 * mask doesn't match. So every failure here is a fixed string, and the only
 * things ever printed are the two non-secret identifiers.
 *
 *   node scripts/check-service-account.mjs ~/Downloads/<project>-<hex>.json
 *
 * With no argument it reads FIREBASE_SERVICE_ACCOUNT (the JSON itself) or
 * GOOGLE_APPLICATION_CREDENTIALS (a path) — how CI calls it.
 */
import fs from "node:fs";

const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const arg = process.argv[2];
const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
const path = arg || process.env.GOOGLE_APPLICATION_CREDENTIALS;

let raw;
if (arg || (!inline?.trim() && path)) {
  try {
    raw = fs.readFileSync(path, "utf8");
  } catch {
    die(`cannot read ${path}`);
  }
} else if (inline?.trim()) {
  raw = inline;
} else {
  die("pass a key file path, or set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS");
}

let sa;
try {
  sa = JSON.parse(raw);
} catch {
  // Deliberately no parser message and no excerpt.
  die(
    "not valid JSON. Paste the WHOLE key file, opening brace to closing brace —\n" +
      "  not the service-account email, name or id, and not a partial copy."
  );
}

if (sa?.type !== "service_account") {
  die(
    `expected a service-account key. This JSON's "type" is ` +
      (sa?.type ? `"${sa.type}"` : "missing") +
      " — download it from IAM & Admin → Service Accounts → the account → Keys → Add key → JSON."
  );
}

for (const field of ["client_email", "private_key", "project_id"]) {
  if (!sa[field]) die(`the key is missing "${field}" — it looks truncated; re-copy the whole file`);
}
if (!String(sa.private_key).includes("BEGIN PRIVATE KEY")) {
  die('"private_key" doesn\'t contain a PEM block — the file was probably reformatted; re-copy it unchanged');
}

console.log(`✓ service-account key for ${sa.client_email}`);
console.log(`  project ${sa.project_id}`);
