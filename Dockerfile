FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY pyproject.toml README.md alembic.ini ./
COPY src ./src
COPY migrations ./migrations
COPY docker/entrypoint.sh /entrypoint.sh
RUN pip install --no-cache-dir . && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "llm_radar.api.main:app", "--host", "0.0.0.0", "--port", "8080"]
