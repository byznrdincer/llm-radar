"""link_cross_source_models's company-confirmation guard, rolled back after
each test. Set LLM_RADAR_INTEGRATION_DATABASE_URL to run.
"""

import os
from collections.abc import Iterator
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from llm_radar.canonical_pipeline import link_cross_source_models
from llm_radar.database.models import Company, EntityAlias, Model

DATABASE_URL = os.getenv("LLM_RADAR_INTEGRATION_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="LLM_RADAR_INTEGRATION_DATABASE_URL was not provided"
)


@pytest.fixture
def session() -> Iterator[Session]:
    engine = create_engine(DATABASE_URL)  # type: ignore[arg-type]
    db = Session(engine)
    try:
        yield db
    finally:
        db.rollback()
        db.close()


def _row_count(db: Session, model_cls: type, **filters: object) -> int:
    query = select(func.count()).select_from(model_cls)
    for name, value in filters.items():
        query = query.where(getattr(model_cls, name) == value)
    return db.scalar(query) or 0


def test_ambiguous_company_is_not_auto_merged(session: Session) -> None:
    company_a = Company(id=uuid4(), name="ZZ Vendor A", slug="zztest-vendor-a")
    company_b = Company(id=uuid4(), name="ZZ Vendor B", slug="zztest-vendor-b")
    session.add_all([company_a, company_b])
    session.flush()

    existing = Model(
        id=uuid4(), company_id=company_a.id, name="ZZ Shared Name",
        slug="zztest-vendor-a/zz-shared-name", status="active", capabilities={},
    )
    new_row = Model(
        id=uuid4(), company_id=company_b.id, name="ZZ Shared Name",
        slug="zztest-vendor-b/zz-shared-name", status="active", capabilities={},
    )
    session.add_all([existing, new_row])
    session.flush()

    merged_into = link_cross_source_models(
        session,
        new_row,
        entity_key="zztest-vendor-b/zz-shared-name",
        display_name="ZZ Shared Name",
        is_new=True,
        company=company_b,
    )

    assert merged_into is None
    # Neither row was deleted or repointed.
    assert _row_count(session, Model, id=existing.id) == 1
    assert _row_count(session, Model, id=new_row.id) == 1
    alias = session.scalar(
        select(EntityAlias).where(EntityAlias.alias_key == "zztest-vendor-b/zz-shared-name")
    )
    assert alias is not None
    assert alias.approved is False
    assert alias.method == "canonical_name_unconfirmed"
    assert alias.canonical_key == existing.slug


def test_confirmed_company_still_auto_merges(session: Session) -> None:
    company = Company(id=uuid4(), name="ZZ Vendor C", slug="zztest-vendor-c")
    session.add(company)
    session.flush()

    existing = Model(
        id=uuid4(), company_id=company.id, name="ZZ Confirmed Name",
        slug="zztest-vendor-c/zz-confirmed-name", status="active", capabilities={},
    )
    new_row = Model(
        id=uuid4(), company_id=company.id, name="ZZ Confirmed Name",
        slug="provider/zz-confirmed-name", status="active", capabilities={},
    )
    session.add_all([existing, new_row])
    session.flush()

    merged_into = link_cross_source_models(
        session,
        new_row,
        entity_key="provider/zz-confirmed-name",
        display_name="ZZ Confirmed Name",
        is_new=True,
        company=company,
    )

    assert merged_into is not None
    assert merged_into.id == existing.id
    assert _row_count(session, Model, id=new_row.id) == 0


def test_unknown_company_is_not_auto_merged(session: Session) -> None:
    """No company passed at all (caller doesn't know it) is treated the same
    as an unconfirmed match, not as a free pass to merge."""
    company_a = Company(id=uuid4(), name="ZZ Vendor D", slug="zztest-vendor-d")
    session.add(company_a)
    session.flush()

    existing = Model(
        id=uuid4(), company_id=company_a.id, name="ZZ Unknown Caller Name",
        slug="zztest-vendor-d/zz-unknown-caller-name", status="active", capabilities={},
    )
    new_row = Model(
        id=uuid4(), company_id=company_a.id, name="ZZ Unknown Caller Name",
        slug="other/zz-unknown-caller-name", status="active", capabilities={},
    )
    session.add_all([existing, new_row])
    session.flush()

    merged_into = link_cross_source_models(
        session,
        new_row,
        entity_key="other/zz-unknown-caller-name",
        display_name="ZZ Unknown Caller Name",
        is_new=True,
        company=None,
    )

    assert merged_into is None
    assert _row_count(session, Model, id=existing.id) == 1
    assert _row_count(session, Model, id=new_row.id) == 1
