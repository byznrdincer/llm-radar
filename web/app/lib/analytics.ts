export type AnalyticsEventType =
  | "model_viewed"
  | "model_compared"
  | "filter_applied"
  | "sort_changed"
  | "search_performed"
  | "feedback_submitted"
  | "model_requested";

type AnalyticsPayload = {
  model_id?: string;
  related_model_ids?: string[];
  filters?: Record<string, unknown>;
  sort?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

const SESSION_KEY = "llm-radar-session-id";

export function getSessionId(): string {
  if (typeof window === "undefined") return "00000000-0000-4000-8000-000000000000";
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = window.crypto.randomUUID();
  window.sessionStorage.setItem(SESSION_KEY, created);
  return created;
}

export function trackEvent(
  api: string,
  eventType: AnalyticsEventType,
  payload: AnalyticsPayload = {},
): void {
  if (typeof window === "undefined") return;
  const body = {
    event_id: window.crypto.randomUUID(),
    event_type: eventType,
    session_id: getSessionId(),
    page: `${window.location.pathname}${window.location.hash}`,
    ...payload,
  };
  void fetch(`${api}/api/v1/analytics/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}
