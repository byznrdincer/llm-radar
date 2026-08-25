"""MinIO object archive and Redis helpers with safe fallbacks."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

from llm_radar.config import get_settings

logger = logging.getLogger(__name__)


def archive_json(prefix: str, payload: Any) -> str | None:
    settings = get_settings()
    key = f"{prefix}/{datetime.now(UTC).strftime('%Y/%m/%d')}/{uuid4()}.json"
    body = json.dumps(payload, default=str, ensure_ascii=False).encode()
    try:
        from minio import Minio

        parsed = urlparse(settings.minio_endpoint)
        client = Minio(
            parsed.netloc or parsed.path,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=parsed.scheme == "https",
        )
        if not client.bucket_exists(settings.minio_bucket):
            client.make_bucket(settings.minio_bucket)
        from io import BytesIO

        client.put_object(
            settings.minio_bucket,
            key,
            BytesIO(body),
            length=len(body),
            content_type="application/json",
        )
        return key
    except Exception:
        logger.warning("raw archive skipped for %s", key, exc_info=True)
        return None


def cache_get(key: str) -> str | None:
    try:
        import redis

        client = redis.Redis.from_url(get_settings().redis_url)
        value = client.get(key)
        return value.decode() if value else None
    except Exception:
        return None


def cache_set(key: str, value: str, ttl_seconds: int = 3600) -> None:
    try:
        import redis

        client = redis.Redis.from_url(get_settings().redis_url)
        client.setex(key, ttl_seconds, value)
    except Exception:
        return
