import type { EventSort, FeedEvent } from "./eventTypes";

export const PAGE_SIZE = 12;

const MODEL_LEVEL_ORDER: Record<string, number> = {
  frontier: 0,
  advanced: 1,
  mid: 2,
  entry: 3,
};

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function compareEvents(a: FeedEvent, b: FeedEvent, sortBy: EventSort): number {
  if (sortBy === "recent") return Date.parse(b.detected_at) - Date.parse(a.detected_at);
  if (sortBy === "importance") {
    return b.importance_score - a.importance_score
      || Date.parse(b.detected_at) - Date.parse(a.detected_at);
  }
  return (MODEL_LEVEL_ORDER[a.model_level ?? ""] ?? 4)
    - (MODEL_LEVEL_ORDER[b.model_level ?? ""] ?? 4)
    || b.importance_score - a.importance_score
    || Date.parse(b.detected_at) - Date.parse(a.detected_at);
}

export function eventQueryParams({
  offset,
  category,
  days,
  query,
  importance,
  openness,
  modelLevel,
  sortBy,
}: {
  offset: number;
  category: string;
  days: string;
  query: string;
  importance: string;
  openness: string;
  modelLevel: string;
  sortBy: EventSort;
}): URLSearchParams {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
    sort_by: sortBy,
  });
  if (category !== "any") params.set("category", category);
  if (days !== "any") params.set("since", daysAgoIso(Number(days)));
  if (query.trim()) params.set("search", query.trim());
  if (importance !== "any") params.set("importance", importance);
  if (openness !== "any") params.set("openness", openness);
  if (modelLevel !== "any") params.set("model_level", modelLevel);
  return params;
}

export function eventMatchesFilters(
  event: FeedEvent,
  filters: {
    category: string;
    days: string;
    query: string;
    importance: string;
    openness: string;
    modelLevel: string;
  },
  locale: string,
): boolean {
  if (filters.category !== "any" && event.category !== filters.category) return false;
  if (filters.importance !== "any" && event.importance !== filters.importance) return false;
  if (filters.days !== "any") {
    const cutoff = Date.now() - Number(filters.days) * 24 * 60 * 60 * 1000;
    if (new Date(event.detected_at).getTime() < cutoff) return false;
  }
  // Openness is resolved server-side from the model's canonical profile -
  // a live-streamed event can't be safely classified client-side, so while
  // an openness filter is active it's left for the next authoritative fetch
  // instead of guessing.
  if (filters.openness !== "any") return false;
  if (filters.modelLevel !== "any") return false;
  const query = filters.query.trim().toLocaleLowerCase(locale);
  return !query || event.title.toLocaleLowerCase(locale).includes(query);
}
