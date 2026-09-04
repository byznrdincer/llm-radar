"""Make DATABASE_URL follow LLM_RADAR_INTEGRATION_DATABASE_URL for this
directory, before any test module here gets collected (and so before
anything can import llm_radar.database.session, whose engine binds to
DATABASE_URL at that module's first import). Without this, whichever
integration test happens to be collected first decides - for every test in
the run - whether SessionLocal-based code (outbox_worker.publish_batch) talks
to the real test database or to the unreachable .env default.
"""

import os

_integration_url = os.getenv("LLM_RADAR_INTEGRATION_DATABASE_URL")
if _integration_url:
    os.environ.setdefault("DATABASE_URL", _integration_url)
