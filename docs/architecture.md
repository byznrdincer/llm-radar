# LLM Radar architecture

```
Sources → Collectors → llm.raw_updates → Processor
  → entity resolution / dedup / verification / change detection
  → domain topics + PostgreSQL + MinIO
  → FastAPI → web panel / SSE / notifications
```

## Event types and default importance

See `GET /api/v1/catalog/events`. Critical overrides: price move ≥ 50%,
category leader change, model deprecation.

## Source catalog

See `GET /api/v1/catalog/sources`. Official labs, Hugging Face, GitHub, arXiv,
benchmarks and OpenRouter are seeded on API boot.

## Ranking policy

Cross-benchmark composites are not silently mixed. Category rankings use only
compatible benchmark slugs. Price-performance (`/api/v1/comparisons/value`)
omits missing metrics instead of inventing them.

## Completeness path

1. Collector fetches a source and archives the raw payload.
2. Events are published to Redpanda with a content hash and source URL.
3. Processor normalizes, resolves aliases, drops duplicates, stores claims.
4. Meaningful field diffs become change events with old/new values and evidence.
5. API serves models, leaderboards, research, technology radar and notifications.
6. The panel updates over SSE; in-app (and optional Slack/Telegram/email) notices follow user rules.
