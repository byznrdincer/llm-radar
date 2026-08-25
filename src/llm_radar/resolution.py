from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from llm_radar.composite import canonical_model_name
from llm_radar.database.models import EntityAlias


@dataclass(frozen=True)
class Resolution:
    canonical_key: str
    method: str
    confidence: str
    needs_review: bool = False


def _exact_alias(session: Session, key: str) -> EntityAlias | None:
    return session.scalar(select(EntityAlias).where(EntityAlias.alias_key == key))


def resolve_entity_key(
    session: Session | None, raw_key: str, display_name: str | None = None
) -> Resolution:
    lowered = raw_key.strip()
    if session is not None:
        alias = _exact_alias(session, lowered.lower())
        if alias is not None:
            return Resolution(
                alias.canonical_key, "alias", alias.confidence, needs_review=not alias.approved
            )

    if "/" in lowered:
        return Resolution(lowered.lower(), "provider_id", "high")

    normalized = canonical_model_name(display_name or lowered)
    if not normalized:
        return Resolution(lowered.lower(), "raw", "low", needs_review=True)
    return Resolution(normalized, "normalized_name", "medium")


def remember_alias(
    session: Session,
    canonical_key: str,
    alias_key: str,
    method: str = "manual",
    *,
    approved: bool = True,
) -> EntityAlias:
    existing = _exact_alias(session, alias_key.lower())
    if existing is not None:
        existing.canonical_key = canonical_key
        existing.method = method
        existing.approved = approved
        return existing
    alias = EntityAlias(
        canonical_key=canonical_key,
        alias_key=alias_key.lower(),
        method=method,
        confidence="exact" if approved else "candidate",
        approved=approved,
    )
    session.add(alias)
    return alias
