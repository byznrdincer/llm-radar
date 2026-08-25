#!/bin/sh
set -e
python - <<'PY'
from sqlalchemy import create_engine, text

from llm_radar.config import get_settings

engine = create_engine(get_settings().database_url)
with engine.begin() as conn:
    conn.execute(text("SELECT pg_advisory_lock(8123001)"))
    try:
        from alembic import command
        from alembic.config import Config

        command.upgrade(Config("alembic.ini"), "head")
    finally:
        conn.execute(text("SELECT pg_advisory_unlock(8123001)"))
PY
python -m llm_radar.bootstrap || true
exec "$@"
