from datetime import UTC, datetime, timedelta

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

COLLECTOR_SUCCESS = Counter(
    "llm_radar_collector_success_total", "Successful collector runs", ["collector"]
)
COLLECTOR_FAILURE = Counter(
    "llm_radar_collector_failure_total", "Failed collector runs", ["collector"]
)
EVENTS_INGESTED = Counter("llm_radar_events_ingested_total", "Events ingested", ["event_type"])
PROCESS_SECONDS = Histogram("llm_radar_process_seconds", "Event processing time")
API_REQUESTS = Counter("llm_radar_api_requests_total", "API requests", ["path", "method", "status"])

# Gauges refreshed periodically (see collectors.scheduler.refresh_metrics_job)
# rather than per-request, so they reflect DB state even when nothing is
# actively hitting the API - what an outbox-backlog or source-staleness
# alert needs to fire independent of traffic.
OUTBOX_BACKLOG = Gauge(
    "llm_radar_outbox_backlog", "OutboxEvent rows still pending or awaiting retry"
)
STALE_SOURCES = Gauge(
    "llm_radar_stale_sources", "Configured, active sources with no recent successful check"
)


def metrics_response() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST


def refresh_gauges(session: Session, *, source_stale_after_hours: int) -> None:
    """Recompute the periodic gauges from the DB. Import kept local to the
    caller's models to avoid a hard dependency on the api package here."""
    from llm_radar.config import source_is_configured
    from llm_radar.database.models import OutboxEvent, Source

    backlog = (
        session.scalar(
            select(func.count())
            .select_from(OutboxEvent)
            .where(OutboxEvent.status.in_(["pending", "retry"]))
        )
        or 0
    )
    OUTBOX_BACKLOG.set(backlog)

    stale_after = timedelta(hours=source_stale_after_hours)
    now = datetime.now(UTC)
    stale_count = 0
    for source in session.scalars(select(Source)):
        if not (source.is_active and source_is_configured(source.slug or source.name)):
            continue
        if source.last_success_at is None or now - source.last_success_at > stale_after:
            stale_count += 1
    STALE_SOURCES.set(stale_count)
