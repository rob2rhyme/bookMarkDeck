import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PBKDF2_ITERATIONS, createVault, vaultIterationLimits } from "@/lib/vault/vault";
import { addKeys, lock as lockVault, resetVaultSessionForTests } from "@/lib/vault/vaultSession";
import { sealScan } from "@/features/filing/lib/scanCrypto";
import type { FilingAttachment, FilingDocument } from "@/features/filing/lib/types";
import { AttachmentsModal } from "./AttachmentsModal";

// The scans dialog against an in-memory stand-in for the routes and the bucket: what it
// uploads is what the bucket would hold, so "the plaintext never leaves the device" is
// checked on the bytes that actually go over the wire, not on a mock's arguments.
beforeAll(() => {
  vaultIterationLimits.min = 1_000;
});
afterAll(() => {
  vaultIterationLimits.min = PBKDF2_ITERATIONS;
});

const SECRET = "PASSPORT P1234567 — Jane Doe";
const PAPER: FilingDocument = {
  id: "p1",
  title: "Passport",
  folderId: null,
  aliases: [],
  tags: [],
  obligations: [],
  createdAt: null,
  updatedAt: null,
};

/** The bucket, and the three calls the dialog makes. */
function fakeCloud() {
  const bucket = new Map<string, Uint8Array>();
  const presigns: Array<Record<string, unknown>> = [];
  const puts: Array<{ url: string; type: string | undefined }> = [];
  let n = 0;
  const readBlob = (b: Blob) =>
    new Promise<Uint8Array>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(b);
    });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      const ok = (body: unknown) => new Response(JSON.stringify(body));
      if (url === "/api/filing/attachment/presign") {
        const body = JSON.parse(String(init?.body));
        presigns.push(body);
        const sealed = body.encrypted === true;
        const path = `filing/seg/${body.documentId}/${++n}.${sealed ? "bin" : "pdf"}`;
        return ok({
          enabled: true,
          uploadUrl: `https://r2.test/put/${path}`,
          uploadContentType: sealed ? "application/octet-stream" : body.contentType,
          path,
        });
      }
      if (url === "/api/filing/attachment/read") {
        const { path } = JSON.parse(String(init?.body));
        return ok({ enabled: true, url: `https://r2.test/get/${path}` });
      }
      if (url.startsWith("https://r2.test/put/")) {
        const path = url.slice("https://r2.test/put/".length);
        bucket.set(path, await readBlob(init!.body as Blob));
        puts.push({ url, type: (init?.headers as Record<string, string>)["Content-Type"] });
        return new Response(null, { status: 200 });
      }
      if (url.startsWith("https://r2.test/get/")) {
        const bytes = bucket.get(url.slice("https://r2.test/get/".length));
        return bytes ? new Response(bytes as unknown as BodyInit) : new Response(null, { status: 404 });
      }
      throw new Error(`unexpected fetch ${url}`);
    })
  );
  return { bucket, presigns, puts };
}

const asText = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
const pdf = () => new File([SECRET], "Jane Doe passport.pdf", { type: "application/pdf" });

function setup(props: Partial<React.ComponentProps<typeof AttachmentsModal>> = {}) {
  const onAdd = vi.fn();
  const onReplace = vi.fn();
  const onRemove = vi.fn();
  const ensureVault = vi.fn(async () => true);
  const view = render(
    <AttachmentsModal
      open
      onClose={() => {}}
      document={PAPER}
      attachments={[]}
      loading={false}
      connected
      onAdd={onAdd}
      onReplace={onReplace}
      onRemove={onRemove}
      vaultReady
      ensureVault={ensureVault}
      primaryKid={() => kid}
      {...props}
    />
  );
  return { onAdd, onReplace, onRemove, ensureVault, ...view };
}

let kid: string | null = null;
let key: CryptoKey;
async function openVault() {
  const made = await createVault("pw-pw-pw-pw", { iterations: 1_000 });
  kid = made.record.id;
  key = made.key;
  addKeys([[kid, key]]);
}

const pickFile = (file: File) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
};

beforeEach(() => {
  resetVaultSessionForTests();
  kid = null;
});
afterEach(() => {
  resetVaultSessionForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("adding a scan", () => {
  it("encrypts by default: the bytes that reach the bucket hold nothing readable, and the pointer is sealed", async () => {
    const cloud = fakeCloud();
    await openVault();
    const { onAdd } = setup();
    pickFile(pdf());
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));

    const stored = [...cloud.bucket.values()][0];
    expect(asText(stored)).not.toContain("PASSPORT");
    expect(asText(stored)).not.toContain("Jane");
    expect(cloud.presigns[0]).toMatchObject({ contentType: "application/pdf", encrypted: true, documentId: "p1" });
    expect(cloud.puts[0].type).toBe("application/octet-stream");

    const pointer = onAdd.mock.calls[0][0] as FilingAttachment;
    expect(pointer.name).toBe("Locked scan");
    expect(JSON.stringify(pointer)).not.toContain("Jane");
    expect(pointer).toMatchObject({ contentType: "application/pdf", size: pdf().size, documentId: "p1" });
    expect(pointer.enc?.kid).toBe(kid);
    expect(pointer.path).toMatch(/\.bin$/);
    expect(pointer).not.toHaveProperty("url");
  });

  it("with the vault closed, asks for it first — and uploads nothing if it stays closed", async () => {
    const cloud = fakeCloud();
    const ensureVault = vi.fn(async () => false);
    const { onAdd } = setup({ ensureVault });
    pickFile(pdf());
    expect((await screen.findByRole("alert")).textContent).toMatch(/needs your vault/);
    expect(ensureVault).toHaveBeenCalledTimes(1);
    expect(cloud.presigns).toHaveLength(0);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("while the vault records are still loading, says so and uploads nothing", async () => {
    const cloud = fakeCloud();
    const { onAdd, ensureVault } = setup({ vaultReady: false });
    pickFile(pdf());
    expect((await screen.findByRole("alert")).textContent).toMatch(/still loading/i);
    expect(ensureVault).not.toHaveBeenCalled();
    expect(cloud.presigns).toHaveLength(0);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("unticked: stored as it is, with the real name — and the form says what that means", async () => {
    const cloud = fakeCloud();
    const { onAdd, ensureVault } = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Encrypt scans I add" }));
    expect(document.body.textContent).toMatch(/readable by whoever runs the storage/);
    pickFile(pdf());
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(ensureVault).not.toHaveBeenCalled();
    expect(cloud.presigns[0].encrypted).toBe(false);
    expect(asText([...cloud.bucket.values()][0])).toContain("PASSPORT");
    const pointer = onAdd.mock.calls[0][0] as FilingAttachment;
    expect(pointer).toMatchObject({ name: "Jane Doe passport.pdf", enc: null });
  });

  it("a refused upload surfaces the route's reason and adds no pointer", async () => {
    await openVault();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ enabled: true, error: "unsupported_type" })))
    );
    const { onAdd } = setup();
    pickFile(pdf());
    expect((await screen.findByRole("alert")).textContent).toMatch(/isn.t supported/);
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe("opening a scan", () => {
  async function sealedPointer(type = "image/png", name = "Jane Doe passport.png") {
    await openVault();
    const file = new File([SECRET], name, { type });
    const sealed = await sealScan({ file, key, kid: kid!, attachmentId: "a1" });
    return { file, sealed };
  }

  function stubBlobUrls() {
    const made: Blob[] = [];
    const revoked: string[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      made.push(b as Blob);
      return `blob:test/${made.length}`;
    });
    URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u));
    return { made, revoked };
  }

  const sealedAttachment = (sealed: Awaited<ReturnType<typeof sealedPointer>>["sealed"], over: Partial<FilingAttachment> = {}): FilingAttachment => ({
    id: "a1",
    documentId: "p1",
    name: "Locked scan",
    contentType: "image/png",
    size: 30,
    path: "filing/seg/p1/9.bin",
    enc: sealed.enc,
    addedAt: "2026-11-05T00:00:00.000Z",
    ...over,
  });

  it("downloads the sealed bytes, decrypts them here, and previews an image — then revokes the blob when closed", async () => {
    const cloud = fakeCloud();
    const urls = stubBlobUrls();
    const { sealed } = await sealedPointer();
    cloud.bucket.set("filing/seg/p1/9.bin", new Uint8Array(await sealed.blob.arrayBuffer()));
    setup({ attachments: [sealedAttachment(sealed)] });

    fireEvent.click(screen.getByRole("button", { name: /Open/ }));
    const region = await screen.findByRole("region", { name: /Preview of Jane Doe passport.png/ });
    expect(within(region).getByRole("img").getAttribute("src")).toBe("blob:test/1");
    expect(within(region).getByRole("link", { name: /Download Jane Doe passport.png/ }).getAttribute("download")).toBe("Jane Doe passport.png");
    expect(await urls.made[0].text()).toBe(SECRET);
    expect(urls.made[0].type).toBe("image/png");

    fireEvent.click(within(region).getByRole("button", { name: "Close preview" }));
    await waitFor(() => expect(urls.revoked).toContain("blob:test/1"));
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("a PDF is offered as a download only — the CSP forbids embedding it", async () => {
    const cloud = fakeCloud();
    stubBlobUrls();
    const { sealed } = await sealedPointer("application/pdf", "Jane Doe passport.pdf");
    cloud.bucket.set("filing/seg/p1/9.bin", new Uint8Array(await sealed.blob.arrayBuffer()));
    setup({ attachments: [sealedAttachment(sealed, { contentType: "application/pdf" })] });
    fireEvent.click(screen.getByRole("button", { name: /Open/ }));
    const region = await screen.findByRole("region");
    expect(within(region).queryByRole("img")).toBeNull();
    expect(within(region).getByRole("link", { name: /Download/ })).toBeTruthy();
  });

  it("shows the real file name only while the vault is open, and a stand-in otherwise", async () => {
    const { sealed } = await sealedPointer();
    setup({ attachments: [sealedAttachment(sealed)] });
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Jane Doe passport.png" })).toBeTruthy());
    await act(async () => {
      await lockVault();
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Locked scan" })).toBeTruthy());
    expect(screen.queryByText("Jane Doe passport.png")).toBeNull();
  });

  it("locking the vault closes an open preview", async () => {
    const cloud = fakeCloud();
    const urls = stubBlobUrls();
    const { sealed } = await sealedPointer();
    cloud.bucket.set("filing/seg/p1/9.bin", new Uint8Array(await sealed.blob.arrayBuffer()));
    setup({ attachments: [sealedAttachment(sealed)] });
    fireEvent.click(screen.getByRole("button", { name: /Open/ }));
    await screen.findByRole("region");
    await act(async () => {
      await lockVault();
    });
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    expect(urls.revoked).toContain("blob:test/1");
  });

  it("with the vault closed, asks for it; if it stays closed, says so and fetches nothing", async () => {
    const cloud = fakeCloud();
    const { sealed } = await sealedPointer();
    resetVaultSessionForTests(); // closed again
    const ensureVault = vi.fn(async () => false);
    setup({ attachments: [sealedAttachment(sealed)], ensureVault });
    fireEvent.click(screen.getByRole("button", { name: /Open/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/isn.t open/);
    expect(ensureVault).toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    void cloud;
  });

  it("a scan that will not decrypt (another attachment's bytes) says so, and previews nothing", async () => {
    const cloud = fakeCloud();
    stubBlobUrls();
    const { sealed } = await sealedPointer();
    cloud.bucket.set("filing/seg/p1/9.bin", new Uint8Array(await sealed.blob.arrayBuffer()));
    setup({ attachments: [sealedAttachment(sealed, { id: "not-a1" })] });
    fireEvent.click(screen.getByRole("button", { name: /Open/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn.t be decrypted/);
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("an unencrypted scan opens in a new tab through a fresh signed URL, with the opener cut", async () => {
    fakeCloud();
    const tab = { opener: "set", location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    setup({
      attachments: [
        { id: "a9", documentId: "p1", name: "old.pdf", contentType: "application/pdf", size: 10, path: "filing/seg/p1/old.pdf", enc: null, addedAt: null },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Open old.pdf" }));
    await waitFor(() => expect(tab.location.href).toBe("https://r2.test/get/filing/seg/p1/old.pdf"));
    expect(tab.opener).toBeNull();
    expect(window.open).toHaveBeenCalledWith("", "_blank");
  });
});

describe("encrypting a scan that was uploaded as it was", () => {
  it("fetches it, seals it here, uploads the sealed copy, and swaps the pointer — keeping the id", async () => {
    const cloud = fakeCloud();
    await openVault();
    cloud.bucket.set("filing/seg/p1/old.pdf", new TextEncoder().encode(SECRET));
    const { onReplace } = setup({
      attachments: [
        { id: "a9", documentId: "p1", name: "Jane Doe passport.pdf", contentType: "application/pdf", size: SECRET.length, path: "filing/seg/p1/old.pdf", url: "https://cdn/old.pdf", enc: null, addedAt: null },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Encrypt" }));
    await waitFor(() => expect(onReplace).toHaveBeenCalledTimes(1));

    const [next, oldPath] = onReplace.mock.calls[0] as [FilingAttachment, string];
    expect(oldPath).toBe("filing/seg/p1/old.pdf");
    expect(next).toMatchObject({ id: "a9", name: "Locked scan", contentType: "application/pdf" });
    expect(next.enc?.kid).toBe(kid);
    expect(next.path).toMatch(/\.bin$/);
    expect(next).not.toHaveProperty("url"); // the public address is dropped with the plaintext
    expect(asText(cloud.bucket.get(next.path)!)).not.toContain("PASSPORT");
    expect(cloud.presigns[0]).toMatchObject({ encrypted: true, contentType: "application/pdf" });
  });

  it("leaves the scan as it was when it cannot be fetched", async () => {
    fakeCloud(); // nothing in the bucket: the GET 404s
    await openVault();
    const { onReplace } = setup({
      attachments: [
        { id: "a9", documentId: "p1", name: "x.pdf", contentType: "application/pdf", size: 5, path: "filing/seg/p1/missing.pdf", enc: null, addedAt: null },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Encrypt" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn.t fetch/);
    expect(onReplace).not.toHaveBeenCalled();
  });

  it("is offered only for a scan that is not encrypted", async () => {
    const { sealed } = await (async () => {
      await openVault();
      return { sealed: await sealScan({ file: pdf(), key, kid: kid!, attachmentId: "a1" }) };
    })();
    setup({
      attachments: [
        { id: "a1", documentId: "p1", name: "Locked scan", contentType: "application/pdf", size: 5, path: "p.bin", enc: sealed.enc, addedAt: null },
      ],
    });
    expect(screen.queryByRole("button", { name: "Encrypt" })).toBeNull();
  });
});

describe("without sync", () => {
  it("offers no way to add or open scans", () => {
    setup({ connected: false });
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(document.body.textContent).toMatch(/needs sync turned on/);
  });
});
