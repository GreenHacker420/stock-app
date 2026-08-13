import { expect, test } from "@playwright/test";

import { loginAsOwner } from "./helpers/auth";

test.describe("ERP shell and global keyboard commands", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  test("Alt+G opens the live command palette", async ({ page }) => {
    await page.keyboard.press("Alt+G");
    await expect(page.getByPlaceholder(/Type a command or search pages/i)).toBeVisible();
    await expect(page.getByText("Actions & Shortcuts", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder(/Type a command or search pages/i)).toBeHidden();
  });

  test("F3 opens the shop switcher", async ({ page }) => {
    await page.keyboard.press("F3");
    await expect(page.getByRole("heading", { name: "Switch Active Shop (F3)" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  const writeShortcuts = [
    { key: "F8", route: "/sales/new", title: "New sale" },
    { key: "Control+F8", route: "/orders/new", title: "New customer order" },
    { key: "Alt+F8", route: "/delivery-memos/new", title: "New delivery memo" },
    { key: "F6", route: "/payments/new", title: "Receive payment" },
    { key: "F9", route: "/inventory/stock-entry", title: "Stock entry" },
    { key: "Alt+F9", route: "/inventory/stock-transfer", title: "Inter-shop stock transfer" },
  ] as const;

  for (const shortcut of writeShortcuts) {
    test(`${shortcut.key} opens ${shortcut.route}`, async ({ page }) => {
      await page.goto("/dashboard");
      await page.keyboard.press(shortcut.key);
      await expect(page).toHaveURL(new RegExp(`${shortcut.route.replaceAll("/", "\\/")}(?:\\?.*)?$`));
      await expect(page.getByRole("heading", { name: shortcut.title })).toBeVisible();
    });
  }

  test("390x844 keeps the workspace inside the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await expect(page.locator("aside").first()).toBeHidden();
    await expect(page.locator("aside").filter({ hasText: "Current commands" })).toBeHidden();

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("WhatsApp page does not invent conversation data", async ({ page }) => {
    await page.goto("/whatsapp");
    await expect(page.getByText("WhatsApp Integration")).toBeVisible();
    await expect(page.getByText(/No fabricated conversations are shown/i)).toBeVisible();
  });
});
