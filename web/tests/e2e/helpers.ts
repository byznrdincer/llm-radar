import type { Page } from "@playwright/test";

/**
 * The dashboard is server-rendered first and hydrates client-side; a click
 * fired in that window lands on real DOM but no attached React handler yet.
 * Retry the click instead of guessing a fixed hydration delay.
 */
export async function clickSidebarItem(page: Page, label: string) {
  // Scoped to the sidebar nav: some page content (e.g. the catalog's
  // compare-pick buttons) reuses the same accessible name ("Karşılaştır")
  // as a nav item, which an unscoped getByRole would ambiguously match.
  const button = page.locator(".sidebar-nav").getByRole("button", { name: label, exact: true });
  await button.waitFor({ state: "visible" });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await button.click();
    try {
      await page.waitForFunction(
        (text) =>
          document.querySelector("h2, h3")?.textContent?.includes(text) ||
          document.querySelector(".sidebar-nav .active")?.textContent?.includes(text),
        label,
        { timeout: 1000 },
      );
      return;
    } catch {
      // not hydrated yet (or still animating in) - retry the click
    }
  }
}

const SAMPLE_MODELS = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "GPT-5.5",
    slug: "gpt-5-5",
    developer: { slug: "openai", name: "OpenAI" },
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Claude Opus 5",
    slug: "claude-opus-5",
    developer: { slug: "anthropic", name: "Anthropic" },
  },
];

/** Intercepts model search/list calls so tests never depend on a real API. */
export async function mockModelSearch(page: Page) {
  await page.route("**/api/v1/models/search**", (route) => {
    const search = new URL(route.request().url()).searchParams.get("search")?.toLowerCase() ?? "";
    const items = SAMPLE_MODELS.filter(
      (model) =>
        model.name.toLowerCase().includes(search) ||
        model.developer.name.toLowerCase().includes(search),
    );
    return route.fulfill({ json: { items, total: items.length } });
  });
}

export async function mockStats(page: Page) {
  await page.route("**/api/v1/stats", (route) =>
    route.fulfill({
      json: {
        companies: 1,
        models: 1,
        snapshots: 1,
        price_observations: 1,
        change_events: 1,
      },
    }),
  );
}
