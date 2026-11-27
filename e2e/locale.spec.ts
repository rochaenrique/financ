import { expect, test } from "@playwright/test";

import { openApp } from "./helpers";

test.describe("language detection", () => {
  test.describe("English browser", () => {
    test.use({ locale: "en-US" });

    test("lands on /en", async ({ page }) => {
      await openApp(page, "/");

      await expect(page).toHaveURL(/\/en$/);
      await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
    });
  });

  test.describe("Spanish browser", () => {
    test.use({ locale: "es-ES" });

    test("lands on /es", async ({ page }) => {
      await openApp(page, "/");

      await expect(page).toHaveURL(/\/es$/);
      await expect(page.getByRole("heading", { name: "Proyectos" })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
    });
  });

  test.describe("Brazilian Portuguese browser", () => {
    test.use({ locale: "pt-BR" });

    test("lands on /pt", async ({ page }) => {
      await openApp(page, "/");

      await expect(page).toHaveURL(/\/pt$/);
      await expect(page.getByRole("heading", { name: "Projetos" })).toBeVisible();
    });
  });

  test.describe("browser in an unsupported language", () => {
    test.use({ locale: "fr-FR" });

    test("falls back to English", async ({ page }) => {
      await openApp(page, "/");

      await expect(page).toHaveURL(/\/en$/);
    });
  });

  test("an explicit choice beats the browser's language on later visits", async ({ page }) => {
    // the default test browser is English; visiting /pt records the choice
    await openApp(page, "/pt");
    await expect(page.getByRole("heading", { name: "Projetos" })).toBeVisible();

    await openApp(page, "/");

    await expect(page).toHaveURL(/\/pt$/);
  });

  test("an unknown language prefix is a 404, not a crash", async ({ page }) => {
    const response = await page.goto("/xx");

    expect(response?.status()).toBe(404);
  });
});
