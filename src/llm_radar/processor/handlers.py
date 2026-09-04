"""Per-event-type handlers. process_event dispatches to these."""

import json
import logging
from dataclasses import asdict
from datetime import date, timedelta
from decimal import Decimal
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select
from sqlalchemy.orm import Session

from llm_radar.canonical_pipeline import (
    link_cross_source_models,
    merge_runtime_capabilities,
)
from llm_radar.catalog import EVENT_BY_TYPE
from llm_radar.company_domains import company_website_url
from llm_radar.database.models import (
    BenchmarkDefinition,
    ChangeEvent,
    Claim,
    Company,
    LeaderboardSnapshot,
    Model,
    ModelSnapshot,
    PriceObservation,
    ResearchPaper,
    Source,
    TechnologySignal,
)
from llm_radar.event_intelligence import classify_event
from llm_radar.events.schemas import EventEnvelope, EventType
from llm_radar.model_family import infer_model_family
from llm_radar.normalize import company_display_name
from llm_radar.pipeline import canonical_hash
from llm_radar.processor.change_detector import detect_changes
from llm_radar.processor.common import (
    _ANNOUNCEMENT_CHANGE_TYPES,
    _change_event,
    _corroborate_change,
    _match_profile_model,
    _record_observation,
)
from llm_radar.processor.parsing import (
    _company_slug,
    _decimal,
    _positive_int,
    _price_decimal,
    _release_date,
    event_title_similarity,
)
from llm_radar.profile_service import (
    propagate_availability_evidence,
    propagate_open_weight_evidence,
    upsert_model_profile,
)
from llm_radar.read_model import refresh_model_read_fields
from llm_radar.resolution import resolve_entity_key

logger = logging.getLogger(__name__)


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
            refresh_model_read_fields(session, model.id)
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
            company=company,
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
        # Keep the openness/level filters in sync with this model's own change
        # immediately, rather than waiting for the periodic read-model sweep.
        refresh_model_read_fields(session, model.id)
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


