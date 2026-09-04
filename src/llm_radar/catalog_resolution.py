"""Match a benchmark or leaderboard row back to a catalog model.

Leaderboards publish free-text model names and organization strings that rarely
equal the catalog's own slug or company name, and agent benchmarks publish
configurations like ``SWE-agent + Claude-4.5-Sonnet``. These helpers resolve
those to a single catalog ``Model`` - or refuse to guess when the evidence is
ambiguous - and derive a leaderboard row's license from the matched model.

Both whole-catalog indexes are cached for 300s: leaderboard, market and radar
responses rebuild them otherwise, and the catalog only shifts on the multi-hour
collector cadence. Kept out of the API module so insights and the read model can
share it without importing FastAPI.
"""

from __future__ import annotations

import re
import time
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from llm_radar.composite import canonical_model_name
from llm_radar.database.models import Company, Model, ModelProfile
from llm_radar.openness import (
    _catalog_model_license,
    _known_family_license,
    _meaningful_license,
)

_LicenseIndex = dict[str, list[tuple[Model, ModelProfile | None, str]]]
_LICENSE_INDEX_TTL_SECONDS = 300.0
_license_index_cache: tuple[float, _LicenseIndex] | None = None

_CATALOG_RESOLUTION_TTL_SECONDS = 300.0
_catalog_resolution_cache: dict[tuple[str, str], tuple[float, UUID | None]] = {}


def _leaderboard_license_index(session: Session) -> _LicenseIndex:
    """Canonical-name -> catalog rows index. Cached: every leaderboard, market and
    radar response rebuilds it otherwise, and the catalog only shifts on the
    multi-hour collector cadence. Profiles are eager-loaded so the cached rows
    stay usable after their build session closes."""
    global _license_index_cache
    now = time.time()
    cached = _license_index_cache
    if cached is not None and now - cached[0] < _LICENSE_INDEX_TTL_SECONDS:
        return cached[1]

    index: dict[str, list[tuple[Model, ModelProfile | None, str]]] = {}
    rows = session.execute(
        select(Model, Company.name)
        .options(joinedload(Model.profile))
        .join(Company, Company.id == Model.company_id)
    )
    for model, company_name in rows:
        key = canonical_model_name(model.name)
        if key:
            index.setdefault(key, []).append((model, model.profile, company_name))
    _license_index_cache = (now, index)
    return index


def _scoped_catalog_candidates(
    model_name: str,
    organization: str,
    catalog_index: dict[str, list[tuple[Model, ModelProfile | None, str]]],
) -> list[tuple[Model, ModelProfile | None, str]]:
    """Narrow same-canonical-name candidates to a single confirmed company.

    A canonical model name alone is not a safe match: distinct companies can
    share one (e.g. a GGUF re-upload under "Ollama" vs. the original creator).
    When the organization string doesn't confirm a company and more than one
    distinct company shares the name, we refuse to guess rather than silently
    attributing the row to the wrong one.
    """
    candidates = list(catalog_index.get(canonical_model_name(model_name), []))
    if not candidates:
        return candidates
    if organization:
        organization_key = canonical_model_name(organization)
        scoped = [
            candidate
            for candidate in candidates
            if canonical_model_name(candidate[2]) == organization_key
        ]
        if scoped:
            return scoped
    distinct_companies = {canonical_model_name(candidate[2]) for candidate in candidates}
    return candidates if len(distinct_companies) == 1 else []


def _catalog_model_name_candidates(model_name: str) -> list[str]:
    """Return likely base-model names for benchmark configurations.

    Agent benchmarks often publish a configuration such as
    ``SWE-agent + Claude-4.5-Sonnet`` instead of a bare catalog model name.
    The right-most component is the primary model in these records, while the
    full value is retained as a final fallback for genuine compound names.
    """
    parts = [part.strip() for part in re.split(r"\s+\+\s+", model_name) if part.strip()]
    ordered = [*reversed(parts), model_name.strip()] if len(parts) > 1 else parts
    candidates: list[str] = []
    seen: set[str] = set()
    for candidate in ordered:
        key = canonical_model_name(candidate)
        if not key or key in seen:
            continue
        seen.add(key)
        candidates.append(candidate)
    return candidates


def _resolve_catalog_model(
    session: Session,
    model_name: str,
    organization: str,
    catalog_index: dict[str, list[tuple[Model, ModelProfile | None, str]]],
) -> Model | None:
    candidate_names = _catalog_model_name_candidates(model_name)
    for candidate_name in candidate_names:
        candidates = _scoped_catalog_candidates(candidate_name, organization, catalog_index)
        if candidates:
            return candidates[0][0]

    # DB fallback (exact slug, then organization-confirmed fuzzy search). Cached
    # across requests keyed on its inputs: every leaderboard response re-resolves
    # the same long-tail names, most of which never match, and the catalog only
    # shifts on the multi-hour collector cadence.
    lookup_name = candidate_names[0] if candidate_names else model_name
    normalized_name = lookup_name.strip().lower().replace("_", "-")
    cache_key = (normalized_name, organization.strip().lower())
    now = time.time()
    cached = _catalog_resolution_cache.get(cache_key)
    if cached is not None and now - cached[0] < _CATALOG_RESOLUTION_TTL_SECONDS:
        if cached[1] is None:
            return None
        return session.get(Model, cached[1], options=[joinedload(Model.profile)])

    resolved = _resolve_catalog_model_via_search(
        session, lookup_name, normalized_name, organization
    )
    _catalog_resolution_cache[cache_key] = (now, resolved.id if resolved is not None else None)
    return resolved


def _resolve_catalog_model_via_search(
    session: Session,
    lookup_name: str,
    normalized_name: str,
    organization: str,
) -> Model | None:
    slug_match = session.scalar(
        select(Model)
        .options(joinedload(Model.profile))
        .join(Company, Company.id == Model.company_id)
        .where(
            or_(
                func.lower(Model.slug) == normalized_name,
                func.lower(Model.slug).like(f"%/{normalized_name}"),
            )
        )
    )
    if slug_match is not None:
        return slug_match

    search_rows = list(
        session.execute(
            select(Model, Company)
            .options(joinedload(Model.profile))
            .join(Company, Company.id == Model.company_id)
            .where(
                Model.slug.ilike(f"%{normalized_name}%")
                | Model.name.ilike(f"%{lookup_name.replace('-', '%')}%")
            )
            .limit(25)
        ).all()
    )
    if not search_rows:
        return None

    # Fuzzy ILIKE search casts a wide net, so an organization match is
    # required before trusting a result: an unconfirmed or ambiguous match
    # here would silently attach the row to the wrong catalog model.
    organization_key = canonical_model_name(organization) if organization else ""
    organization_slug = organization.strip().lower()
    if not organization_key and not organization_slug:
        return None
    matched_ids: set[UUID] = set()
    matched_model: Model | None = None
    for model, company in search_rows:
        if (organization_key and canonical_model_name(company.name) == organization_key) or (
            organization_slug and company.slug.lower() == organization_slug
        ):
            if model.id not in matched_ids:
                matched_ids.add(model.id)
                matched_model = model
    return matched_model if len(matched_ids) == 1 else None


def _resolve_leaderboard_license(
    *,
    raw_license: str | None,
    model_name: str,
    organization: str,
    catalog_index: dict[str, list[tuple[Model, ModelProfile | None, str]]],
) -> tuple[str, str]:
    explicit = _meaningful_license(raw_license)
    if explicit:
        return explicit, "benchmark"

    candidates: list[tuple[Model, ModelProfile | None, str]] = []
    for candidate_name in _catalog_model_name_candidates(model_name):
        candidates = _scoped_catalog_candidates(candidate_name, organization, catalog_index)
        if candidates:
            break
    organization_key = canonical_model_name(organization)
    same_company = [
        candidate
        for candidate in candidates
        if canonical_model_name(candidate[2]) == organization_key
    ]
    if same_company:
        candidates = same_company
    catalog_licenses = {
        license_name
        for model, profile, _company_name in candidates
        if (license_name := _catalog_model_license(model, profile)) is not None
    }
    catalog_classes = {
        "closed" if license_name.lower() == "proprietary" else "open"
        for license_name in catalog_licenses
    }
    if len(catalog_classes) == 1:
        if "closed" in catalog_classes:
            return "Proprietary", "catalog_profile"
        return sorted(catalog_licenses)[0], "catalog_profile"

    family_license = _known_family_license(model_name, organization)
    if family_license:
        return family_license, "verified_family"
    return "Unknown", "unresolved"
