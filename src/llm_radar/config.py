from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: str = "postgresql+psycopg://llm_radar:llm_radar@localhost:5433/llm_radar"
    kafka_bootstrap_servers: str = "localhost:19092"
    minio_endpoint: str = "http://localhost:9000"
    minio_access_key: str = "llm-radar"
    minio_secret_key: str = "change-me-in-production"
    minio_bucket: str = "llm-radar-raw"
    redis_url: str = "redis://localhost:6380/0"
    clickhouse_url: str = "http://localhost:8123"
    clickhouse_database: str = "llm_radar"
    artificial_analysis_api_key: str | None = None
    groq_api_key: str | None = None
    replicate_api_token: str | None = None
    nanogpt_api_key: str | None = None
    together_api_key: str | None = None
    fireworks_api_key: str | None = None
    cloudflare_account_id: str | None = None
    cloudflare_api_token: str | None = None
    github_token: str | None = None
    huggingface_token: str | None = None
    hf_org_limit: int = 50
    hf_task_limit: int = 30
    admin_api_token: str | None = None
    smtp_url: str | None = None
    telegram_bot_token: str | None = None
    slack_webhook_url: str | None = None
    collector_interval_seconds: int = 21_600
    benchmark_interval_seconds: int = 43_200
    source_stale_after_hours: int = 30
    api_allowed_origins: str = "http://localhost:3000,http://localhost:5173"
    api_allowed_hosts: str = "localhost,127.0.0.1"

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.app_env == "production":
            if self.minio_secret_key == "change-me-in-production":
                raise ValueError("MINIO_SECRET_KEY must be changed in production")
            if not self.admin_api_token:
                raise ValueError("ADMIN_API_TOKEN must be set in production")
            if "localhost" in self.api_allowed_origins:
                raise ValueError("API_ALLOWED_ORIGINS must use the deployed web origin")
            if "localhost" in self.api_allowed_hosts:
                raise ValueError("API_ALLOWED_HOSTS must use the deployed API hostname")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


def source_is_configured(slug: str, settings: Settings | None = None) -> bool:
    current = settings or get_settings()
    credentials = {
        "artificial-analysis": current.artificial_analysis_api_key,
        "groqcloud": current.groq_api_key,
        "replicate": current.replicate_api_token,
        "together": current.together_api_key,
    }
    return slug not in credentials or bool(credentials[slug])
