from __future__ import annotations

from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from html import escape
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.requests import Request
from starlette_admin import (
    CardRowWidget,
    ChartWidget,
    ColumnWidget,
    HtmlWidget,
    StatWidget,
    TableWidget,
)

from llm_radar.database.models import AnalyticsEvent, Model
from llm_radar.database.session import engine


TR = ZoneInfo("Europe/Istanbul")

EVENT_LABELS = {
    "model_viewed": "Model görüntüledi",
    "model_compared": "Model karşılaştırdı",
    "search_performed": "Arama yaptı",
    "filter_applied": "Filtre kullandı",
    "sort_changed": "Sıralamayı değiştirdi",
    "model_requested": "LLMaaS modeli istedi",
    "feedback_submitted": "Geri bildirim gönderdi",
}

EVENT_ORDER = [
    "model_viewed",
    "model_compared",
    "search_performed",
    "filter_applied",
    "sort_changed",
    "model_requested",
    "feedback_submitted",
]

FILTER_LABELS = {
    "families": "Model ailesi",
    "licenses": "Lisans",
    "openness": "Açıklık",
    "providers": "Sağlayıcı",
    "developers": "Geliştirici",
    "modalities": "Modalite",
    "min_context": "Minimum context",
    "capabilities": "Yetenek",
    "commercial_use": "Ticari kullanım",
    "benchmark_focus": "Benchmark odağı",
    "max_input_price": "Maks. girdi fiyatı",
    "max_output_price": "Maks. çıktı fiyatı",
}

SORT_LABELS = {
    "benchmark_score": "Benchmark skoru",
    "context": "Context",
    "input_price": "Girdi fiyatı",
    "output_price": "Çıktı fiyatı",
    "provider": "Sağlayıcı",
    "name": "Model adı",
}


def _fmt_time(value: datetime | None) -> str:
    if value is None:
        return "—"

    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)

    return value.astimezone(TR).strftime("%d.%m.%Y %H:%M:%S")


def _uuid(value: object) -> UUID | None:
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _model_name_map(db: Session, ids: set[str]) -> dict[str, str]:
    parsed = [item for raw in ids if (item := _uuid(raw)) is not None]

    if not parsed:
        return {}

    rows = db.execute(
        select(Model.id, Model.name).where(Model.id.in_(parsed))
    ).all()

    return {str(model_id): name for model_id, name in rows}


def _event_model_ids(event: AnalyticsEvent) -> list[str]:
    ids: list[str] = []

    if event.model_id:
        ids.append(str(event.model_id))

    if event.event_type == "model_compared":
        related = event.related_model_ids or []
        if related:
            ids = [str(item) for item in related]

    if event.event_type == "model_requested":
        metadata = event.event_metadata or {}
        ids.extend(
            str(item)
            for item in metadata.get("requested_model_ids", [])
        )

    return list(dict.fromkeys(ids))


def _filter_parts(filters: dict | None) -> list[str]:
    if not filters:
        return []

    parts: list[str] = []

    for key, value in filters.items():
        if value in (None, "", [], {}, "any"):
            continue

        label = FILTER_LABELS.get(key, key)

        if isinstance(value, list):
            for item in value:
                parts.append(f"{label}: {item}")
        else:
            parts.append(f"{label}: {value}")

    return parts


def _event_detail(
    event: AnalyticsEvent,
    names: dict[str, str],
) -> str:
    metadata = event.event_metadata or {}

    if event.event_type == "search_performed":
        query = (event.filters or {}).get("query")
        return f'Arama: "{query}"' if query else "Arama yaptı"

    if event.event_type == "filter_applied":
        parts = _filter_parts(event.filters)
        return ", ".join(parts) if parts else "Filtreleri değiştirdi"

    if event.event_type == "sort_changed":
        field = (event.sort or {}).get("field")
        return f"Sıralama: {SORT_LABELS.get(field, field or '—')}"

    if event.event_type == "model_compared":
        model_names = [
            names.get(model_id, model_id)
            for model_id in _event_model_ids(event)
        ]
        return " ↔ ".join(model_names)

    if event.event_type == "model_requested":
        requested = metadata.get("requested_models", [])
        return ", ".join(requested) if requested else "Model talebi oluşturdu"

    if event.event_type == "feedback_submitted":
        feedback_type = metadata.get("feedback_type", "general")
        return f"Geri bildirim türü: {feedback_type}"

    if event.event_type == "model_viewed":
        return "Model detayını görüntüledi"

    return "—"


def _interest_data(db: Session) -> list[dict]:
    events = db.scalars(
        select(AnalyticsEvent)
        .where(
            AnalyticsEvent.event_type.in_(
                ["model_viewed", "model_compared", "model_requested"]
            )
        )
        .order_by(AnalyticsEvent.created_at.desc())
        .limit(50000)
    ).all()

    stats: dict[str, dict] = defaultdict(
        lambda: {
            "views": 0,
            "comparisons": 0,
            "requests": 0,
            "sessions": set(),
        }
    )

    for event in events:
        model_ids = _event_model_ids(event)

        for model_id in model_ids:
            item = stats[model_id]

            if event.event_type == "model_viewed":
                item["views"] += 1
            elif event.event_type == "model_compared":
                item["comparisons"] += 1
            elif event.event_type == "model_requested":
                item["requests"] += 1

            if event.session_id:
                item["sessions"].add(str(event.session_id))

    names = _model_name_map(db, set(stats))

    rows = []

    for model_id, item in stats.items():
        total = (
            item["views"]
            + item["comparisons"]
            + item["requests"]
        )

        rows.append(
            {
                "model": names.get(model_id, model_id),
                "views": item["views"],
                "comparisons": item["comparisons"],
                "requests": item["requests"],
                "sessions": len(item["sessions"]),
                "total": total,
            }
        )

    return sorted(
        rows,
        key=lambda item: (
            item["total"],
            item["sessions"],
            item["views"],
        ),
        reverse=True,
    )


def _session_data(db: Session) -> list[dict]:
    events = db.scalars(
        select(AnalyticsEvent)
        .order_by(AnalyticsEvent.created_at.desc())
        .limit(20000)
    ).all()

    sessions: dict[str, dict] = {}

    for event in events:
        if not event.session_id:
            continue

        session_id = str(event.session_id)

        item = sessions.setdefault(
            session_id,
            {
                "session_id": session_id,
                "first": event.created_at,
                "last": event.created_at,
                "events": 0,
                "views": 0,
                "comparisons": 0,
                "searches": 0,
                "filters": 0,
                "requests": 0,
                "models": Counter(),
            },
        )

        item["events"] += 1
        item["first"] = min(item["first"], event.created_at)
        item["last"] = max(item["last"], event.created_at)

        if event.event_type == "model_viewed":
            item["views"] += 1
        elif event.event_type == "model_compared":
            item["comparisons"] += 1
        elif event.event_type == "search_performed":
            item["searches"] += 1
        elif event.event_type == "filter_applied":
            item["filters"] += 1
        elif event.event_type == "model_requested":
            item["requests"] += 1

        for model_id in _event_model_ids(event):
            item["models"][model_id] += 1

    all_model_ids = {
        model_id
        for item in sessions.values()
        for model_id in item["models"]
    }

    names = _model_name_map(db, all_model_ids)

    result = []

    for item in sessions.values():
        top_model = "—"

        if item["models"]:
            model_id, _ = item["models"].most_common(1)[0]
            top_model = names.get(model_id, model_id)

        result.append(
            {
                **item,
                "top_model": top_model,
            }
        )

    return sorted(
        result,
        key=lambda item: item["last"],
        reverse=True,
    )


async def total_sessions(_: Request) -> int:
    with Session(engine) as db:
        return (
            db.scalar(
                select(
                    func.count(
                        func.distinct(AnalyticsEvent.session_id)
                    )
                )
            )
            or 0
        )


async def events_24h(_: Request) -> int:
    since = datetime.now(UTC) - timedelta(hours=24)

    with Session(engine) as db:
        return (
            db.scalar(
                select(func.count(AnalyticsEvent.id)).where(
                    AnalyticsEvent.created_at >= since
                )
            )
            or 0
        )


async def views_24h(_: Request) -> int:
    since = datetime.now(UTC) - timedelta(hours=24)

    with Session(engine) as db:
        return (
            db.scalar(
                select(func.count(AnalyticsEvent.id)).where(
                    AnalyticsEvent.created_at >= since,
                    AnalyticsEvent.event_type == "model_viewed",
                )
            )
            or 0
        )


async def requests_24h(_: Request) -> int:
    since = datetime.now(UTC) - timedelta(hours=24)

    with Session(engine) as db:
        return (
            db.scalar(
                select(func.count(AnalyticsEvent.id)).where(
                    AnalyticsEvent.created_at >= since,
                    AnalyticsEvent.event_type == "model_requested",
                )
            )
            or 0
        )


async def event_series(_: Request) -> list[dict]:
    since = datetime.now(UTC) - timedelta(hours=24)

    with Session(engine) as db:
        rows = db.execute(
            select(
                AnalyticsEvent.event_type,
                func.count(AnalyticsEvent.id),
            )
            .where(AnalyticsEvent.created_at >= since)
            .group_by(AnalyticsEvent.event_type)
        ).all()

    counts = {event_type: count for event_type, count in rows}

    return [
        {
            "name": "Etkileşim",
            "data": [counts.get(key, 0) for key in EVENT_ORDER],
        }
    ]


async def top_model_rows(_: Request) -> list[list]:
    with Session(engine) as db:
        rows = _interest_data(db)[:15]

    return [
        [
            item["model"],
            item["views"],
            item["comparisons"],
            item["requests"],
            item["sessions"],
            item["total"],
        ]
        for item in rows
    ]


async def session_rows(_: Request) -> list[list]:
    with Session(engine) as db:
        rows = _session_data(db)[:50]

    return [
        [
            item["session_id"],
            _fmt_time(item["last"]),
            item["events"],
            item["views"],
            item["comparisons"],
            item["searches"],
            item["filters"],
            item["requests"],
            item["top_model"],
        ]
        for item in rows
    ]


async def recent_activity_rows(_: Request) -> list[list]:
    with Session(engine) as db:
        events = db.scalars(
            select(AnalyticsEvent)
            .order_by(AnalyticsEvent.created_at.desc())
            .limit(25)
        ).all()

        ids = {
            model_id
            for event in events
            for model_id in _event_model_ids(event)
        }

        names = _model_name_map(db, ids)

        rows = []

        for event in events:
            event_models = _event_model_ids(event)

            model_names = [
                names.get(model_id, model_id)
                for model_id in event_models
            ]

            rows.append(
                [
                    _fmt_time(event.created_at),
                    str(event.session_id)[:8] if event.session_id else "—",
                    EVENT_LABELS.get(
                        event.event_type,
                        event.event_type,
                    ),
                    ", ".join(model_names) or "—",
                    _event_detail(event, names),
                ]
            )

    return rows


async def search_rows(_: Request) -> list[list]:
    with Session(engine) as db:
        events = db.scalars(
            select(AnalyticsEvent)
            .where(AnalyticsEvent.event_type == "search_performed")
            .order_by(AnalyticsEvent.created_at.desc())
            .limit(20000)
        ).all()

    counts = Counter()

    for event in events:
        query = (event.filters or {}).get("query")
        if query:
            counts[str(query).strip()] += 1

    return [[query, count] for query, count in counts.most_common(25)]


async def filter_rows(_: Request) -> list[list]:
    with Session(engine) as db:
        events = db.scalars(
            select(AnalyticsEvent)
            .where(AnalyticsEvent.event_type == "filter_applied")
            .order_by(AnalyticsEvent.created_at.desc())
            .limit(20000)
        ).all()

    counts = Counter()

    for event in events:
        for part in _filter_parts(event.filters):
            counts[part] += 1

    return [[value, count] for value, count in counts.most_common(30)]


async def sort_rows(_: Request) -> list[list]:
    with Session(engine) as db:
        events = db.scalars(
            select(AnalyticsEvent)
            .where(AnalyticsEvent.event_type == "sort_changed")
            .order_by(AnalyticsEvent.created_at.desc())
            .limit(20000)
        ).all()

    counts = Counter()

    for event in events:
        field = (event.sort or {}).get("field")
        if field:
            counts[SORT_LABELS.get(field, field)] += 1

    return [[field, count] for field, count in counts.most_common()]


async def build_user_dashboard(_: Request) -> ColumnWidget:
    return ColumnWidget(
        children=[
            HtmlWidget(
                html="""
                <div class="alert alert-info">
                    <strong>Kullanıcı davranışı özeti</strong><br>
                    Kullanıcıların hangi modelleri incelediğini,
                    karşılaştırdığını, aradığını ve talep ettiğini
                    buradan takip edebilirsiniz.
                </div>
                """
            ),
            CardRowWidget(
                children=[
                    StatWidget(
                        title="Toplam Oturum",
                        value_callback=total_sessions,
                        description="Takip edilen farklı oturum",
                        countup=True,
                    ),
                    StatWidget(
                        title="Son 24 Saat Etkileşim",
                        value_callback=events_24h,
                        description="Kaydedilen kullanıcı aksiyonu",
                        countup=True,
                    ),
                    StatWidget(
                        title="Son 24 Saat Model Görüntüleme",
                        value_callback=views_24h,
                        description="Model detay ilgisi",
                        countup=True,
                    ),
                    StatWidget(
                        title="Son 24 Saat LLMaaS Talebi",
                        value_callback=requests_24h,
                        description="Model talep gönderimi",
                        countup=True,
                    ),
                ]
            ),
            ChartWidget(
                title="Son 24 Saat Etkileşim Dağılımı",
                chart_type="bar",
                series_callback=event_series,
                height=300,
                options={
                    "xaxis": {
                        "categories": [
                            EVENT_LABELS[key]
                            for key in EVENT_ORDER
                        ]
                    }
                },
            ),
            TableWidget(
                title="En Çok İlgi Gören Modeller",
                columns=[
                    "Model",
                    "Görüntüleme",
                    "Karşılaştırma",
                    "LLMaaS Talebi",
                    "Oturum",
                    "Toplam İlgi",
                ],
                rows_callback=top_model_rows,
            ),
            TableWidget(
                title="Son Oturumlar",
                columns=[
                    "Oturum ID",
                    "Son Aktivite",
                    "İşlem",
                    "Görüntüleme",
                    "Karşılaştırma",
                    "Arama",
                    "Filtre",
                    "LLMaaS",
                    "En Çok İlgilendiği Model",
                ],
                rows_callback=session_rows,
            ),
            TableWidget(
                title="Son Kullanıcı Hareketleri",
                columns=[
                    "Saat",
                    "Oturum",
                    "İşlem",
                    "Model",
                    "Detay",
                ],
                rows_callback=recent_activity_rows,
            ),
        ]
    )


async def build_sessions_page(_: Request) -> ColumnWidget:
    return ColumnWidget(
        children=[
            HtmlWidget(
                html="""
                <div class="alert alert-secondary">
                    Her satır bir kullanıcı oturumunu temsil eder.
                    “En Çok İlgilendiği Model”, görüntüleme,
                    karşılaştırma ve talep hareketlerinden hesaplanır.
                </div>
                """
            ),
            TableWidget(
                title="Kullanıcı Oturumları",
                columns=[
                    "Oturum ID",
                    "Son Aktivite",
                    "Toplam İşlem",
                    "Görüntüleme",
                    "Karşılaştırma",
                    "Arama",
                    "Filtre",
                    "LLMaaS",
                    "En Çok İlgilendiği Model",
                ],
                rows_callback=session_rows,
            ),
        ]
    )


async def build_model_interest_page(_: Request) -> ColumnWidget:
    return ColumnWidget(
        children=[
            TableWidget(
                title="Model İlgi Sıralaması",
                columns=[
                    "Model",
                    "Görüntüleme",
                    "Karşılaştırma",
                    "LLMaaS Talebi",
                    "İlgilenen Oturum",
                    "Toplam İlgi",
                ],
                rows_callback=top_model_rows,
            )
        ]
    )


async def build_discovery_page(_: Request) -> ColumnWidget:
    return ColumnWidget(
        children=[
            TableWidget(
                title="En Çok Arananlar",
                columns=["Arama", "Adet"],
                rows_callback=search_rows,
            ),
            TableWidget(
                title="En Çok Kullanılan Filtreler",
                columns=["Filtre", "Adet"],
                rows_callback=filter_rows,
            ),
            TableWidget(
                title="En Çok Kullanılan Sıralamalar",
                columns=["Sıralama", "Adet"],
                rows_callback=sort_rows,
            ),
        ]
    )


async def build_session_inspector(request: Request) -> ColumnWidget:
    raw_session = request.query_params.get("session", "").strip()
    safe_value = escape(raw_session)

    children = [
        HtmlWidget(
            html=f"""
                <div class="card mb-3">
                  <div class="card-body">
                    <h3 class="card-title">Oturum İncele</h3>
                    <form method="get">
                      <div class="input-group">
                        <input
                          class="form-control"
                          type="text"
                          name="session"
                          value="{safe_value}"
                          placeholder="Oturum ID'sini buraya yapıştırın"
                        >
                        <button class="btn btn-primary" type="submit">
                          İncele
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
            """
        )
    ]

    if not raw_session:
        children.append(
            HtmlWidget(
                html="""
                    <div class="alert alert-info">
                        Oturumlar ekranından bir Session ID alın ve
                        yukarıdaki alana yapıştırın.
                    </div>
                """
            )
        )
        return ColumnWidget(children=children)

    session_uuid = _uuid(raw_session)

    if session_uuid is None:
        children.append(
            HtmlWidget(
                html='<div class="alert alert-danger">Geçersiz oturum ID.</div>'
            )
        )
        return ColumnWidget(children=children)

    async def timeline_rows(_: Request) -> list[list]:
        with Session(engine) as db:
            events = db.scalars(
                select(AnalyticsEvent)
                .where(AnalyticsEvent.session_id == session_uuid)
                .order_by(AnalyticsEvent.created_at.asc())
            ).all()

            ids = {
                model_id
                for event in events
                for model_id in _event_model_ids(event)
            }

            names = _model_name_map(db, ids)

            rows = []

            for event in events:
                model_names = [
                    names.get(model_id, model_id)
                    for model_id in _event_model_ids(event)
                ]

                rows.append(
                    [
                        _fmt_time(event.created_at),
                        EVENT_LABELS.get(
                            event.event_type,
                            event.event_type,
                        ),
                        ", ".join(model_names) or "—",
                        _event_detail(event, names),
                        event.page or "—",
                    ]
                )

            return rows

    children.append(
        TableWidget(
            title=f"Oturum Akışı — {str(session_uuid)[:8]}",
            columns=[
                "Saat",
                "İşlem",
                "Model / Modeller",
                "Detay",
                "Sayfa",
            ],
            rows_callback=timeline_rows,
        )
    )

    return ColumnWidget(children=children)
