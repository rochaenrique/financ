import { expect, test } from "@playwright/test";

import { createProposal } from "./helpers";

test("switching language translates the page and reformats its numbers", async ({ page }) => {
  await createProposal(page);
  const table = page.locator("table");
  await expect(table).toContainText("3,000.00");

  await page.getByLabel("Language").selectOption("pt");

  await expect(page).toHaveURL(/\/pt\/project\//);
  await expect(page.getByRole("heading", { name: "Resultados" })).toBeVisible();
  await expect(table).toContainText("3.000,00");
  await expect(page.getByRole("button", { name: "Exportar relatório" })).toBeVisible();

  await page.getByLabel("Idioma").selectOption("es");

  await expect(page).toHaveURL(/\/es\/project\//);
  await expect(page.getByRole("heading", { name: "Resultados" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Exportar informe" })).toBeVisible();
  await expect(table).toContainText("3000,00");
});

test("the chosen language survives a reload and is used for later visits", async ({ page }) => {
  await createProposal(page);
  await page.getByLabel("Language").selectOption("pt");
  await expect(page).toHaveURL(/\/pt\/project\//);

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/pt\/project\//);

  await page.goto("/");
  await expect(page).toHaveURL(/\/pt$/);
});
