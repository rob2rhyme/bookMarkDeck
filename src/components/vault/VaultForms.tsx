"use client";

import { useId, useState } from "react";

import { Copy } from "@/components/icons";
import { copyText } from "@/lib/clipboard";
import { WrongSecretError } from "@/lib/vault/vault";

// The passphrase forms for locked notes and locked papers — one vault, so one
// passphrase opens both. Presentational: the caller supplies the async action
// (create / unlock / reset), so the same forms work inline on a locked note and
// inside the dialog that locking a note or a paper opens.

export type VaultSubject = "notes" | "papers";

export const MIN_PASSPHRASE = 8;

const FIELD =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:border-blue-400 focus:outline-none";
const PRIMARY =
  "rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50";
const LINK = "text-sm font-semibold text-blue-300 hover:text-blue-200";

const message = (err: unknown) =>
  err instanceof WrongSecretError ? err.message : "Something went wrong. Please try again.";

function NewPassphraseFields({
  pass,
  confirm,
  setPass,
  setConfirm,
}: {
  pass: string;
  confirm: string;
  setPass: (v: string) => void;
  setConfirm: (v: string) => void;
}) {
  const hintId = useId();
  return (
    <>
      <div className="flex flex-col gap-1">
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Passphrase
          <input
            type="password"
            autoComplete="new-password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            aria-describedby={hintId}
            className={FIELD}
            autoFocus
          />
        </label>
        <span id={hintId} className="text-xs text-slate-500">
          At least {MIN_PASSPHRASE} characters. A few unrelated words is easy to remember and hard to guess.
        </span>
      </div>
      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Confirm passphrase
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={FIELD}
        />
      </label>
    </>
  );
}

function passProblem(pass: string, confirm: string): string | null {
  if (pass.length < MIN_PASSPHRASE) return `Use at least ${MIN_PASSPHRASE} characters.`;
  if (pass !== confirm) return "The two passphrases don't match.";
  return null;
}

/** First lock: choose a passphrase, then save the recovery code before continuing. */
export function SetupForm({
  onCreate,
  onDone,
  subject = "notes",
}: {
  /** What is being locked, for the wording only. */
  subject?: VaultSubject;
  /** Creates and stores the vault, unlocks it, and returns the recovery code. */
  onCreate: (passphrase: string) => Promise<string>;
  onDone: () => void;
}) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  if (code) {
    return (
      <div className="flex flex-col gap-4">
        <h2 id="vault-title" className="text-lg font-semibold text-slate-50">
          Save your recovery code
        </h2>
        <p className="text-sm text-slate-400">
          If you forget your passphrase, this code is the <span className="text-slate-200">only</span> other way to open
          your locked {subject}. It won&rsquo;t be shown again.
        </p>
        <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 p-3">
          <code data-testid="recovery-code" className="flex-1 font-mono text-sm tracking-wide text-slate-100">
            {code}
          </code>
          <button
            type="button"
            onClick={async () => setCopied(await copyText(code))}
            className="flex shrink-0 items-center gap-1 rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-blue-400"
          >
            <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Lose both the passphrase and this code, and locked {subject} can&rsquo;t be recovered — by anyone.
        </p>
        <label className="flex items-start gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-1 accent-blue-500" />
          I&rsquo;ve saved my recovery code somewhere safe.
        </label>
        <button type="button" disabled={!saved} onClick={onDone} className={PRIMARY}>
          Done
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const problem = passProblem(pass, confirm);
        if (problem) return setError(problem);
        setBusy(true);
        setError(null);
        try {
          setCode(await onCreate(pass));
        } catch (err) {
          setError(message(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 id="vault-title" className="text-lg font-semibold text-slate-50">
        Set a passphrase for locked {subject}
      </h2>
      <p className="text-sm text-slate-400">
        {subject === "papers"
          ? "A locked paper's reference and note are encrypted on this device before they're saved."
          : "A locked note is encrypted on this device before it\u2019s saved."}{" "}
        Only this passphrase — or the recovery code you&rsquo;ll get next — can open it. Nobody else can, including
        whoever stores your data.{" "}
        {subject === "papers" ? (
          <>
            <span className="text-slate-300">Titles, dates and tags stay visible</span> so you can still find your
            papers. Scans you add are encrypted with it too (unless you untick that). The same passphrase opens
            locked notes.
          </>
        ) : (
          <>
            <span className="text-slate-300">Titles and tags stay visible</span> so you can still find your notes. The
            same passphrase opens locked papers in Filing.
          </>
        )}
      </p>
      <p className="text-xs text-slate-500">
        Locking protects {subject === "papers" ? "a paper" : "a note"} from then on. Text saved before you locked it
        may still be in older backups or exports.
      </p>
      <NewPassphraseFields pass={pass} confirm={confirm} setPass={setPass} setConfirm={setConfirm} />
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={PRIMARY}>
        {busy ? "Securing…" : "Create passphrase"}
      </button>
    </form>
  );
}

/** Unlock with the passphrase, or switch to the recovery-code reset. */
export function UnlockForm({
  onUnlock,
  onRecover,
  intro,
}: {
  onUnlock: (passphrase: string) => Promise<void>;
  onRecover: (code: string, newPassphrase: string) => Promise<void>;
  intro?: React.ReactNode;
}) {
  const [mode, setMode] = useState<"unlock" | "recover">("unlock");
  const [pass, setPass] = useState("");
  const [code, setCode] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  if (mode === "recover") {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const problem = passProblem(newPass, confirm);
          if (problem) return setError(problem);
          void run(() => onRecover(code, newPass));
        }}
      >
        <h2 id="vault-title" className="text-lg font-semibold text-slate-50">
          Reset your passphrase
        </h2>
        <p className="text-sm text-slate-400">Enter the recovery code you saved, then choose a new passphrase.</p>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Recovery code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXX-XXXX-…"
            className={`${FIELD} font-mono`}
            autoFocus
          />
        </label>
        <NewPassphraseFields pass={newPass} confirm={confirm} setPass={setNewPass} setConfirm={setConfirm} />
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy || !code.trim()} className={PRIMARY}>
            {busy ? "Checking…" : "Reset passphrase"}
          </button>
          <button type="button" onClick={() => (setMode("unlock"), setError(null))} className={LINK}>
            Back
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => onUnlock(pass));
      }}
    >
      {intro}
      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Passphrase
        <input
          type="password"
          autoComplete="current-password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          className={FIELD}
          autoFocus
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !pass} className={PRIMARY}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
        <button type="button" onClick={() => (setMode("recover"), setError(null))} className={LINK}>
          Forgot passphrase?
        </button>
      </div>
    </form>
  );
}
