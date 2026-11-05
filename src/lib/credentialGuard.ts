// Free-text fields (notes, a paper's reference) refuse what the Terms forbid storing:
// passwords, PINs, payment card data and government ID numbers. Bookmark Deck is not
// a password manager, and the first thing a leaked database should not hold is the
// thing the product told people not to put there.
//
// Pure and deliberately narrow. A false refusal costs a user one edit; a false pass
// costs nothing the Terms did not already disclaim, so every pattern needs a label
// or a structure (separators, an issuer prefix, a checksum) — a bare run of digits
// is a policy number, an order number or an ISBN far more often than a secret.

export type CredentialKind = "password" | "pin" | "card" | "cvv" | "ssn";

// "password: x", "pwd = x", "PIN: 4821", "passcode: x".
const LABELLED_SECRET =
  /\b(?:password|passwd|pwd|passcode|pass\s?phrase|pin(?:\s?(?:code|number|no\.?))?)\s*[:=]\s*(\S+)/gi;

// A value that points at where the secret lives instead of being it.
const POINTER =
  /^(?:(?:see|in|on|stored|saved|ask|n\/a|na|none|tbd|bitwarden|1password|lastpass|dashlane|keychain|keepass|manager|vault|password|my|the|same|reset|forgot|x+)\b|[?*•]+$)/i;

const CVV = /\b(?:cvv2?|cvc2?|csc|security\s+code)\s*[:=#]?\s*(\d{3,4})\b/i;

// US SSN: 3-2-4 with dashes or spaces, or a labelled nine digits.
const SSN_SEPARATED = /\b(\d{3})[- ](\d{2})[- ](\d{4})\b/g;
const SSN_LABELLED =
  /\b(?:ssn|social\s+security(?:\s+(?:number|no\.?))?)\s*[:#=]?\s*(\d{9})\b/i;

// 13–19 digits, in groups joined by one space or dash.
const CARD_RUN = /\b\d(?:[ -]?\d){12,18}\b/g;

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Major issuers by prefix and length: Visa, Mastercard, Amex, Discover, Diners, JCB. */
function issuerPrefix(d: string): boolean {
  const n = d.length;
  if (d[0] === "4") return n === 13 || n === 16 || n === 19;
  if (/^(?:5[1-5]|2(?:2[2-9]\d|[3-6]\d\d|7[01]\d|720))/.test(d)) return n === 16;
  if (/^3[47]/.test(d)) return n === 15;
  if (/^(?:6011|65|64[4-9])/.test(d)) return n >= 16 && n <= 19;
  if (/^3(?:0[0-5]|[68])/.test(d)) return n === 14;
  if (/^35(?:2[89]|[3-8]\d)/.test(d)) return n >= 16 && n <= 19;
  return false;
}

function validSsn(area: string, group: string, serial: string): boolean {
  if (area === "000" || area === "666" || area[0] === "9") return false;
  return group !== "00" && serial !== "0000";
}

/** What the text looks like, or null. First match wins; the order is the order of confidence. */
export function looksLikeCredential(text: string | null | undefined): CredentialKind | null {
  if (!text) return null;

  for (const m of text.matchAll(LABELLED_SECRET)) {
    const label = m[0].toLowerCase();
    const value = m[1];
    if (POINTER.test(value)) continue;
    if (label.startsWith("pin")) {
      if (/^\d{4,8}$/.test(value)) return "pin";
      continue;
    }
    return "password";
  }

  if (CVV.test(text)) return "cvv";

  for (const m of text.matchAll(CARD_RUN)) {
    const digits = m[0].replace(/[ -]/g, "");
    if (issuerPrefix(digits) && luhn(digits)) return "card";
  }

  for (const m of text.matchAll(SSN_SEPARATED)) {
    if (validSsn(m[1], m[2], m[3])) return "ssn";
  }
  const labelled = SSN_LABELLED.exec(text);
  if (labelled && validSsn(labelled[1].slice(0, 3), labelled[1].slice(3, 5), labelled[1].slice(5))) {
    return "ssn";
  }

  return null;
}

const WHAT: Record<CredentialKind, string> = {
  password: "a password",
  pin: "a PIN",
  card: "a card number",
  cvv: "a card security code",
  ssn: "a government ID number",
};

/** The inline refusal. Says what it saw and where the thing belongs. */
export function credentialMessage(kind: CredentialKind): string {
  return `This looks like ${WHAT[kind]}. Bookmark Deck is not a password manager — keep this in one (Bitwarden, 1Password) and note where it lives instead. It won't be saved.`;
}

/**
 * First refusal among fields the user is saving. Fields equal to what was already
 * stored are skipped: a record that predates this check must stay editable, and the
 * point is what the user types now, not what is already there.
 */
export function firstCredential(
  fields: ReadonlyArray<{ value: string | null | undefined; was?: string | null }>,
): CredentialKind | null {
  for (const f of fields) {
    if (f.was !== undefined && (f.was ?? "") === (f.value ?? "")) continue;
    const kind = looksLikeCredential(f.value);
    if (kind) return kind;
  }
  return null;
}
