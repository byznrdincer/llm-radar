from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from llm_radar.config import get_settings

engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)


def get_db():  # type: ignore[no-untyped-def]
    with SessionLocal() as session:
        yield session
