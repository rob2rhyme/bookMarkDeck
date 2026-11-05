import { E2E_USER, expect, test } from "./fixtures/session";

// Locked papers, end to end in a real browser (real WebCrypto, real PBKDF2): the
// vault is set up from the paper form, the reference and note are sealed, and the
// plaintext is in neither the device cache nor the CSV. Reopening needs the passphrase.
const SECRET_REF = "POL-4829104772";
const SECRET_NOTE = "ask for Dana in claims";
const PASS = "correct horse battery";

const DOCS_KEY = `bookmarkdeck:filing:documents:v1:${E2E_USER.email}`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ email }) => {
      localStorage.setItem("bd:ui-flags:v1", JSON.stringify({ welcomeSeen: true }));
      const key = `bookmarkdeck:filing:folders:v1:${email}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(
        key,
        JSON.stringify([
          {
            id: "f-insurance",
            name: "Insurance",
            homePlaceId: null,
            currentPlaceId: null,
            parentId: null,
            aliases: [],
            tags: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: null,
          },
        ])
      );
    },
    { email: E2E_USER.email }
  );
});

test("a locked paper's reference and note never reach the device cache, and open again with the passphrase", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/filing");

  // File a paper and lock its reference and note. First lock → set up the vault.
  await page.getByRole("button", { name: /File a paper/ }).first().click();
  const form = page.getByRole("dialog", { name: "File a paper" });
  await form.getByLabel("Title").fill("Car insurance");
  await form.getByLabel("Folder", { exact: true }).selectOption({ label: "Insurance" });
  await form.getByText("Add details", { exact: false }).click();
  await form.getByRole("textbox", { name: "Reference", exact: true }).fill(SECRET_REF);
  await form.getByRole("textbox", { name: "Note", exact: true }).fill(SECRET_NOTE);
  await form.getByRole("checkbox", { name: /Lock reference and note/ }).click();

  // One dialog, two headings (set a passphrase, then save the recovery code).
  const vault = page.getByRole("dialog", { name: /passphrase|recovery code/i });
  await expect(vault).toBeVisible();
  await expect(vault.getByRole("heading", { name: "Set a passphrase for locked papers" })).toBeVisible();
  await expect(vault).toContainText("Scans are not encrypted");
  await vault.getByLabel("Passphrase", { exact: true }).fill(PASS);
  await vault.getByLabel("Confirm passphrase").fill(PASS);
  await vault.getByRole("button", { name: "Create passphrase" }).click();
  await expect(vault.getByTestId("recovery-code")).toBeVisible({ timeout: 30_000 });
  await vault.getByRole("checkbox", { name: /saved my recovery code/ }).check();
  await vault.getByRole("button", { name: "Done" }).click();

  await expect(form.getByRole("checkbox", { name: /Lock reference and note/ })).toBeChecked();
  await form.getByRole("button", { name: "File it" }).click();
  await expect(form).toBeHidden();

  // The device cache holds the sealed blob, not the text.
  const cached = await page.evaluate((k) => localStorage.getItem(k) ?? "", DOCS_KEY);
  expect(cached).toContain("Car insurance");
  expect(cached).toContain('"lock"');
  expect(cached).not.toContain(SECRET_REF);
  expect(cached).not.toContain(SECRET_NOTE);

  // The list says it is locked.
  await page.getByRole("button", { name: "Papers" }).click();
  const papers = page.getByRole("dialog");
  await expect(papers.getByRole("img", { name: "Reference and note locked" })).toBeVisible();

  // After a reload the keys are gone: the form opens locked.
  await page.reload();
  await page.getByRole("button", { name: "Papers" }).click();
  await page.getByRole("button", { name: "Car insurance", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit paper" });
  await edit.getByText("Add details", { exact: false }).click();
  await expect(edit.getByRole("textbox", { name: "Reference", exact: true })).toBeDisabled();
  await expect(edit.getByRole("textbox", { name: "Reference", exact: true })).toHaveValue("");

  // Unlock with the passphrase: the text comes back, in memory only.
  await edit.getByRole("button", { name: "Unlock to view or edit" }).click();
  const unlock = page.getByRole("dialog", { name: "Unlock to lock this paper" });
  await unlock.getByLabel("Passphrase").fill("not the passphrase");
  await unlock.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(unlock.getByRole("alert")).toBeVisible();
  await unlock.getByLabel("Passphrase").fill(PASS);
  await unlock.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(edit.getByRole("textbox", { name: "Reference", exact: true })).toHaveValue(SECRET_REF, { timeout: 30_000 });
  await expect(edit.getByRole("textbox", { name: "Note", exact: true })).toHaveValue(SECRET_NOTE);

  // Editing the title while unlocked keeps the lock and the text, and still no plaintext on the device.
  await edit.getByLabel("Title").fill("Auto insurance");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  const after = await page.evaluate((k) => localStorage.getItem(k) ?? "", DOCS_KEY);
  expect(after).toContain("Auto insurance");
  expect(after).toContain('"lock"');
  expect(after).not.toContain(SECRET_REF);
  expect(after).not.toContain(SECRET_NOTE);
});
