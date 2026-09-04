import pytest
from pydantic import ValidationError

from llm_radar.config import Settings

_VALID_PRODUCTION_KWARGS: dict[str, object] = {
    "app_env": "production",
    "database_url": "postgresql+psycopg://prod_user:s3cret@db.internal:5432/llm_radar",
    "redis_url": "redis://:s3cret@redis.internal:6379/0",
    "kafka_bootstrap_servers": "kafka.internal:9092",
    "minio_endpoint": "https://minio.internal",
    "minio_access_key": "prod-access-key",
    "minio_secret_key": "a-real-secret",
    "admin_api_token": "a-real-token",
    "api_allowed_origins": "https://llmradar.example.com",
    "api_allowed_hosts": "api.llmradar.example.com",
}


def test_valid_production_settings_pass() -> None:
    Settings(**_VALID_PRODUCTION_KWARGS)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "override",
    [
        {"database_url": "postgresql+psycopg://llm_radar:llm_radar@db.internal:5432/llm_radar"},
        {"database_url": "postgresql+psycopg://prod_user:s3cret@localhost:5432/llm_radar"},
        {"redis_url": "redis://localhost:6380/0"},
        {"redis_url": "redis://:s3cret@localhost:6379/0"},
        {"kafka_bootstrap_servers": "localhost:19092"},
        {"minio_access_key": "llm-radar"},
        {"minio_endpoint": "http://localhost:9000"},
        {"minio_secret_key": "change-me-in-production"},
        {"admin_api_token": None},
        {"api_allowed_origins": "http://localhost:3000"},
        {"api_allowed_hosts": "localhost,127.0.0.1"},
    ],
)
def test_dev_default_left_in_place_is_rejected_in_production(override: dict[str, object]) -> None:
    kwargs = {**_VALID_PRODUCTION_KWARGS, **override}
    with pytest.raises(ValidationError):
        Settings(**kwargs)  # type: ignore[arg-type]


def test_dev_defaults_are_fine_outside_production() -> None:
    Settings(app_env="development")
