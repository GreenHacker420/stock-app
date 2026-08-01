import { test, expect } from "@playwright/test";

test.describe("Foundation Stabilization E2E Tests", () => {
  test("1. Unauthenticated dashboard access redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login");
    expect(page.url()).toContain("/login");
  });

  test("2. Authenticated login reaches dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[placeholder*="mobile or email"]', "9876543210");
    await page.fill('input[type="password"]', "owner123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");
    expect(page.url()).toContain("/dashboard");
  });

  test("3. Alt+G opens command palette once", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[placeholder*="mobile or email"]', "9876543210");
    await page.fill('input[type="password"]', "owner123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");

    await page.keyboard.press("Alt+g");
    const palette = page.locator('[role="dialog"] input[placeholder*="Search pages"]');
    await expect(palette).toBeVisible();
  });

  test("4. Escape closes command palette without navigating back", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[placeholder*="mobile or email"]', "9876543210");
    await page.fill('input[type="password"]', "owner123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");

    await page.keyboard.press("Alt+g");
    const palette = page.locator('[role="dialog"] input[placeholder*="Search pages"]');
    await expect(palette).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
    expect(page.url()).toContain("/dashboard");
  });

  test("5. F3 opens shop selector dialog", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[placeholder*="mobile or email"]', "9876543210");
    await page.fill('input[type="password"]', "owner123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");

    await page.keyboard.press("F3");
    const dialogTitle = page.locator('text=Switch Active Shop (F3)');
    await expect(dialogTitle).toBeVisible();
  });

  test("6. Disabled write workflow shows unavailable state", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[placeholder*="mobile or email"]', "9876543210");
    await page.fill('input[type="password"]', "owner123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");

    await page.goto("/sales/new");
    const title = page.locator("text=New Sale Entry");
    await expect(title).toBeVisible();

    const unavailableMsg = page.locator("text=New Sale is temporarily unavailable");
    await expect(unavailableMsg).toBeVisible();
  });

  test("7. Mobile viewport has no uncontrolled horizontal page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
  });

  test("8. Sidebar becomes a mobile drawer or is hidden on narrow screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await page.fill('input[placeholder*="mobile or email"]', "9876543210");
    await page.fill('input[type="password"]', "owner123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");

    const desktopSidebar = page.locator("aside.w-56");
    await expect(desktopSidebar).toBeHidden();
  });

  test("9. Action rail is hidden on narrow mobile screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await page.fill('input[placeholder*="mobile or email"]', "9876543210");
    await page.fill('input[type="password"]', "owner123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");

    const actionRail = page.locator("aside.w-52");
    await expect(actionRail).toBeHidden();
  });

  test("10. No fake WhatsApp records are displayed", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[placeholder*="mobile or email"]', "9876543210");
    await page.fill('input[type="password"]', "owner123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");

    await page.goto("/whatsapp");
    const fakeCustomer = page.locator("text=Ramesh Sharma");
    await expect(fakeCustomer).toBeHidden();
  });
});
