from sqlalchemy import select
from sqlalchemy.orm import Session

from llm_radar.catalog import SOURCE_CATALOG
from llm_radar.database.models import Source
from llm_radar.database.session import SessionLocal


def upsert_sources(session: Session) -> int:
    count = 0
    for spec in SOURCE_CATALOG:
        source = session.scalar(select(Source).where(Source.slug == spec.slug))
        if source is None:
            source = session.scalar(select(Source).where(Source.name == spec.slug))
        if source is None:
            source = Source(
                name=spec.slug,
                slug=spec.slug,
                url=spec.url,
                source_type=spec.collection_method.value,
                reliability_level=spec.reliability,
            )
            session.add(source)
            count += 1
        source.name = spec.slug
        source.slug = spec.slug
        source.url = spec.url
        source.source_type = spec.collection_method.value
        source.category = spec.category.value
        source.source_class = spec.source_class.value
        source.collection_method = spec.collection_method.value
        source.reliability_level = spec.reliability
        source.check_interval_seconds = spec.check_interval_seconds
        source.rate_limit_per_minute = spec.rate_limit_per_minute
        source.auth_type = spec.auth_type
        source.terms_url = spec.terms_url
        source.is_active = spec.is_active
    session.commit()
    return count


def seed() -> int:
    with SessionLocal() as session:
        return upsert_sources(session)


if __name__ == "__main__":
    created = seed()
    print(f"Source catalog upserted ({created} new rows)")
