import { describe, expect, it } from "vitest";

import {
  APP_NAME,
  buildItemShareText,
  smsShareUrl,
  whatsappShareUrl,
} from "./share";
import type { InventoryItem } from "./types";

const base: InventoryItem = {
  id: "1",
  name: "Sony WH-1000XM5",
  locationId: null,
  tags: [],
  quantity: 1,
  links: [],
  photos: [],
  createdAt: null,
  updatedAt: null,
};

describe("buildItemShareText", () => {
  it("includes the item name and an app nudge with the url", () => {
    const text = buildItemShareText(base, "https://deck.example");
    expect(text).toContain("Sony WH-1000XM5");
    expect(text).toContain(APP_NAME);
    expect(text).toContain("https://deck.example");
  });

  it("labels the condition (open-box) and category in parentheses", () => {
    const text = buildItemShareText(
      { ...base, condition: "open-box", category: "Audio" },
      "https://deck.example"
    );
    expect(text).toContain("Sony WH-1000XM5 (Open box · Audio)");
  });

  it("adds the store url on its own line when present", () => {
    const text = buildItemShareText(
      { ...base, storeUrl: "https://store.example/p/1" },
      "https://deck.example"
    );
    expect(text.split("\n")).toContain("https://store.example/p/1");
  });

  it("omits the url from the nudge when no appUrl is given", () => {
    const text = buildItemShareText(base);
    expect(text).toContain(APP_NAME);
    expect(text).not.toContain("http");
  });
});

describe("share deep links", () => {
  it("percent-encodes the message for WhatsApp", () => {
    expect(whatsappShareUrl("a b&c")).toBe("https://wa.me/?text=a%20b%26c");
  });

  it("percent-encodes the message for SMS", () => {
    expect(smsShareUrl("a b&c")).toBe("sms:?&body=a%20b%26c");
  });
});
