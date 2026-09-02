#!/usr/bin/env node
/**
 * Compare the LIVE Firestore ruleset against the repo's firestore.rules.
 *
 * `npm run verify:rules` proves the file is correct; this proves production is
 * running it. Firestore evaluates the deployed ruleset, so those are different
 * questions — this script is the one that answers the second.
 *
 * Auth: a service-account key, via GOOGLE_APPLICATION_CREDENTIALS (a path) or
 * FIREBASE_SERVICE_ACCOUNT (the JSON itself). Needs only `firebase.readonly`.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa.json node scripts/check-deployed-rules.mjs
 *
 * Exits 0 when they match, 1 when they drift or the ruleset can't be read.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

function loadServiceAccount() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const raw = inline?.trim()
    ? inline
    : file
      ? fs.readFileSync(file, "utf8")
      : die("set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT");
  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    die("the service-account credential is not valid JSON");
  }
  if (sa.type !== "service_account" || !sa.private_key || !sa.client_email) {
    die(`expected a service-account key, got type "${sa.type ?? "unknown"}"`);
  }
  return sa;
}

/** JWT-bearer grant — no SDK, same hand-rolled-signing house style as lib/r2.ts. */
async function accessToken(sa) {
  const uri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.readonly",
    aud: uri,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(sa.private_key)
    .toString("base64url");

  const res = await fetch(uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) die(`token exchange failed (${res.status}): ${body.error_description ?? body.error ?? ""}`);
  return body.access_token;
}

async function api(url, token) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body.error?.message ?? res.statusText;
    die(`${res.status} from ${url.replace(/https:\/\/[^/]+/, "")} — ${reason}`);
  }
  return body;
}

/** Trailing whitespace and a final newline are not a ruleset difference. */
const normalize = (s) =>
  s
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");

const projectId =
  process.env.FIREBASE_PROJECT ||
  JSON.parse(fs.readFileSync(path.join(root, ".firebaserc"), "utf8")).projects?.default;
if (!projectId) die("no project id — set FIREBASE_PROJECT or a default in .firebaserc");

const sa = loadServiceAccount();
if (sa.project_id && sa.project_id !== projectId) {
  die(`credential is for "${sa.project_id}" but the target project is "${projectId}"`);
}

const token = await accessToken(sa);
const base = "https://firebaserules.googleapis.com/v1";
const release = await api(`${base}/projects/${projectId}/releases/cloud.firestore`, token);
const ruleset = await api(`${base}/${release.rulesetName}`, token);

// Multi-database projects get one release per database; this project uses the
// single default, so cloud.firestore is the whole story. Assert the shape
// anyway — a deploy that silently no-ops is the failure this script exists for.
const files = ruleset.source?.files ?? [];
if (files.length !== 1) die(`expected 1 rules file in the live ruleset, found ${files.length}`);

const live = normalize(files[0].content ?? "");
const repo = normalize(fs.readFileSync(path.join(root, "firestore.rules"), "utf8"));

if (live === repo) {
  console.log(`✓ ${projectId} is running the repo's firestore.rules`);
  console.log(`  ruleset ${release.rulesetName.split("/").pop()}, released ${release.updateTime}`);
  process.exit(0);
}

console.error(`✗ ${projectId} is NOT running the repo's firestore.rules`);
console.error(`  live ruleset: ${release.rulesetName.split("/").pop()} (released ${release.updateTime})`);
const liveLines = live.split("\n");
const repoLines = repo.split("\n");
for (let i = 0; i < Math.max(liveLines.length, repoLines.length); i++) {
  if (liveLines[i] !== repoLines[i]) {
    console.error(`  first difference at line ${i + 1}:`);
    console.error(`    live: ${liveLines[i] ?? "(end of file)"}`);
    console.error(`    repo: ${repoLines[i] ?? "(end of file)"}`);
    break;
  }
}
process.exit(1);
