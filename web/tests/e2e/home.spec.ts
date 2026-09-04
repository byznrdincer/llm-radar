import { expect, test } from "@playwright/test";
import { clickSidebarItem } from "./helpers";
import { mockHomeApi } from "./homeFixtures";

test.describe("Home dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await mockHomeApi(page);
    await page.goto("/");
    await expect(page.getByText("LLM RADAR").first()).toBeVisible();
  });

  test("searches the model catalog", async ({ page }) => {
    await clickSidebarItem(page, "Model kataloğu");
    await expect(page.locator(".catalog-model")).toHaveCount(12); // full 12-model fixture, page 1

    const search = page.locator(".catalog-search input");
    await search.click();
    await search.fill("atlas");
    await expect(page.locator(".catalog-model")).toHaveCount(2);
    await expect(page.locator(".catalog-model").first()).toContainText("Atlas");
  });

  test("filters by openness and clears the filter", async ({ page }) => {
    await clickSidebarItem(page, "Model kataloğu");
    await expect(page.locator(".catalog-model")).toHaveCount(12);

    await page.locator(".lb-filter-pills button", { hasText: "Open Weight" }).click();
    await expect(page.locator(".catalog-model")).toHaveCount(2);
    await expect(page.locator(".reset-filters")).toBeVisible();

    await page.locator(".reset-filters").click();
    await expect(page.locator(".catalog-model")).toHaveCount(12);
    await expect(page.locator(".reset-filters")).toHaveCount(0);
  });

  test("opens and closes a model's detail drawer", async ({ page }) => {
    await clickSidebarItem(page, "Model kataloğu");
    await page.locator(".catalog-link").first().click();

    const drawer = page.locator(".model-detail-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.locator("h2")).toHaveText("Atlas-7B");

    await page.locator("button.model-detail-close").click();
    await expect(drawer).toHaveCount(0);
  });

  test("adds two models to compare and sees the comparison toolbar", async ({ page }) => {
    await clickSidebarItem(page, "Model kataloğu");
    const rows = page.locator("tbody tr");
    await rows.nth(0).locator(".catalog-pick").click();
    await rows.nth(1).locator(".catalog-pick").click();

    await clickSidebarItem(page, "Karşılaştır");
    await expect(page.locator(".compare-toolbar")).toContainText("2");
    await expect(page.getByText("Akıllı model karşılaştırması.")).toBeVisible();
  });

  test("navigates between sections and back", async ({ page }) => {
    await expect(page.getByText("nabzını tut.")).toBeVisible();

    await clickSidebarItem(page, "Model kataloğu");
    await expect(page.getByText("Model kataloğu").first()).toBeVisible();
    await expect(page.locator(".catalog-model").first()).toBeVisible();

    await clickSidebarItem(page, "Genel bakış");
    await expect(page.getByText("nabzını tut.")).toBeVisible();
    await expect(page.locator(".catalog-model")).toHaveCount(0);
  });
});
