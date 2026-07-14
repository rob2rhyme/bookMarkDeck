// Cloudflare R2 (S3-compatible) presigned-PUT signer — hand-rolled AWS
// Signature V4 so there's no heavy AWS SDK. SERVER ONLY (uses node:crypto); the
// browser never sees R2 credentials, only the short-lived presigned URL the API
// route hands back. Pure + deterministic (the clock is passed in) so it's
// unit-tested, incl. the signing-key derivation against AWS's published vector.

import { createHash, createHmac } from "node:crypto";

const sha256hex = (data: string): string =>
  createHash("sha256").update(data, "utf8").digest("hex");

const hmac = (key: Buffer | string, data: string): Buffer =>
  createHmac("sha256", key).update(data, "utf8").digest();

/** AWS SigV4 signing key: HMAC chain over date → region → service → request. */
export function signingKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string
): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

/** AWS-style percent-encoding (RFC 3986; keeps `/` when `encodeSlash` is false). */
export function awsUriEncode(str: string, encodeSlash = true): string {
  let out = "";
  for (const byte of Buffer.from(str, "utf8")) {
    const c = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-_.~]/.test(c)) out += c;
    else if (c === "/" && !encodeSlash) out += "/";
    else out += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

/**
 * True when `path` is an object key inside the caller's own inventory prefix
 * (`inventory/{userSeg}/…`) — the delete route's authorization check. Strict:
 * exact prefix, no traversal segments, no URLs, and only the character set the
 * presign route can produce.
 */
export function isOwnedInventoryPath(path: string, userSeg: string): boolean {
  if (!/^[a-f0-9]{16}$/.test(userSeg)) return false;
  if (!path.startsWith(`inventory/${userSeg}/`)) return false;
  if (path.includes("..") || path.includes("//")) return false;
  return /^[a-zA-Z0-9/_.-]+$/.test(path);
}

export type PresignInput = {
  accountId: string; // R2 account id → {id}.r2.cloudflarestorage.com
  bucket: string;
  key: string; // object key (path within the bucket)
  accessKeyId: string;
  secretAccessKey: string;
  now: Date; // passed in for determinism/testability
  expiresSeconds?: number; // default 300
  region?: string; // default "auto" (R2)
  method?: string; // default "PUT"
};

/** Build a presigned URL for a direct browser PUT to R2. Signs only `host`, with
 *  an UNSIGNED-PAYLOAD, so the client PUT needs no special signed headers. */
export function presignR2Put(input: PresignInput): string {
  const region = input.region ?? "auto";
  const service = "s3";
  const method = input.method ?? "PUT";
  const host = `${input.accountId}.r2.cloudflarestorage.com`;

  const amzDate = input.now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = `/${awsUriEncode(input.bucket, false)}/${awsUriEncode(input.key, false)}`;
  const credential = `${input.accessKeyId}/${dateStamp}/${region}/${service}/aws4_request`;

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresSeconds ?? 300),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${awsUriEncode(k)}=${awsUriEncode(query[k])}`)
    .join("&");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    `${dateStamp}/${region}/${service}/aws4_request`,
    sha256hex(canonicalRequest),
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(input.secretAccessKey, dateStamp, region, service)
  )
    .update(stringToSign, "utf8")
    .digest("hex");

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
