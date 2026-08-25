# LLM Radar

LLM Radar; model sürümleri, fiyatlar, yetenekler, benchmark sonuçları, açık
ağırlıklar, araştırma ve teknoloji sinyallerini kaynaklarıyla birlikte izleyen
olay güdümlü bir LLM intelligence platformudur.

## Yerel kurulum

```bash
docker compose up --build
```

İsteğe bağlı olarak `.env.example` dosyasını `.env` adıyla kopyalayın.

- API: http://localhost:8080
- API dokümantasyonu: http://localhost:8080/docs
- Web paneli: http://localhost:3000
- Redpanda Console: http://localhost:8081
- MinIO Console: http://localhost:9001
- ClickHouse: http://localhost:8123
- Prometheus/Grafana: `docker compose --profile observability up`

## İlk veri akışı

```bash
python -m llm_radar.events.admin
python -m llm_radar.bootstrap
python -m llm_radar.collectors.run_openrouter
```

Processor `llm.raw_updates` topic'indeki event'leri PostgreSQL'e işler.
Ham cevaplar MinIO'ya arşivlenir; değişiklikler SSE ve bildirim tablosuna düşer.

## Mimari

Kaynaklar → Collector (retry, hash, arşiv) → Redpanda → Processor
(normalizasyon, eşleştirme, dedup, doğrulama, değişiklik tespiti) →
PostgreSQL / ClickHouse / MinIO → FastAPI → Panel / SSE / Bildirimler

## Geliştirme

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
pytest
ruff check .
```

Ayrıntılı mimari ve katalog: `docs/architecture.md`.
