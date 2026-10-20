// Who may sign in. Bookmark Deck has one owner, so this is a short list rather
// than an open door: any Google account used to be able to sign in, and every
// session-gated route (push scheduling, AI capture, uploads) was then open to it.
//
// AUTH_ALLOWED_EMAILS (comma-separated) replaces the default when set; the e2e
// suite uses it for its test account. The default is in code, not only in env,
// so a deployment with the variable unset still locks to the owner instead of
// either locking the owner out or letting everyone in.

const DEFAULT_ALLOWED = ["rob2rhyme@gmail.com"];

export function allowedEmails(): string[] {
  const fromEnv = (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_ALLOWED;
}

export function isAllowedEmail(email: unknown): boolean {
  return typeof email === "string" && allowedEmails().includes(email.trim().toLowerCase());
}
