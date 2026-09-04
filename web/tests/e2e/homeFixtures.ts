import type { Page } from "@playwright/test";

type MockModel = {
  id: string;
  slug: string;
  name: string;
  family: string | null;
  release_date: string | null;
  parameter_count: number | null;
  active_parameter_count: number | null;
  developer: { slug: string; name: string };
  provider: { slug: string; name: string } | null;
  providers: string[];
  context_window: number | null;
  pricing: { input: string | null; output: string | null; cache_read: string | null };
  modalities: string[];
  tool_calling: boolean | null;
  reasoning: boolean | null;
  availability: string | null;
  openness: string;
  license: string | null;
  license_category: string;
  commercial_use_status: string;
  observed_at: string;
  selection: null;
};

export const MOCK_MODELS: MockModel[] = [
  {
    id: "m-atlas",
    slug: "mockorg/atlas-7b",
    name: "Atlas-7B",
    family: "Atlas",
    release_date: "2026-01-01",
    parameter_count: 7_000_000_000,
    active_parameter_count: null,
    developer: { slug: "mockorg", name: "Mockorg" },
    provider: { slug: "mockorg", name: "Mockorg" },
    providers: ["mockorg"],
    context_window: 128_000,
    pricing: { input: "0.50", output: "1.50", cache_read: null },
    modalities: ["text"],
    tool_calling: true,
    reasoning: false,
    availability: "available",
    openness: "open_weight",
    license: "Apache-2.0",
    license_category: "permissive",
    commercial_use_status: "allowed",
    observed_at: "2026-09-01T00:00:00Z",
    selection: null,
  },
  {
    id: "m-atlas-mini",
    slug: "mockorg/atlas-mini",
    name: "Atlas-Mini",
    family: "Atlas",
    release_date: "2026-01-15",
    parameter_count: 1_000_000_000,
    active_parameter_count: null,
    developer: { slug: "mockorg", name: "Mockorg" },
    provider: { slug: "mockorg", name: "Mockorg" },
    providers: ["mockorg"],
    context_window: 32_000,
    pricing: { input: "0.10", output: "0.30", cache_read: null },
    modalities: ["text"],
    tool_calling: false,
    reasoning: false,
    availability: "available",
    openness: "open_weight",
    license: "Apache-2.0",
    license_category: "permissive",
    commercial_use_status: "allowed",
    observed_at: "2026-09-01T00:00:00Z",
    selection: null,
  },
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `m-closed-${i}`,
    slug: `otherorg/closed-model-${i}`,
    name: `Closed Model ${i}`,
    family: "Closed",
    release_date: "2026-02-01",
    parameter_count: null,
    active_parameter_count: null,
    developer: { slug: "otherorg", name: "Otherorg" },
    provider: { slug: "otherorg", name: "Otherorg" },
    providers: ["otherorg"],
    context_window: 64_000,
    pricing: { input: "2.00", output: "6.00", cache_read: null },
    modalities: ["text"],
    tool_calling: true,
    reasoning: true,
    availability: "available",
    openness: "proprietary",
    license: "Proprietary",
    license_category: "proprietary",
    commercial_use_status: "restricted",
    observed_at: "2026-09-01T00:00:00Z",
    selection: null,
  })),
];

function matchesQuery(model: MockModel, search: string): boolean {
  const q = search.toLowerCase();
  return model.name.toLowerCase().includes(q) || model.developer.name.toLowerCase().includes(q);
}

/**
 * Mocks every endpoint page.tsx's bootstrap effect and the useModelCatalog/
 * useLeaderboardData/useModelDetail/useModelCompare hooks call, so the whole
 * dashboard - not just one section - renders from fixed data with no real
 * backend. /models/search backs three different callers (the catalog boot
 * fetch, the debounced filter fetch, and the search box's own suggestion
 * dropdown) and is filtered here the same way the real endpoint would be.
 */
export async function mockHomeApi(page: Page) {
  await page.route("**/api/v1/stats", (route) =>
    route.fulfill({
      json: { companies: 2, models: MOCK_MODELS.length, snapshots: 10, price_observations: 10, change_events: 5 },
    }),
  );

  await page.route("**/api/v1/models/facets", (route) =>
    route.fulfill({
      json: {
        developers: [
          { slug: "mockorg", name: "Mockorg", count: 2 },
          { slug: "otherorg", name: "Otherorg", count: 10 },
        ],
        providers: [{ slug: "mockorg", name: "Mockorg", count: 2 }],
        families: [{ name: "Atlas", count: 2 }],
        modalities: [{ name: "text", count: 12 }],
        capabilities: [],
        licenses: [{ name: "Apache-2.0", count: 2 }],
        openness: [{ name: "open_weight", count: 2 }],
        commercial_use: [{ name: "allowed", count: 2 }],
        benchmark_focuses: [],
      },
    }),
  );

  await page.route("**/api/v1/models/search**", (route) => {
    const url = new URL(route.request().url());
    const params = url.searchParams;
    let items = [...MOCK_MODELS];

    const search = params.get("search");
    if (search) items = items.filter((m) => matchesQuery(m, search));

    for (const openness of params.getAll("openness")) {
      items = items.filter((m) => m.openness === openness);
    }
    for (const developer of params.getAll("developer")) {
      items = items.filter((m) => m.developer.slug === developer);
    }

    const total = items.length;
    const offset = Number(params.get("offset") ?? 0);
    const limit = Number(params.get("limit") ?? 20);
    return route.fulfill({ json: { items: items.slice(offset, offset + limit), total } });
  });

  await page.route("**/api/v1/models/m-*", (route) => {
    const id = route.request().url().split("/").pop() ?? "";
    const model = MOCK_MODELS.find((m) => m.id === id);
    if (!model) return route.fulfill({ status: 404, json: { detail: "not found" } });
    return route.fulfill({
      json: {
        id: model.id,
        slug: model.slug,
        name: model.name,
        family: model.family,
        release_date: model.release_date,
        parameter_count: model.parameter_count,
        active_parameter_count: model.active_parameter_count,
        company: model.developer,
        context_window: model.context_window,
        capabilities: { input_modalities: model.modalities },
        pricing: model.pricing.input
          ? { ...model.pricing, currency: "USD", observed_at: model.observed_at }
          : null,
        profile: {
          tool_calling: model.tool_calling,
          reasoning: model.reasoning,
          availability: model.availability,
          openness: model.openness,
          license: model.license,
          commercial_use_status: model.commercial_use_status,
        },
        description: null,
        tokenizer: null,
        created: null,
        sources: [],
        price_history: [],
        benchmarks: [],
      },
    });
  });

  await page.route("**/api/v1/models/compare**", (route) => {
    const ids = new URL(route.request().url()).searchParams.getAll("ids");
    return route.fulfill({
      json: {
        items: ids.map((id) => ({
          id,
          selection: null,
          features: {
            context_window: MOCK_MODELS.find((m) => m.id === id)?.context_window ?? null,
            input_price: null,
            output_price: null,
            cache_read_price: null,
            modalities: ["text"],
            tool_calling: null,
            reasoning: null,
            availability: null,
            license: null,
          },
        })),
      },
    });
  });

  await page.route("**/api/v1/research**", (route) =>
    route.fulfill({ json: { items: [], total: 0, summary: null, limit: 17 } }),
  );
  await page.route("**/api/v1/models/turkish**", (route) => route.fulfill({ json: { items: [] } }));
  await page.route("**/api/v1/technology**", (route) => route.fulfill({ json: { items: [] } }));
  await page.route("**/api/v1/leaderboards/**", (route) =>
    route.fulfill({ json: { items: [], category: null } }),
  );
  await page.route("**/api/v1/analytics/**", (route) => route.fulfill({ json: {} }));
}
