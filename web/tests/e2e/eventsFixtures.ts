import type { Page } from "@playwright/test";

type MockEvent = {
  id: string;
  event_type: string;
  category: string;
  entity_id: string;
  title: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  change_percentage: string | null;
  importance: string;
  importance_score: number;
  model_level: string | null;
  detected_at: string;
  evidence: { source: string; source_url: string } | null;
};

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

// Deliberately not correlated with index i: recency (detected_at) is tied
// to i below, so a permutation here is what lets "sort by recent" and
// "sort by priority" (the default) disagree on which card comes first -
// the thing the sort test actually needs to observe.
const SCORE_PERM = [
  40, 95, 10, 77, 3, 88, 55, 20, 99, 5, 60, 33, 71, 15, 90, 44, 8, 66, 25, 80,
  12, 58, 91, 2, 49, 70,
];

// 26 synthetic events: enough for two full pages (PAGE_SIZE=12) plus a
// remainder, spanning two categories/importances/model levels so filter and
// sort assertions have something to distinguish.
export const MOCK_EVENTS: MockEvent[] = Array.from({ length: 26 }, (_, i) => {
  const isRelease = i % 2 === 0;
  return {
    id: `evt-${i}`,
    event_type: isRelease ? "model.released" : "price.changed",
    category: isRelease ? "model_release" : "pricing_change",
    entity_id: `model-${i}`,
    title: isRelease ? `Mock Model ${i} released` : `Mock Model ${i}: price changed`,
    old_value: null,
    new_value: isRelease
      ? { organization: "Mockorg", is_open_weight: i % 4 === 0, license: "Apache-2.0" }
      : { organization: "Mockorg" },
    change_percentage: isRelease ? null : "-5.0",
    importance: i % 3 === 0 ? "critical" : i % 3 === 1 ? "high" : "medium",
    importance_score: SCORE_PERM[i],
    model_level: i % 4 === 0 ? "frontier" : "advanced",
    // Kept comfortably inside the page's default 24h "Zaman" filter (see
    // events.spec.ts) - a boundary-hugging timestamp here would race the
    // wall clock between fixture generation and the browser's actual fetch.
    detected_at: hoursAgo(i * 0.8),
    evidence: { source: "huggingface", source_url: "https://huggingface.co/mockorg/model" },
  };
});

/**
 * Serves /api/v1/events against the fixture list above, applying the same
 * query params the real API accepts (category/importance/since/search/
 * sort_by/limit/offset) so filter, sort, and pagination flows exercise real
 * request-building code, not a canned response.
 */
export async function mockEventsFeed(page: Page) {
  await page.route("**/api/v1/events**", (route) => {
    const url = new URL(route.request().url());
    const params = url.searchParams;
    let items = [...MOCK_EVENTS];

    const category = params.get("category");
    if (category) items = items.filter((e) => e.category === category);

    const importance = params.get("importance");
    if (importance) items = items.filter((e) => e.importance === importance);

    const since = params.get("since");
    if (since) items = items.filter((e) => e.detected_at >= since);

    const search = params.get("search");
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((e) => e.title.toLowerCase().includes(q));
    }

    const sortBy = params.get("sort_by") ?? "priority";
    items.sort((a, b) => {
      if (sortBy === "recent") return b.detected_at.localeCompare(a.detected_at);
      if (sortBy === "importance") return b.importance_score - a.importance_score;
      const rank = (level: string | null) =>
        level === "frontier" ? 0 : level === "advanced" ? 1 : 2;
      return rank(a.model_level) - rank(b.model_level) || b.importance_score - a.importance_score;
    });

    const total = items.length;
    const offset = Number(params.get("offset") ?? 0);
    const limit = Number(params.get("limit") ?? 12);
    const page_items = items.slice(offset, offset + limit);

    return route.fulfill({
      json: { items: page_items, total, offset, limit },
    });
  });

  // The page also opens an SSE stream for live updates; let it fail closed
  // instead of hanging a real connection open for the whole test run.
  await page.route("**/api/v1/stream/events", (route) => route.abort());
}
