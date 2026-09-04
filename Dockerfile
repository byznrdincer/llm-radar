FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DEFAULT_TIMEOUT=300 \
    PIP_RETRIES=5
WORKDIR /app

COPY pyproject.toml README.md alembic.ini ./
COPY src ./src
COPY migrations ./migrations
COPY docker/entrypoint.sh /entrypoint.sh
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install . && chmod +x /entrypoint.sh

RUN useradd --system --uid 1000 --create-home appuser \
    && chown -R appuser:appuser /app
USER appuser

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "llm_radar.api.main:app", "--host", "0.0.0.0", "--port", "8080"]
