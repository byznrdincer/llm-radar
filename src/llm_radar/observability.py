from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

COLLECTOR_SUCCESS = Counter(
    "llm_radar_collector_success_total", "Successful collector runs", ["collector"]
)
COLLECTOR_FAILURE = Counter(
    "llm_radar_collector_failure_total", "Failed collector runs", ["collector"]
)
EVENTS_INGESTED = Counter("llm_radar_events_ingested_total", "Events ingested", ["event_type"])
PROCESS_SECONDS = Histogram("llm_radar_process_seconds", "Event processing time")
API_REQUESTS = Counter("llm_radar_api_requests_total", "API requests", ["path", "method", "status"])


def metrics_response() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
