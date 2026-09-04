import json
import logging
import re
from dataclasses import asdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from llm_radar.canonical_pipeline import (
    link_cross_source_models,
    merge_runtime_capabilities,
    observation_fingerprints,
)
from llm_radar.catalog import EVENT_BY_TYPE
from llm_radar.company_domains import company_website_url
from llm_radar.composite import canonical_model_name
from llm_radar.database.models import (
    BenchmarkDefinition,
    ChangeEvent,
    Claim,
    Company,
    FieldObservation,
    LeaderboardSnapshot,
    Model,
    ModelSnapshot,
    OutboxEvent,
    PriceObservation,
    ProcessedEvent,
    ResearchPaper,
    Source,
    TechnologySignal,
)
from llm_radar.event_intelligence import classify_event, score_importance
from llm_radar.events.schemas import EventEnvelope, EventType
from llm_radar.events.topics import PROCESSED_EVENTS, TOPIC_BY_EVENT_TYPE
from llm_radar.model_family import infer_model_family
from llm_radar.normalize import company_display_name, normalize_company_name
from llm_radar.notifications import dispatch_notifications
from llm_radar.pipeline import canonical_hash, duplicate_reasons, remember_fingerprint
from llm_radar.processor.change_detector import detect_changes
from llm_radar.profile_service import (
    propagate_availability_evidence,
    propagate_open_weight_evidence,
    upsert_model_profile,
)
from llm_radar.resolution import resolve_entity_key

logger = logging.getLogger(__name__)

_ANNOUNCEMENT_EVENT_TYPES = {
    EventType.COMPANY_ANNOUNCEMENT.value,
    EventType.GITHUB_RELEASE_PUBLISHED.value,
    EventType.AI_AGENT_UPDATED.value,
    EventType.PRODUCT_LAUNCHED.value,
    EventType.FUNDING_ANNOUNCED.value,
    EventType.ACQUISITION_ANNOUNCED.value,
    EventType.PARTNERSHIP_ANNOUNCED.value,
    EventType.INFRASTRUCTURE_UPDATED.value,
    EventType.REGULATION_UPDATED.value,
    EventType.SECURITY_ADVISORY.value,
    EventType.API_UPDATED.value,
}
_ANNOUNCEMENT_CHANGE_TYPES = _ANNOUNCEMENT_EVENT_TYPES | {EventType.MODEL_RELEASED.value}
_TITLE_STOPWORDS = {
    "about",
    "announces",
    "from",
    "into",
    "launches",
    "new",
    "the",
    "with",
    "icin",
    "için",
    "ve",
    "yeni",
}


def _decimal(value: Any) -> Decimal | None:
    return Decimal(str(value)) if value not in (None, "") else None


def _price_decimal(value: Any) -> Decimal | None:
    amount = _decimal(value)
    return amount if amount is None or amount >= 0 else None


def _positive_int(value: Any) -> int | None:
    """Parse source-supplied parameter counts without guessing from model names."""
    if value in (None, "") or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, float):
        parsed = int(value)
        return parsed if parsed > 0 else None
    normalized = str(value).strip().lower().replace(",", "").replace("_", "")
    match = re.fullmatch(r"(\d+(?:\.\d+)?)\s*([kmbt])?", normalized)
    if match is None:
        return None
    multipliers = {None: 1, "k": 1_000, "m": 1_000_000, "b": 1_000_000_000, "t": 1_000_000_000_000}
    parsed = int(Decimal(match.group(1)) * multipliers[match.group(2)])
    return parsed if parsed > 0 else None


def _release_date(value: Any) -> date | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError:
        return None


def _match_profile_model(session: Session, model_name: str) -> Model | None:
    canonical = canonical_model_name(model_name)
    if not canonical:
        return None
    candidates = [
        model
        for model in session.scalars(select(Model))
        if ":" not in model.slug and canonical_model_name(model.name) == canonical
    ]
    return candidates[0] if len(candidates) == 1 else None


def _company_slug(entity_key: str) -> str:
    return normalize_company_name(entity_key.split("/", 1)[0])


def _upsert_source(session: Session, event: EventEnvelope) -> Source:
    source = session.scalar(
        select(Source).where((Source.slug == event.source) | (Source.name == event.source))
    )
    if source is None:
        source = Source(
            name=event.source,
            slug=event.source,
            url=str(event.metadata.source_url),
            source_type="api",
            reliability_level=event.metadata.reliability.value,
        )
        session.add(source)
        session.flush()
    if not source.slug:
        source.slug = event.source
    source.last_checked_at = event.collected_at
    source.last_success_at = event.collected_at
    source.status = "active"
    source.last_error = None
    source.consecutive_failures = 0
    return source


def _record_observation(
    session: Session,
    *,
    entity_type: str,
    entity_id: Any,
    field_name: str,
    value: Any,
    previous: Any,
    source: Source,
    event: EventEnvelope,
) -> None:
    session.execute(
        update(FieldObservation)
        .where(
            FieldObservation.entity_type == entity_type,
            FieldObservation.entity_id == entity_id,
            FieldObservation.field_name == field_name,
            FieldObservation.is_current.is_(True),
        )
        .values(is_current=False)
    )
    session.add(
        FieldObservation(
            entity_type=entity_type,
            entity_id=entity_id,
            field_name=field_name,
            value={"value": value},
            valid_from=event.occurred_at,
            collected_at=event.collected_at,
            source_id=source.id,
            reliability=event.metadata.reliability.value,
            verification_status=event.metadata.verification_status.value,
            extraction_method=event.metadata.extraction_method,
            previous_value={"value": previous} if previous is not None else None,
            is_current=True,
        )
    )


def _change_event(
    *,
    event: EventEnvelope,
    source: Source,
    entity_type: str,
    entity_id: Any,
    title: str,
    old_value: dict[str, Any] | None = None,
    new_value: dict[str, Any] | None = None,
    change_percentage: Decimal | None = None,
    event_type: str | None = None,
) -> ChangeEvent:
    kind = event_type or event.event_type.value
    payload = {
        "change_percentage": str(change_percentage) if change_percentage is not None else None,
        "new_value": new_value or {},
        "rank": (new_value or {}).get("rank"),
    }
    importance = score_importance(
        kind,
        payload,
        title=title,
        reliability=event.metadata.reliability.value,
        verification_status=event.metadata.verification_status.value,
    )
    return ChangeEvent(
        event_type=kind,
        category=classify_event(kind, title, event.payload),
        entity_type=entity_type,
        entity_id=entity_id,
        title=title[:240],
        old_value=old_value,
        new_value=new_value,
        change_percentage=change_percentage,
        importance=importance.level,
        importance_score=importance.score,
        importance_factors=importance.factors,
        confidence=event.metadata.verification_status.value,
        verification_status=event.metadata.verification_status.value,
        evidence={
            "source": event.source,
            "source_url": str(event.metadata.source_url),
            "reliability": event.metadata.reliability.value,
            "collected_at": event.collected_at.isoformat(),
            "raw_object_key": event.metadata.raw_object_key,
            "sources": [
                {
                    "source_id": str(source.id),
                    "source": event.source,
                    "source_url": str(event.metadata.source_url),
                    "reliability": event.metadata.reliability.value,
                    "collected_at": event.collected_at.isoformat(),
                }
            ],
        },
        source_id=source.id,
        detected_at=event.collected_at,
    )


def event_title_similarity(left: str, right: str) -> float:
    """Return a conservative token Jaccard score for cross-source headlines."""

    def tokenize(value: str) -> set[str]:
        return {
            token
            for token in re.findall(r"[a-z0-9çğıöşü]+", value.lower())
            if len(token) >= 3 and token not in _TITLE_STOPWORDS
        }

    left_tokens = tokenize(left)
    right_tokens = tokenize(right)
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def _corroborate_change(existing: ChangeEvent, event: EventEnvelope, source: Source) -> None:
    evidence = dict(existing.evidence or {})
    sources = list(evidence.get("sources") or [])
    if not sources and evidence.get("source"):
        sources.append(
            {
                "source_id": str(existing.source_id),
                "source": evidence.get("source"),
                "source_url": evidence.get("source_url"),
                "reliability": evidence.get("reliability"),
                "collected_at": evidence.get("collected_at"),
            }
        )
    if all(item.get("source_id") != str(source.id) for item in sources):
        sources.append(
            {
                "source_id": str(source.id),
                "source": event.source,
                "source_url": str(event.metadata.source_url),
                "reliability": event.metadata.reliability.value,
                "collected_at": event.collected_at.isoformat(),
            }
        )
    evidence["sources"] = sources
    evidence["corroboration_count"] = len({item.get("source_id") for item in sources})
    existing.evidence = evidence
    existing.verification_status = "corroborated"
    existing.confidence = "corroborated"
    result = score_importance(
        existing.event_type,
        {
            "new_value": existing.new_value or {},
            "change_percentage": existing.change_percentage,
        },
        title=existing.title,
        reliability=str(evidence.get("reliability") or event.metadata.reliability.value),
        verification_status="corroborated",
    )
    existing.importance = result.level
    existing.importance_score = result.score
    existing.importance_factors = result.factors


def _handle_leaderboard(
    session: Session, event: EventEnvelope, source: Source
) -> list[ChangeEvent]:
    payload = event.payload
    benchmark_slug = str(payload["benchmark_slug"])
    benchmark = session.scalar(
        select(BenchmarkDefinition).where(BenchmarkDefinition.slug == benchmark_slug)
    )
    if benchmark is None:
        benchmark = BenchmarkDefinition(
            source_id=source.id,
            slug=benchmark_slug,
            name=str(payload["benchmark_name"]),
            category=str(payload["category"]),
            methodology_url=str(event.metadata.source_url),
        )
        session.add(benchmark)
        session.flush()
    published_at = date.fromisoformat(str(payload["leaderboard_publish_date"]))
    existing_snapshot = session.scalar(
        select(LeaderboardSnapshot).where(
            LeaderboardSnapshot.benchmark_id == benchmark.id,
            LeaderboardSnapshot.model_external_id == payload["model_name"],
            LeaderboardSnapshot.category == payload["category"],
            LeaderboardSnapshot.published_at == published_at,
        )
    )
    previous_leaderboard = session.scalar(
        select(LeaderboardSnapshot)
        .where(
            LeaderboardSnapshot.benchmark_id == benchmark.id,
            LeaderboardSnapshot.model_external_id == payload["model_name"],
            LeaderboardSnapshot.category == payload["category"],
            LeaderboardSnapshot.published_at < published_at,
        )
        .order_by(LeaderboardSnapshot.published_at.desc())
        .limit(1)
    )
    changes: list[ChangeEvent] = []
    open_weights = payload.get("open_weights")
    proprietary_claim = (
        source.name != "artificial-analysis"
        and str(payload.get("license") or "").lower() == "proprietary"
    )
    if isinstance(open_weights, bool) or proprietary_claim:
        model_slug = payload.get("model_slug")
        model = (
            session.scalar(select(Model).where(Model.slug == str(model_slug).lower()))
            if model_slug
            else None
        ) or _match_profile_model(session, str(payload.get("model_name") or ""))
        if model is not None:
            availability = "open_weight" if open_weights is True else "proprietary"
            availability_payload = {
                "availability": availability,
                "is_open_weight": availability == "open_weight",
                "availability_evidence": {
                    "kind": "leaderboard_license_assertion",
                    "source_url": str(event.metadata.source_url),
                    "open_weights": open_weights,
                    "license": payload.get("license"),
                },
            }
            if payload.get("license"):
                availability_payload["license"] = payload["license"]
            upsert_model_profile(
                session,
                model=model,
                source_id=source.id,
                observed_at=event.collected_at,
                payload=availability_payload,
            )
            propagate_availability_evidence(
                session,
                model=model,
                source_id=source.id,
                observed_at=event.collected_at,
                payload=availability_payload,
            )
    if existing_snapshot is None:
        snapshot = LeaderboardSnapshot(
            benchmark_id=benchmark.id,
            source_id=source.id,
            model_external_id=str(payload["model_name"]),
            organization=str(payload["organization"]),
            license=payload.get("license"),
            category=str(payload["category"]),
            rank=int(payload["rank"]),
            score=_decimal(payload["rating"]) or Decimal("0"),
            score_lower=_decimal(payload.get("rating_lower")),
            score_upper=_decimal(payload.get("rating_upper")),
            vote_count=int(payload["vote_count"]) if payload.get("vote_count") else None,
            published_at=published_at,
            observed_at=event.collected_at,
            raw_data=payload,
        )
        session.add(snapshot)
        session.flush()
        if previous_leaderboard is not None and previous_leaderboard.rank != snapshot.rank:
            changes.append(
                _change_event(
                    event=event,
                    source=source,
                    entity_type="leaderboard_entry",
                    entity_id=snapshot.id,
                    title=f"{snapshot.model_external_id}: Arena rank changed",
                    old_value={"rank": previous_leaderboard.rank},
                    new_value={"rank": snapshot.rank},
                    event_type=EventType.LEADERBOARD_CHANGED.value,
                )
            )
    return changes


def _handle_research(session: Session, event: EventEnvelope, source: Source) -> list[ChangeEvent]:
    payload = event.payload
    external_id = str(payload.get("arxiv_id") or event.entity_key)
    paper = session.scalar(select(ResearchPaper).where(ResearchPaper.external_id == external_id))
    if paper is not None:
        return []
    published = None
    raw_date = str(payload.get("published_at") or "")[:10]
    if raw_date:
        try:
            published = date.fromisoformat(raw_date)
        except ValueError:
            published = None
    paper = ResearchPaper(
        external_id=external_id,
        title=str(payload.get("title") or external_id)[:500],
        authors=payload.get("authors") or [],
        abstract=payload.get("abstract"),
        published_at=published,
        url=str(payload.get("url") or event.metadata.source_url),
        categories=payload.get("categories") or [],
        source_id=source.id,
        observed_at=event.collected_at,
    )
    session.add(paper)
    session.flush()
    return [
        _change_event(
            event=event,
            source=source,
            entity_type="paper",
            entity_id=paper.id,
            title=paper.title,
            new_value=payload,
        )
    ]


def _handle_technology(session: Session, event: EventEnvelope, source: Source) -> list[ChangeEvent]:
    slug = str(event.payload.get("signal") or event.entity_key)
    signal = session.scalar(select(TechnologySignal).where(TechnologySignal.slug == slug))
    if signal is None:
        signal = TechnologySignal(
            slug=slug,
            name=slug.replace("_", " ").title(),
            category=slug,
            first_seen_at=event.collected_at,
            last_seen_at=event.collected_at,
            evidence=event.payload,
            source_id=source.id,
            strength="medium",
        )
        session.add(signal)
        session.flush()
        return [
            _change_event(
                event=event,
                source=source,
                entity_type="technology",
                entity_id=signal.id,
                title=f"Teknoloji sinyali: {signal.name}",
                new_value=event.payload,
            )
        ]
    signal.last_seen_at = event.collected_at
    signal.evidence = event.payload
    return []


def _handle_announcement(
    session: Session, event: EventEnvelope, source: Source
) -> list[ChangeEvent]:
    entity_id = uuid5(NAMESPACE_URL, event.entity_key)
    title = str(event.payload.get("title") or event.payload.get("name") or event.entity_key)
    category = classify_event(
        event.event_type.value,
        title,
        event.payload,
    )
    stored_event_type = (
        EventType.MODEL_RELEASED.value
        if category == "model_release"
        else event.event_type.value
    )
    existing = session.scalar(
        select(ChangeEvent).where(
            ChangeEvent.entity_id == entity_id,
            ChangeEvent.title == title[:240],
        )
    )
    if existing is not None:
        if existing.source_id != source.id:
            _corroborate_change(existing, event, source)
        return []
    cutoff = event.collected_at - timedelta(days=7)
    candidates = session.scalars(
        select(ChangeEvent)
        .where(
            ChangeEvent.event_type.in_(_ANNOUNCEMENT_CHANGE_TYPES),
            ChangeEvent.category == category,
            ChangeEvent.detected_at >= cutoff,
        )
        .order_by(ChangeEvent.detected_at.desc())
        .limit(200)
    ).all()
    corroborating = next(
        (
            candidate
            for candidate in candidates
            if candidate.source_id != source.id
            and event_title_similarity(candidate.title, title) >= 0.6
        ),
        None,
    )
    if corroborating is not None:
        _corroborate_change(corroborating, event, source)
        return []
    event_spec = EVENT_BY_TYPE.get(stored_event_type)
    return [
        _change_event(
            event=event,
            source=source,
            entity_type=event_spec.entity_type if event_spec is not None else "company",
            entity_id=entity_id,
            title=title,
            new_value=event.payload,
            event_type=stored_event_type,
        )
    ]


def _handle_model(session: Session, event: EventEnvelope, source: Source) -> list[ChangeEvent]:
    resolution = resolve_entity_key(
        session, event.entity_key, str(event.payload.get("name") or event.entity_key)
    )
    company_slug = _company_slug(event.entity_key)
    company = session.scalar(select(Company).where(Company.slug == company_slug))
    if company is None:
        company = Company(
            name=company_display_name(company_slug),
            slug=company_slug,
            website_url=company_website_url(company_slug),
        )
        session.add(company)
        session.flush()
    elif not company.website_url:
        company.website_url = company_website_url(company_slug)

    model = session.scalar(select(Model).where(Model.slug == event.entity_key)) or session.scalar(
        select(Model).where(Model.slug == resolution.canonical_key)
    )
    is_new = model is None
    payload = event.payload
    if model is None:
        model = Model(
            company_id=company.id,
            name=str(payload.get("name") or event.entity_key),
            slug=event.entity_key,
            family=infer_model_family(
                str(payload.get("name") or event.entity_key), event.entity_key
            ),
            context_window=payload.get("context_window"),
            release_date=_release_date(payload.get("release_date")),
            parameter_count=_positive_int(payload.get("parameter_count")),
            active_parameter_count=_positive_int(payload.get("active_parameter_count")),
            license=payload.get("license"),
            is_open_weight=payload.get("is_open_weight"),
            status=str(payload.get("status") or "active"),
            capabilities={
                "input_modalities": payload.get("input_modalities", []),
                "output_modalities": payload.get("output_modalities", []),
            },
        )
        session.add(model)
        session.flush()
        merged_into = link_cross_source_models(
            session,
            model,
            entity_key=event.entity_key,
            display_name=str(payload.get("name") or event.entity_key),
            is_new=True,
        )
        if merged_into is not None:
            # The new row denoted an existing canonical model; keep the
            # canonical one and treat this as an update, not a discovery.
            model = merged_into
            is_new = False
    if model.company_id != company.id:
        # Provider aliases such as OpenRouter's ``~openai`` belong to the
        # canonical company and must never create a separate filter option.
        model.company_id = company.id
    if not model.family:
        model.family = infer_model_family(model.name, model.slug)

    previous_model = session.scalar(
        select(ModelSnapshot)
        .where(ModelSnapshot.model_id == model.id)
        .order_by(ModelSnapshot.observed_at.desc())
        .limit(1)
    )
    digest = canonical_hash(payload)
    changes: list[ChangeEvent] = []

    if previous_model is None or previous_model.content_hash != digest:
        profile, normalized, profile_accepted = upsert_model_profile(
            session,
            model=model,
            source_id=source.id,
            observed_at=event.collected_at,
            payload=payload,
        )
        propagate_open_weight_evidence(
            session,
            model=model,
            source_id=source.id,
            observed_at=event.collected_at,
            payload=payload,
        )
        if is_new:
            changes.append(
                _change_event(
                    event=event,
                    source=source,
                    entity_type="model",
                    entity_id=model.id,
                    title=f"{model.name} discovered",
                    new_value=payload,
                    event_type=EventType.MODEL_RELEASED.value,
                )
            )
        elif previous_model is not None:
            for change in detect_changes(previous_model.data, payload):
                changes.append(
                    _change_event(
                        event=event,
                        source=source,
                        entity_type="model",
                        entity_id=model.id,
                        title=f"{model.name}: {change.field} changed",
                        old_value={change.field: change.old_value},
                        new_value={change.field: change.new_value},
                        change_percentage=change.percentage,
                        event_type=change.event_type.value,
                    )
                )
                _record_observation(
                    session,
                    entity_type="model",
                    entity_id=model.id,
                    field_name=change.field,
                    value=change.new_value,
                    previous=change.old_value,
                    source=source,
                    event=event,
                )

        model.name = str(payload.get("name") or model.name)
        if parsed_release_date := _release_date(payload.get("release_date")):
            model.release_date = parsed_release_date
        if parsed_parameter_count := _positive_int(payload.get("parameter_count")):
            model.parameter_count = parsed_parameter_count
        if parsed_active_parameter_count := _positive_int(
            payload.get("active_parameter_count")
        ):
            model.active_parameter_count = parsed_active_parameter_count
        if profile_accepted and payload.get("is_open_weight") is not None:
            model.is_open_weight = payload.get("is_open_weight")
        if payload.get("status"):
            model.status = str(payload.get("status"))
        model.capabilities = {
            "input_modalities": payload.get(
                "input_modalities", model.capabilities.get("input_modalities", [])
            ),
            "output_modalities": payload.get(
                "output_modalities", model.capabilities.get("output_modalities", [])
            ),
            "runtime": merge_runtime_capabilities(
                model.capabilities.get("runtime"), payload
            ),
        }
        _record_observation(
            session,
            entity_type="model",
            entity_id=model.id,
            field_name="normalized_profile",
            value=json.loads(json.dumps(asdict(normalized), default=str)),
            previous=None,
            source=source,
            event=event,
        )
        session.add(
            ModelSnapshot(
                model_id=model.id,
                source_id=source.id,
                data=payload,
                content_hash=digest,
                observed_at=event.collected_at,
            )
        )
        pricing = payload.get("pricing") or {}
        if pricing:
            session.add(
                PriceObservation(
                    model_id=model.id,
                    source_id=source.id,
                    provider=event.source,
                    input_price=_price_decimal(pricing.get("input_per_1m_tokens")),
                    output_price=_price_decimal(pricing.get("output_per_1m_tokens")),
                    cache_read_price=_price_decimal(pricing.get("cache_read_per_1m_tokens")),
                    cache_write_price=_price_decimal(pricing.get("cache_write_per_1m_tokens")),
                    currency=pricing.get("currency", "USD"),
                    observed_at=event.collected_at,
                )
            )
        session.add(
            Claim(
                entity_type="model",
                entity_id=model.id,
                field_name="snapshot",
                value=payload,
                source_id=source.id,
                asserted_at=event.occurred_at,
                collected_at=event.collected_at,
                reliability=event.metadata.reliability.value,
                verification_status=event.metadata.verification_status.value,
                extraction_method=event.metadata.extraction_method,
                evidence={"source_url": str(event.metadata.source_url)},
            )
        )
        session.add_all(changes)
    return changes


def process_event(session: Session, event: EventEnvelope) -> list[ChangeEvent]:
    fingerprints = {
        "event_id": str(event.event_id),
        "entity_type_date": canonical_hash(
            {
                "entity": event.entity_key,
                "type": event.event_type.value,
                "day": event.occurred_at.date().isoformat(),
            }
        ),
        **observation_fingerprints(event.event_id, event.payload),
    }
    reasons = duplicate_reasons(session, event.event_id, fingerprints)
    if "event_id" in reasons or (
        "content_hash" in reasons and event.event_type.value not in _ANNOUNCEMENT_EVENT_TYPES
    ):
        return []

    source = _upsert_source(session, event)
    handlers = {
        EventType.LEADERBOARD_CHANGED: _handle_leaderboard,
        EventType.RESEARCH_PUBLISHED: _handle_research,
        EventType.TECHNOLOGY_DETECTED: _handle_technology,
        EventType.COMPANY_ANNOUNCEMENT: _handle_announcement,
        EventType.GITHUB_RELEASE_PUBLISHED: _handle_announcement,
        EventType.BENCHMARK_UPDATED: _handle_announcement,
        EventType.MARKET_SHARE_CHANGED: _handle_announcement,
        EventType.AI_AGENT_UPDATED: _handle_announcement,
        EventType.PRODUCT_LAUNCHED: _handle_announcement,
        EventType.FUNDING_ANNOUNCED: _handle_announcement,
        EventType.ACQUISITION_ANNOUNCED: _handle_announcement,
        EventType.PARTNERSHIP_ANNOUNCED: _handle_announcement,
        EventType.INFRASTRUCTURE_UPDATED: _handle_announcement,
        EventType.REGULATION_UPDATED: _handle_announcement,
        EventType.SECURITY_ADVISORY: _handle_announcement,
        EventType.API_UPDATED: _handle_announcement,
    }
    handler = handlers.get(event.event_type, _handle_model)
    if event.event_type == EventType.HUGGINGFACE_UPDATED:
        handler = _handle_model
    changes = handler(session, event, source)
    for kind, value in fingerprints.items():
        remember_fingerprint(session, kind, value, event.event_id)
    session.add(ProcessedEvent(event_id=event.event_id, source=event.source))
    if changes:
        session.add_all(changes)
        session.flush()
        dispatch_notifications(session, changes)
        for change in changes:
            session.add(
                OutboxEvent(
                    topic=TOPIC_BY_EVENT_TYPE.get(change.event_type, PROCESSED_EVENTS),
                    event_key=str(change.entity_id),
                    payload={
                        "event_id": str(change.id),
                        "event_type": change.event_type,
                        "entity_type": change.entity_type,
                        "entity_id": str(change.entity_id),
                        "old_value": change.old_value,
                        "new_value": change.new_value,
                        "importance": change.importance,
                        "source_id": str(change.source_id),
                        "detected_at": change.detected_at.isoformat(),
                    },
                )
            )
    session.add(
        OutboxEvent(
            topic=PROCESSED_EVENTS,
            event_key=event.entity_key,
            payload=json.loads(event.model_dump_json()),
        )
    )
    session.commit()
    return changes
