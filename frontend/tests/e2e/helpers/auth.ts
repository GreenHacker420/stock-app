import type { Page } from "@playwright/test";

const OWNER_IDENTIFIER = process.env.E2E_OWNER_IDENTIFIER || "9876543210";
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD || "owner123";

export async function loginAsOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Mobile number or email").fill(OWNER_IDENTIFIER);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page.waitForURL("**/dashboard");
}
