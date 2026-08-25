import hashlib
import json
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from llm_radar.database.models import DedupRecord, ProcessedEvent


def canonical_hash(payload: Any) -> str:
    encoded = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), default=str, ensure_ascii=False
    )
    return hashlib.sha256(encoded.encode()).hexdigest()


def is_processed(session: Session, event_id: UUID) -> bool:
    return session.get(ProcessedEvent, event_id) is not None


def seen_fingerprint(session: Session, kind: str, value: str) -> DedupRecord | None:
    return session.scalar(
        select(DedupRecord).where(DedupRecord.kind == kind, DedupRecord.value == value)
    )


def remember_fingerprint(session: Session, kind: str, value: str, event_id: UUID) -> DedupRecord:
    existing = seen_fingerprint(session, kind, value)
    if existing is not None:
        return existing
    record = DedupRecord(kind=kind, value=value, event_id=event_id)
    session.add(record)
    return record


def duplicate_reasons(session: Session, event_id: UUID, fingerprints: dict[str, str]) -> list[str]:
    reasons: list[str] = []
    if is_processed(session, event_id):
        reasons.append("event_id")
    for kind, value in fingerprints.items():
        if value and seen_fingerprint(session, kind, value) is not None:
            reasons.append(kind)
    return reasons
