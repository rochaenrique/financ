import fs from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { createProposal, openApp } from "./helpers";

test.describe("exporting", () => {
  test("a project exported to JSON can be deleted and imported back unchanged", async ({ page }, testInfo) => {
    await createProposal(page);

    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^New Project-\d{4}-\d{2}-\d{2}\.json$/);
    const exportPath = testInfo.outputPath("project.json");
    await download.saveAs(exportPath);

    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await expect(page.getByRole("link", { name: "New Project" })).toBeVisible();
    await page.getByRole("button", { name: "Delete project" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No projects found")).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(exportPath);
    await expect(page.getByRole("link", { name: "New Project" })).toBeVisible();

    await page.getByRole("link", { name: "New Project" }).click();
    await expect(page.locator("table")).toContainText("3,000.00");
  });

  test("importing a project that already exists asks before overwriting it", async ({ page }, testInfo) => {
    await createProposal(page);
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const exportPath = testInfo.outputPath("project.json");
    await (await downloading).saveAs(exportPath);
    await page.getByRole("button", { name: "Projects", exact: true }).click();

    await page.locator('input[type="file"]').setInputFiles(exportPath);

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Project already exists");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("1 project")).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(exportPath);
    await page.getByRole("alertdialog").getByRole("button", { name: "Overwrite" }).click();
    await expect(page.getByText("1 project")).toBeVisible();
  });

  test("a file that isn't a project export is rejected with a clear message", async ({ page }) => {
    await openApp(page, "/en");

    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.json",
      mimeType: "application/json",
      buffer: Buffer.from("this is not a project"),
    });

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Import failed");
    await expect(dialog).toContainText("doesn't look like a project export");
    await expect(page.getByText("0 projects")).toBeVisible();
  });

  test("the PDF report downloads as a real PDF named after the project", async ({ page }, testInfo) => {
    await createProposal(page);

    await page.getByRole("button", { name: "Export Report" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("textbox")).toHaveValue("New Project-Report.pdf");

    const downloading = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Export", exact: true }).click();
    const download = await downloading;

    expect(download.suggestedFilename()).toBe("New Project-Report.pdf");
    const reportPath = testInfo.outputPath("report.pdf");
    await download.saveAs(reportPath);
    const bytes = await fs.readFile(reportPath);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(5_000);
    expect(bytes.toString("latin1")).toContain("(Summary Table)");
  });
});
