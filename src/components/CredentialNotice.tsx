import { credentialMessage, type CredentialKind } from "@/lib/credentialGuard";

/** The inline refusal under a free-text field; renders nothing when the text is fine. */
export function CredentialNotice({ kind }: { kind: CredentialKind | null }) {
  if (!kind) return null;
  return (
    <p role="alert" className="mt-1 text-[12px] leading-snug text-red-300">
      {credentialMessage(kind)}
    </p>
  );
}
