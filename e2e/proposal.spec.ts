import { expect, test } from "@playwright/test";

import { createProposal, openApp } from "./helpers";

test.describe("building a proposal", () => {
  test("adding a fixed-value source shows its totals in the results table", async ({ page }) => {
    await createProposal(page);

    const table = page.locator("table");
    await expect(table.getByRole("row", { name: /New Source/ })).toContainText("3,000.00");
    await expect(table.getByRole("columnheader", { name: "Raw" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "VAM", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "New Source" })).toBeVisible();
    await expect(page.getByText("3× every 1 month from")).toBeVisible();
  });

  test("disabling an item takes it out of the totals, and enabling brings it back", async ({ page }) => {
    await createProposal(page);
    const table = page.locator("table");

    await page.getByRole("button", { name: "Disable item" }).click();
    await expect(table).not.toContainText("3,000.00");
    await expect(table.getByRole("row", { name: /New Source/ })).toContainText("0.00");

    await page.getByRole("button", { name: "Enable item" }).click();
    await expect(table).toContainText("3,000.00");
  });

  test("a duplicated source is a separate, independent copy", async ({ page }) => {
    await createProposal(page);

    await page.getByRole("button", { name: "Duplicate source" }).click();

    await expect(page.getByRole("heading", { name: "New Source copy" })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(2);

    // removing the copy leaves the original untouched
    await page.getByRole("button", { name: "Delete source" }).nth(1).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("table")).toContainText("3,000.00");
  });

  test("the project and its sources are still there after a reload", async ({ page }) => {
    await createProposal(page);

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("table")).toContainText("3,000.00");
  });

  test("renaming and deleting a project from the list", async ({ page }) => {
    await openApp(page, "/en");
    await page.getByRole("button", { name: "New Project", exact: true }).click();
    await expect(page.getByText("1 project")).toBeVisible();

    await page.getByRole("button", { name: "Rename project" }).click();
    await page.getByRole("dialog").getByRole("textbox").fill("Car loan");
    await page.getByRole("dialog").getByRole("button", { name: "Rename" }).click();
    await expect(page.getByRole("link", { name: "Car loan" })).toBeVisible();

    await page.getByRole("textbox", { name: "Search projects..." }).fill("zzz");
    await expect(page.getByText("No projects found")).toBeVisible();
    await page.getByRole("textbox", { name: "Search projects..." }).fill("car");
    await expect(page.getByRole("link", { name: "Car loan" })).toBeVisible();

    await page.getByRole("button", { name: "Delete project" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("0 projects")).toBeVisible();
  });
});
