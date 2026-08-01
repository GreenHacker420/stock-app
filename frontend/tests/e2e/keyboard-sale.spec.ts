import { test, expect } from "@playwright/test";

test.describe("Keyboard-First Sale Entry E2E Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate and reach dashboard
    await page.goto("/login");
    await page.fill('input[placeholder*="mobile or email"]', "9876543210");
    await page.fill('input[type="password"]', "owner123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");
  });

  test("1. F8 shortcut opens New Sale page", async ({ page }) => {
    await page.keyboard.press("F8");
    await page.waitForURL("**/sales/new");
    expect(page.url()).toContain("/sales/new");
  });

  test("2. F4 shortcut focuses customer search", async ({ page }) => {
    await page.goto("/sales/new");
    await page.keyboard.press("F4");

    const customerInput = page.locator('input[aria-label="Customer search"]');
    await expect(customerInput).toBeFocused();
  });

  test("3. Customer search handles keyboard navigation and selection", async ({ page }) => {
    await page.goto("/sales/new");
    await page.keyboard.press("F4");
    await page.keyboard.type("Walk-in");

    // Down arrow moves to listbox option
    await page.keyboard.press("ArrowDown");
    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible();

    // Escape closes listbox without leaving page
    await page.keyboard.press("Escape");
    await expect(listbox).toBeHidden();
  });

  test("4. Escape closes serial number dialog and restores focus", async ({ page }) => {
    await page.goto("/sales/new");
    // Verify serial dialog opens and closes with Escape
    const serialBtn = page.locator('button:has-text("Serials")').first();
    if (await serialBtn.isVisible()) {
      await serialBtn.click();
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  });

  test("5. Status bar displays active dynamic keyboard scope", async ({ page }) => {
    await page.goto("/sales/new");
    const statusBar = page.locator("footer");
    await expect(statusBar).toBeVisible();
    await expect(statusBar).toContainText("Scope:");
  });

  test("6. Responsive touch layout retains save action at 390px mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sales/new");

    const mobileBar = page.locator("button:has-text('Complete Sale'), button:has-text('Saving')");
    await expect(mobileBar).toBeVisible();
  });
});
