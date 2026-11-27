import { expect, type Page } from "@playwright/test";

// Pages are server-rendered and then hydrated, and a click that lands
// before hydration finishes is silently lost. Waiting for the network to go
// quiet (a production build has no dev-server socket keeping it busy) makes
// every test start from a fully interactive page.
export async function openApp(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

// Creates a project, opens it, and adds one source holding a single
// fixed-value item (default monthly schedule). With the defaults that's
// 3 x 1000 = 3,000.00 in the results table.
export async function createProposal(page: Page, { value = "1000", occurrences = "3" } = {}) {
  await openApp(page, "/en");
  await page.getByRole("button", { name: "New Project", exact: true }).click();
  await page.getByRole("link", { name: "New Project" }).click();
  await page.waitForURL(/\/en\/project\/[\w-]+$/);
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Add source" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Fixed Value/ }).click();
  await dialog.getByPlaceholder("0.00").fill(value);
  await dialog.getByText("Occurrences", { exact: true }).locator("xpath=following-sibling::input").fill(occurrences);
  await dialog.getByRole("button", { name: "Add item" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("table")).toBeVisible();
}
