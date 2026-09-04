import { expect, test } from "@playwright/test";
import { clickSidebarItem } from "./helpers";
import { mockEventsFeed } from "./eventsFixtures";

// Plain :has-text() substring-matches into a select's own <option> text too
// (e.g. "Önem" is a substring of the sort dropdown's "En önemli" option), so
// filters are targeted by their exact label span instead.
function filterSelect(page: import("@playwright/test").Page, label: string) {
  return page.locator(`.ev-filter:has(span:text-is("${label}")) select`);
}

test.describe("Events page", () => {
  test.beforeEach(async ({ page }) => {
    await mockEventsFeed(page);
    await page.goto("/");
    await clickSidebarItem(page, "Gelişmeler");
    await expect(page.getByText("Teknoloji gelişmeleri")).toBeVisible();
  });

  test("filters by category and importance, then clears", async ({ page }) => {
    const grid = page.locator(".ev-grid .ev-card");
    await expect(grid).toHaveCount(11); // 26 events, page 1 minus the featured card

    await filterSelect(page, "Kategori").selectOption("model_release");
    await expect(grid).toHaveCount(11); // 13 model_release events: 12 on page 1, minus featured

    await filterSelect(page, "Önem").selectOption("critical");
    await expect(grid).toHaveCount(4); // 5 model_release + critical events, minus featured

    await page.locator(".ev-clear-filters").click();
    await expect(grid).toHaveCount(11);
    await expect(filterSelect(page, "Kategori")).toHaveValue("any");
  });

  test("changes the order when sort changes", async ({ page }) => {
    await expect(page.locator(".ev-featured h3")).toHaveText("Mock Model 8 released");

    await filterSelect(page, "Sıralama").selectOption("recent");
    await expect(page.locator(".ev-featured h3")).toHaveText("Mock Model 0 released");
  });

  test("saves an event and shows it under the saved tab", async ({ page }) => {
    const firstCard = page.locator(".ev-grid .ev-card").first();
    const title = await firstCard.locator("h4").textContent();

    await firstCard.locator(".ev-card-actions button").click();
    await expect(page.getByRole("tab", { name: /Kaydedilenler/ })).toContainText("1");

    await page.getByRole("tab", { name: /Kaydedilenler/ }).click();
    await expect(page.locator(".ev-grid .ev-card")).toHaveCount(1);
    await expect(page.locator(".ev-grid .ev-card h4")).toHaveText(title ?? "");
  });

  test("loads more events on scroll", async ({ page }) => {
    const grid = page.locator(".ev-grid .ev-card");
    await expect(grid).toHaveCount(11);

    // The scroll sentinel triggers via IntersectionObserver, not a scroll
    // event - scrolling the actual document is what puts it in view. Under
    // worker contention (the whole e2e suite shares one dev server) a single
    // scroll can land before layout catches up, so repeat it while polling.
    await expect(async () => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(grid).toHaveCount(25); // all 26 fixture events, minus the featured card
    }).toPass({ timeout: 15000 });
  });
});
