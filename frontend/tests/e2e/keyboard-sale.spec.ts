import { expect, test } from "@playwright/test";

import { loginAsOwner } from "./helpers/auth";

test.describe("Keyboard-first sale entry", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  test("F8 opens New Sale", async ({ page }) => {
    await page.keyboard.press("F8");
    await expect(page).toHaveURL(/\/sales\/new$/);
    await expect(page.getByRole("heading", { name: "New sale" })).toBeVisible();
  });

  test("F4 focuses customer search", async ({ page }) => {
    await page.goto("/sales/new");
    await page.keyboard.press("F4");
    await expect(page.getByLabel("Customer search")).toBeFocused();
  });

  test("customer combobox is owned by the keyboard kernel", async ({ page }) => {
    await page.goto("/sales/new");
    await page.keyboard.press("F4");

    const listbox = page.getByRole("listbox", { name: "List of Ledger Accounts" });
    await expect(listbox).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(listbox).toBeHidden();
    await expect(page).toHaveURL(/\/sales\/new$/);
  });

  test("Escape closes a serial dialog without leaving sale entry", async ({ page }) => {
    await page.goto("/sales/new");
    const serialButton = page.getByRole("button", { name: /serial/i }).first();
    if (await serialButton.isVisible()) {
      await serialButton.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(/\/sales\/new$/);
    }
  });

  test("status bar reports the active keyboard mode", async ({ page }) => {
    await page.goto("/sales/new");
    const statusBar = page.locator("footer[aria-live='polite']");
    await expect(statusBar).toBeVisible();
    await expect(statusBar).toContainText(/Keyboard ready|Typing context|Dialog owns keyboard/);
  });

  test("390x844 retains the mobile sale action", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sales/new");
    await expect(page.getByRole("button", { name: /Complete Sale|Saving Sale/i })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);
  });
});
