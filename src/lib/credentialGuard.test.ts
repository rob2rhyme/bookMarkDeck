import { describe, expect, it } from "vitest";
import { credentialMessage, firstCredential, looksLikeCredential } from "@/lib/credentialGuard";

describe("looksLikeCredential — refuses", () => {
  it.each([
    ["password: hunter2", "password"],
    ["Password = Tr0ub4dor&3", "password"],
    ["wifi pwd: correcthorse", "password"],
    ["passcode: 8842", "password"],
    ["PIN: 4821", "pin"],
    ["pin code = 123456", "pin"],
    ["cvv 123", "cvv"],
    ["CVC: 4421", "cvv"],
    ["security code 987", "cvv"],
    ["Visa 4111 1111 1111 1111", "card"],
    ["4111-1111-1111-1111", "card"],
    ["mc 5555555555554444", "card"],
    ["amex 378282246310005", "card"],
    ["SSN 123-45-6789", "ssn"],
    ["ssn: 123456789", "ssn"],
    ["social security number 123 45 6789", "ssn"],
  ])("%s → %s", (text, kind) => {
    expect(looksLikeCredential(text)).toBe(kind);
  });

  it("finds one inside a longer note", () => {
    expect(looksLikeCredential("Bank portal.\nlogin: sam\npassword: s3cret!\nask for Dana")).toBe("password");
  });
});

describe("looksLikeCredential — leaves alone", () => {
  it.each([
    "Policy no. 4829104772",
    "Account 00123456789",
    "Case 24-CV-018830",
    "ISBN 978-3-16-148410-0",
    "Order 4111 1111 1111 1112", // fails the checksum
    "Signed original, do not fold",
    "Call 415-555-0134 after 5",
    "Tracking 1Z999AA10123456784",
    "Form 1040, due 2024-04-15",
    "pin: see Bitwarden",
    "password: in 1Password",
    "password: stored in keychain",
    "password: ????",
    "PIN is required at the desk",
    "Reset the password on the portal first",
    "ssn on file with HR",
    "666-12-3456", // never issued
    "000-12-3456",
    "900-12-3456",
    "123-00-6789",
    "123-45-0000",
    "",
  ])("%s", (text) => {
    expect(looksLikeCredential(text)).toBeNull();
  });

  it("treats null and undefined as empty", () => {
    expect(looksLikeCredential(null)).toBeNull();
    expect(looksLikeCredential(undefined)).toBeNull();
  });

  it("does not take a short PIN label with letters as a PIN", () => {
    expect(looksLikeCredential("pin: abcd")).toBeNull();
  });
});

describe("firstCredential", () => {
  it("returns the first offending field", () => {
    expect(
      firstCredential([{ value: "fine" }, { value: "password: x1y2z3" }, { value: "pin: 1234" }]),
    ).toBe("password");
  });

  it("skips a field left as it was stored, so an old record stays editable", () => {
    expect(firstCredential([{ value: "password: old", was: "password: old" }])).toBeNull();
    expect(firstCredential([{ value: "password: new", was: "password: old" }])).toBe("password");
  });

  it("checks a field with no stored value", () => {
    expect(firstCredential([{ value: "pin: 4821" }])).toBe("pin");
  });

  it("is null when everything is clean", () => {
    expect(firstCredential([{ value: "a" }, { value: null }, { value: undefined, was: "x" }])).toBeNull();
  });
});

describe("credentialMessage", () => {
  it("names what it saw and says it will not be saved", () => {
    for (const k of ["password", "pin", "card", "cvv", "ssn"] as const) {
      const m = credentialMessage(k);
      expect(m).toContain("not a password manager");
      expect(m).toContain("won't be saved");
    }
    expect(credentialMessage("card")).toContain("card number");
  });
});
