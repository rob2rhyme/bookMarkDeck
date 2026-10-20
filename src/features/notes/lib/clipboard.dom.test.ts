import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = { isNative: false, write: vi.fn(), read: vi.fn() };

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => native.isNative },
}));
vi.mock("@capacitor/clipboard", () => ({
  Clipboard: { write: (...a: unknown[]) => native.write(...a), read: () => native.read() },
}));

import { copyText, readText } from "./clipboard";

const web = { writeText: vi.fn(), readText: vi.fn() };

beforeEach(() => {
  native.isNative = false;
  native.write.mockReset().mockResolvedValue(undefined);
  native.read.mockReset().mockResolvedValue({ type: "text/plain", value: "native text" });
  web.writeText.mockReset().mockResolvedValue(undefined);
  web.readText.mockReset().mockResolvedValue("web text");
  Object.defineProperty(navigator, "clipboard", { value: web, configurable: true });
});

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

describe("copyText", () => {
  it("uses navigator.clipboard on the web", async () => {
    expect(await copyText("hi")).toBe(true);
    expect(web.writeText).toHaveBeenCalledWith("hi");
    expect(native.write).not.toHaveBeenCalled();
  });

  it("uses the Capacitor plugin inside the native shell", async () => {
    native.isNative = true;
    expect(await copyText("hi")).toBe(true);
    expect(native.write).toHaveBeenCalledWith({ string: "hi" });
    expect(web.writeText).not.toHaveBeenCalled();
  });

  it("falls back to the web API when the plugin isn't in the installed app yet", async () => {
    native.isNative = true;
    native.write.mockRejectedValue(new Error("Clipboard plugin is not implemented on ios"));
    expect(await copyText("hi")).toBe(true);
    expect(web.writeText).toHaveBeenCalledWith("hi");
  });

  it("reports failure rather than throwing when every path is refused", async () => {
    web.writeText.mockRejectedValue(new Error("NotAllowedError"));
    document.execCommand = vi.fn(() => false);
    expect(await copyText("hi")).toBe(false);
  });
});

describe("readText", () => {
  it("reads from the web API", async () => {
    expect(await readText()).toBe("web text");
  });

  it("reads from the plugin natively", async () => {
    native.isNative = true;
    expect(await readText()).toBe("native text");
  });

  it("treats a native image as no text", async () => {
    native.isNative = true;
    native.read.mockResolvedValue({ type: "image/png", value: "data:image/png;base64,AAAA" });
    expect(await readText()).toBe("");
  });

  it("falls back natively, and returns null when permission is refused", async () => {
    native.isNative = true;
    native.read.mockRejectedValue(new Error("unimplemented"));
    expect(await readText()).toBe("web text");
    web.readText.mockRejectedValue(new Error("NotAllowedError"));
    expect(await readText()).toBeNull();
  });
});
