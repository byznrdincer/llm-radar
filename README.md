# LLM Radar

LLM Radar; büyük dil modellerini, sürümleri, fiyatları, yetenekleri, benchmark
sonuçlarını, araştırmaları ve teknoloji sinyallerini kaynaklarıyla izleyen olay
güdümlü bir yapay zekâ istihbarat platformudur.

Temel ilke: farklı benchmark sonuçları bilimsel dayanağı olmayan tek bir puanda
birleştirilmez. Her kaynak kendi ölçüm protokolü ve kategorileri içinde sunulur;
eksik veri uydurulmaz ve sonuçlar kaynak/yayın bilgisiyle saklanır.

## İçindekiler

- [Özellikler](#özellikler)
- [Mimari](#mimari)
- [Veri akışı](#veri-akışı)
- [Kullanılan teknolojiler](#kullanılan-teknolojiler)
- [Veri kaynakları](#veri-kaynakları)
- [Proje yapısı](#proje-yapısı)
- [Docker ile çalıştırma](#docker-ile-çalıştırma)
- [Docker kullanmadan geliştirme](#docker-kullanmadan-geliştirme)
- [Yapılandırma](#yapılandırma)
- [Veri toplama](#veri-toplama)
- [API](#api)
- [Test, operasyon ve güvenlik](#test-operasyon-ve-güvenlik)
- [Sorun giderme](#sorun-giderme)

## Özellikler

- Model, sağlayıcı, aile, sürüm, context, modalite ve fiyat takibi
- Resmî/akademik/bağımsız benchmarkları ayrı kategorilerde gösterme
- Yeni model, fiyat, context, yetenek, lisans ve sıralama değişikliği algılama
- OpenRouter, Vercel AI Gateway, AI/ML API, LiteLLM, NanoGPT, GroqCloud,
  Replicate, Hugging Face, GitHub, arXiv, RSS ve laboratuvar sayfalarını toplama
- Alias ve entity-resolution ile model adlarını kanonik kayıtlara bağlama
- Ham cevapları MinIO üzerinde denetlenebilir biçimde arşivleme
- Redpanda üzerinde olay tabanlı, idempotent ve tekrar işlenebilir veri akışı
- PostgreSQL üzerinde güncel durum, geçmiş snapshot, claim ve bildirim saklama
- Redis üzerinde önbellek ve yazma uçları için fail-open hız sınırlama
- Server-Sent Events (SSE) ile web paneline canlı güncelleme (PostgreSQL'i periyodik yoklar)
- Kaynak sağlığı, collector çalışması, gecikme ve dead-letter takibi
- Slack, Telegram ve e-posta bildirim ayarları (şu an yalnızca log'a yazar; gönderim planlanıyor)
- ClickHouse tabanlı analitik depo (planlanıyor; kod henüz bağlı değil)
- Prometheus metrikleri, Grafana profili ve otomatik PostgreSQL yedeği

## Mimari

```mermaid
flowchart LR
    S["Dış kaynaklar<br/>API • JSON • RSS • HTML"] --> C["Collectors<br/>retry • hash • raw archive"]
    C --> M["MinIO<br/>ham kaynak arşivi"]
    C --> K["Redpanda<br/>llm.raw_updates"]
    K --> P["Processor<br/>normalize • resolve • dedup • verify"]
    P --> D["Değişiklik tespiti<br/>old/new • önem • kanıt"]
    D --> PG["PostgreSQL<br/>operasyonel/geçmiş veri"]
    D --> T["Alan topic'leri<br/>alerts • dead letter"]
    PG --> API["FastAPI<br/>REST • SSE • metrics"]
    R["Redis<br/>önbellek • hız sınırlama"] --- API
    API --> W["React web paneli"]
    API --> N["Bildirimler<br/>(şu an log)"]
    D -.-> CH["ClickHouse<br/>(planlanan analitik depo)"]
    CH -.-> API
```

> ClickHouse ve toplu bildirim gönderimi diyagramda kesik çizgiyle gösterilir:
> altyapı `docker-compose` içinde hazır ama uygulama kodu henüz bağlanmadı.

| Bileşen | Sorumluluk |
| --- | --- |
| Collector | Kaynağı çeker, retry uygular, içeriği hash'ler, arşivler ve standart event üretir. |
| Redpanda | Collector ile processor arasındaki Kafka uyumlu olay omurgasıdır. |
| Processor | Event'i doğrular, normalize eder, alias çözer, tekrarları eler ve değişiklik çıkarır. |
| PostgreSQL | Modelleri, fiyatları, benchmark snapshot'larını, claim'leri, araştırmaları ve bildirimleri saklar. |
| MinIO | Kaynaklardan alınan ham belge ve cevapları saklar. |
| ClickHouse | Zaman serisi/analitik sorgular için planlanır; `docker-compose` içinde vardır ama uygulama henüz yazmaz/okumaz. |
| Redis | `storage.py` üzerinden önbellek yardımcıları ve yazma uçlarında fail-open hız sınırlama sağlar. |
| FastAPI | REST, OpenAPI, SSE, sistem sağlığı ve Prometheus metriklerini sunar. |
| Web | Sıralama, katalog, karşılaştırma, araştırma ve teknoloji akışını gösterir. |
| Scheduler | Collector'ları belirlenen aralıklarla otomatik çalıştırır. |

## Veri akışı

1. Scheduler zamanı gelen collector'ı çalıştırır.
2. Collector API/JSON/RSS/HTML verisini indirir.
3. Cevap içerik hash'i ve kaynak metadatasıyla MinIO'ya arşivlenir.
4. Standart event `llm.raw_updates` topic'ine yayımlanır.
5. Processor event kimliğiyle idempotency kontrolü yapar.
6. Model adı normalize edilir ve bilinen alias kanonik modele bağlanır.
7. Yeni veri önceki snapshot ile karşılaştırılır.
8. Anlamlı değişiklikler alan tablolarına ve `change_events` tablosuna yazılır.
9. Sonuç ilgili topic'e, gerekiyorsa alert veya dead-letter akışına iletilir.
10. FastAPI veriyi REST/SSE üzerinden web paneline sunar.

Başlıca topic'ler: `llm.raw_updates`, `llm.model_releases`,
`llm.model_updates`, `llm.price_changes`, `llm.benchmark_updates`,
`llm.leaderboard_changes`, `llm.company_news`, `llm.research_papers`,
`llm.open_weight_releases`, `llm.github_updates`, `llm.alerts` ve
`llm.dead_letter`.

## Kullanılan teknolojiler

### Backend ve veri

- Python 3.11+ (Docker'da Python 3.12)
- FastAPI, Uvicorn, Pydantic ve pydantic-settings
- SQLAlchemy 2, Alembic, PostgreSQL 16 ve psycopg 3
- Redpanda 25 ve confluent-kafka
- MinIO, Redis 7 ve ClickHouse 24.8
- HTTPX, Tenacity ve Selectolax
- Prometheus Client

### Web

- React 19, React DOM ve TypeScript 5
- Vinext, Vite ve Cloudflare Vite eklentisi
- Tailwind CSS 4 altyapısı ve proje CSS tasarım sistemi
- Wrangler
- Drizzle ORM / Drizzle Kit altyapısı
- ESLint ve Node.js test runner
- Node.js 22+

### Operasyon

- Docker Compose
- Prometheus ve Grafana
- PostgreSQL `pg_dump` yedekleri
- OpenAPI / Swagger UI
- Server-Sent Events

## Veri kaynakları

### Model, araştırma ve teknoloji

- **OpenRouter:** model kataloğu, sağlayıcı, context, modalite ve fiyat
- **Vercel AI Gateway:** model, context, modalite, yetenek ve gateway fiyatı
- **AI/ML API:** model geliştiricisi, context, çıktı limiti ve API özellikleri
- **LiteLLM:** doğrudan geliştirici katalogları için ikincil fiyat/yetenek doğrulaması
- **NanoGPT:** model, context, yetenek ve sağlayıcı fiyatı
- **GroqCloud:** Groq üzerinde aktif model, context ve çıktı limiti (anahtar gerekir)
- **Replicate:** barındırılan model, sürüm ve açık ağırlık kanıtı (anahtar gerekir)
- **Hugging Face:** model ve açık ağırlık sinyalleri
- **GitHub:** sürümler ve teknoloji projeleri
- **arXiv:** araştırma makaleleri
- **Resmî RSS/HTML kaynakları:** şirket duyuruları ve yeni teknolojiler

Gateway API'leri görsel, video, ses ve embedding modelleri de sunsa bile bu
collector'lar yalnızca LLM/text-chat kayıtlarını kataloğa alır. Multimodal bir
LLM'in görsel veya dosya girdisi ise model özelliği olarak korunur.

### Benchmarklar

| Kaynak | Ölçüm |
| --- | --- |
| Arena | İnsan tercihi ve Arena Rating |
| SWE-bench Verified | Gerçek GitHub sorunlarında agent çözüm oranı |
| SWE-bench Live | Güncel/çok dilli görevler; Lite, Full, Verified ve dil bölümleri |
| LiveBench | Genel, reasoning, matematik, kodlama, veri analizi, yazma, talimat ve agentic kodlama |
| MMLU-Pro | Genel sonuç ve 14 akademik alan |
| LiveCodeBench | Kontaminasyon filtresiyle kod üretimi Pass@1 |
| τ-bench | Havayolu, perakende, telekom ve bankacılıkta araç kullanımı Pass@1 |
| Artificial Analysis | Kaynağın zekâ, kodlama ve agentic endeksleri; anahtar gerektirir |

> Skorlar yalnızca onları üreten benchmark protokolü içinde değerlendirilir;
> kaynaklar arasında bilimsel temeli olmayan gizli bileşik puan hesaplanmaz.

## Proje yapısı

```text
llm-radar/
├── src/llm_radar/
│   ├── api/              # REST, SSE, admin ve sistem endpoint'leri
│   ├── collectors/       # Kaynak ve benchmark collector'ları
│   ├── database/         # SQLAlchemy modelleri ve oturum yönetimi
│   ├── events/           # Event şemaları, topic'ler ve producer
│   ├── processor/        # Normalizasyon, dedup ve değişiklik işleme
│   ├── bootstrap.py      # Başlangıç kaynak kataloğu
│   ├── catalog.py        # Kaynak/event/ranking katalogları
│   ├── resolution.py     # Model adı ve alias eşleştirme
│   ├── ranking.py        # Uyumlu kategori sıralama politikaları
│   ├── notifications.py  # Bildirim üretimi
│   └── storage.py        # Ham veri arşivleme
├── migrations/           # Alembic migration'ları
├── tests/                # Backend testleri
├── web/
│   ├── app/              # React arayüzü ve stiller
│   ├── tests/            # Render testleri
│   └── worker/           # Web runtime giriş noktası
├── observability/        # Prometheus yapılandırması
├── docker/               # Konteyner entrypoint'i
├── docs/                 # Mimari doküman ve görseller
├── docker-compose.yml
├── Dockerfile
├── pyproject.toml
└── .env.example
```

## Docker ile çalıştırma

### Gereksinimler

- Docker Desktop veya Docker Engine + Compose
- En az 6 GB kullanılabilir RAM önerilir
- İlk kurulumda internet bağlantısı

### Kurulum

```bash
git clone https://github.com/byznrdincer/llm-radar.git
cd llm-radar
cp .env.example .env
docker compose up -d --build
```

`/admin` paneli geliştirmede `admin` / `change-me` ile açılır. Üretimde
`LLM_RADAR_ADMIN_USERNAME`, `LLM_RADAR_ADMIN_PASSWORD` ve
`LLM_RADAR_ADMIN_SECRET_KEY` ortam değişkenleri (ör. `.env` içinde) zorunludur;
`APP_ENV=production` ile bunlar ayarlanmazsa API açılmaz. Docker dışında yerel
çalıştırmada `cp .admin.env.example .admin.env` de aynı işi görür.

Yerel geliştirmede varsayılan `.env` değerleri çalışır. Artificial Analysis
isteniyorsa `ARTIFICIAL_ANALYSIS_API_KEY` doldurulmalıdır. GitHub ve Hugging
Face token'ları zorunlu değildir fakat rate limitlerini iyileştirir.

İlk başlangıçta entrypoint PostgreSQL migration'larını uygular ve kaynak
kataloğunu seed eder. API, processor, scheduler ve web servisi sonrasında açılır.

### Kontrol ve adresler

```bash
docker compose ps
docker compose logs -f api processor scheduler web
```

| Servis | Adres |
| --- | --- |
| Web | http://localhost:3000 |
| API | http://localhost:8080 |
| Swagger / OpenAPI | http://localhost:8080/docs |
| API health | http://localhost:8080/health |
| Redpanda Console | http://localhost:8081 |
| MinIO API / Console | http://localhost:9000 / http://localhost:9001 |
| ClickHouse HTTP | http://localhost:8123 |

Gözlemleme profili:

```bash
docker compose --profile observability up -d prometheus grafana
```

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001
- API metrikleri: http://localhost:8080/metrics

Durdurma:

```bash
docker compose down
```

> `docker compose down -v` tüm volume'ları ve yerel veriyi siler. Yalnızca
> bilinçli bir tam sıfırlama için kullanılmalıdır.

## Docker kullanmadan geliştirme

### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
```

Host makinede `.env` bağlantıları:

```env
DATABASE_URL=postgresql+psycopg://llm_radar:llm_radar@localhost:5433/llm_radar
KAFKA_BOOTSTRAP_SERVERS=localhost:19092
MINIO_ENDPOINT=http://localhost:9000
REDIS_URL=redis://localhost:6380/0
CLICKHOUSE_URL=http://localhost:8123
```

Altyapıyı ve şemayı hazırlayın:

```bash
docker compose up -d postgres redpanda redpanda-console minio redis clickhouse
alembic upgrade head
python -m llm_radar.events.admin
python -m llm_radar.bootstrap
```

Üç terminalde API, processor ve scheduler'ı çalıştırın:

```bash
uvicorn llm_radar.api.main:app --reload --host 0.0.0.0 --port 8080
python -m llm_radar.processor.consumer
python -m llm_radar.collectors.scheduler
```

### Web

```bash
cd web
npm ci
npm run dev -- --host 0.0.0.0
```

Farklı API adresi için:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8080 npm run dev -- --host 0.0.0.0
```

## Yapılandırma

| Değişken | Açıklama | Varsayılan / gereklilik |
| --- | --- | --- |
| `APP_ENV` | Çalışma ortamı | `development` |
| `DATABASE_URL` | PostgreSQL bağlantısı | Ortama göre ayarlanır |
| `KAFKA_BOOTSTRAP_SERVERS` | Redpanda/Kafka bağlantısı | Docker'da `redpanda:9092` |
| `MINIO_ENDPOINT` | Ham veri deposu | Docker'da `http://minio:9000` |
| `MINIO_ACCESS_KEY` | MinIO kullanıcı adı | Yerelde `llm-radar` |
| `MINIO_SECRET_KEY` | MinIO parolası | Üretimde değiştirilmeli |
| `MINIO_BUCKET` | Ham veri bucket'ı | `llm-radar-raw` |
| `REDIS_URL` | Redis bağlantısı | Docker'da `redis://redis:6379/0` |
| `CLICKHOUSE_URL` | ClickHouse adresi | Docker'da `http://clickhouse:8123` |
| `ARTIFICIAL_ANALYSIS_API_KEY` | AA collector anahtarı | İsteğe bağlı |
| `GROQ_API_KEY` | GroqCloud model kataloğu | İsteğe bağlı; verilirse collector açılır |
| `REPLICATE_API_TOKEN` | Replicate model kataloğu | İsteğe bağlı; verilirse collector açılır |
| `NANOGPT_API_KEY` | Hesaba özel NanoGPT görünürlüğü/fiyatı | İsteğe bağlı |
| `TOGETHER_API_KEY` | Together AI açık model kataloğu ve fiyatları | İsteğe bağlı; verilirse collector açılır |
| `FIREWORKS_API_KEY` | Fireworks AI model kataloğu | İsteğe bağlı; yoksa resmî public katalog, varsa zengin API verisi kullanılır |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Workers AI hesap kimliği | İsteğe bağlı; token ile birlikte verilirse API verisi kullanılır |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Workers AI okuma token'ı | İsteğe bağlı; yoksa resmî public model kataloğu kullanılır |
| `GITHUB_TOKEN` | GitHub rate limitini artırır | İsteğe bağlı |
| `HUGGINGFACE_TOKEN` | Hugging Face erişimi | İsteğe bağlı |
| `ADMIN_API_TOKEN` | Admin Bearer token'ı | Üretimde zorunlu |
| `COLLECTOR_INTERVAL_SECONDS` | Genel çekim aralığı | `21600` (6 saat) |
| `BENCHMARK_INTERVAL_SECONDS` | Benchmark çekim aralığı | `43200` (12 saat) |
| `SOURCE_STALE_AFTER_HOURS` | Gecikme uyarı eşiği | `30` saat |
| `API_ALLOWED_ORIGINS` | CORS origin listesi | Yerel adresler |
| `API_ALLOWED_HOSTS` | Trusted Host listesi | Yerel host'lar |
| `SMTP_URL` | E-posta bildirimi | İsteğe bağlı |
| `TELEGRAM_BOT_TOKEN` | Telegram bildirimi | İsteğe bağlı |
| `SLACK_WEBHOOK_URL` | Slack bildirimi | İsteğe bağlı |

`.env` Git tarafından izlenmez. Anahtarları `.env.example` veya kaynak koda
yazmayın.

## Veri toplama

Genel kaynaklar varsayılan olarak 6 saatte, benchmarklar 12 saatte bir çekilir.
Collector'lar dış kaynaklara aynı anda yük oluşturmamak için gecikmeli başlar.

Elle çalıştırma örnekleri:

```bash
python -m llm_radar.collectors.run_openrouter
python -m llm_radar.collectors.run_arena
python -m llm_radar.collectors.run_swebench
python -m llm_radar.collectors.run_artificial_analysis
python -m llm_radar.collectors.run_community_benchmarks
python -m llm_radar.collectors.run_huggingface
python -m llm_radar.collectors.run_github
python -m llm_radar.collectors.run_arxiv
python -m llm_radar.collectors.run_provider_catalogs
python -m llm_radar.backfill_arena_history
python -m llm_radar.read_model            # okuma modeli alanlarını yeniler
```

### Okuma modeli

`model_profiles.general_score` (genel benchmark yüzdeliği) ve
`effective_openness` (lisans/aile fallback'i dahil), olay akışı ve model
aramasının SQL'de sıralayıp sayfalayabilmesi için denormalize edilir. Scheduler
bunları benchmark cadence'inde (12 sa) yeniler; elle:

```bash
python -m llm_radar.read_model
```

Yeni bir modelin skoru/openness'i bir sonraki yenilemeye kadar boş kalır
(birkaç dakika); bu sürede olay akışında "unknown" görünür.

Arena'nın tarihsel `overall` snapshot'larını yalnızca ilk kurulumda veya kontrollü
bir veri onarımı sırasında backfill edin. Komut resmî `text/full` Parquet verisini
indirir ve aynı model/kategori/tarih kaydını tekrar eklemez:

```bash
docker compose run --rm api python -m llm_radar.backfill_arena_history
```

### Duplicate katalog satırlarını birleştirme

Entity resolution artık aynı modeli ikinci kez oluşturmaz: yeni satır mevcut
kanonik modelle eşleşirse `merge_models` onu (snapshot, fiyat, profil, provenance
ve alias'larıyla) kanonik satıra katıp siler. Alias'lar oluşmadan önce yaratılmış
eski duplicate'ler için tek seferlik onarım:

```bash
python -m llm_radar.backfill_merge_duplicate_models          # kuru çalışma - planı yazar
python -m llm_radar.backfill_merge_duplicate_models --apply  # planı uygula
```

Plan `(kanonik firma, kanonik ad)` bazında gruplar; farklı `release_date` veya
`family` taşıyan gruplar (ayrı checkpoint olabilir) atlanır. `--apply` öncesi
çıktıyı gözden geçirin.

Docker içinden:

```bash
docker compose run --rm scheduler python -m llm_radar.collectors.run_openrouter
```

Admin API ile collector tetiklemek için `ADMIN_API_TOKEN` ve Bearer token gerekir:

```bash
curl -X POST http://localhost:8080/api/v1/admin/collectors/openrouter/run \
  -H "Authorization: Bearer $ADMIN_API_TOKEN"
```

## API

API rotaları `/api/v1` öneki altındadır. Canlı şema için `/docs` kullanılır.

| Endpoint | Açıklama |
| --- | --- |
| `GET /health` | Basit API sağlık kontrolü |
| `GET /api/v1/system/health` | Ayrıntılı sistem ve kaynak sağlığı |
| `GET /api/v1/stats` | Platform sayaçları |
| `GET /api/v1/models` | Aranabilir model kataloğu |
| `GET /api/v1/models/{model_id}` | Model, fiyat geçmişi ve benchmark karnesi |
| `GET /api/v1/events` | Değişiklik akışı |
| `GET /api/v1/stream/events` | Canlı SSE akışı |
| `GET /api/v1/sources/health` | Kaynak güncelliği ve hata durumu |
| `GET /api/v1/catalog/sources` | Kaynak sınıfı ve yöntem kataloğu |
| `GET /api/v1/catalog/events` | Event türleri ve önem politikası |
| `GET /api/v1/research` | Kaynaklı araştırmalar |
| `GET /api/v1/technology` | Teknoloji radar sinyalleri |
| `GET /api/v1/notifications` | Bildirim listesi |
| `GET /api/v1/benchmarks/catalog` | Benchmark ve kategori kataloğu |
| `GET /api/v1/leaderboards/arena` | Arena |
| `GET /api/v1/leaderboards/swe-bench` | SWE-bench Verified |
| `GET /api/v1/leaderboards/swe-bench-live` | SWE-bench Live |
| `GET /api/v1/leaderboards/livebench` | LiveBench |
| `GET /api/v1/leaderboards/mmlu-pro` | MMLU-Pro |
| `GET /api/v1/leaderboards/livecodebench` | LiveCodeBench |
| `GET /api/v1/leaderboards/tau-bench` | τ-bench |
| `GET /api/v1/leaderboards/artificial-analysis/{category}` | AA kaynak endeksi |
| `GET /metrics` | Prometheus metrikleri |

## Test, operasyon ve güvenlik

Backend kalite kontrolleri:

```bash
source .venv/bin/activate
pytest -q
ruff check .
mypy src
```

Web kontrolleri:

```bash
npm --prefix web run lint
npm --prefix web test
```

`npm test` üretim derlemesi ve render edilmiş HTML kontrolleri yapar.

### Yedekleme

`backup` servisi günde bir PostgreSQL custom-format dump üretir. Yedekler
`postgres-backups` volume'ında tutulur; 14 günden eskiler otomatik silinir.

```bash
docker compose exec backup find /backups -maxdepth 1 -type f -name '*.dump'
```

Geri yükleme önce ayrı bir test veritabanında denenmelidir.

### Üretim güvenliği

`APP_ENV=production` olduğunda:

- Varsayılan `MINIO_SECRET_KEY` kabul edilmez.
- `ADMIN_API_TOKEN` zorunludur.
- CORS origin ve Trusted Host listelerinde `localhost` kabul edilmez.
- API, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` ve
  `Permissions-Policy` güvenlik başlıklarını ekler; admin oturum çerezi
  `Secure` işaretlenir.

Diğer sertleştirmeler (ortamdan bağımsız):

- API container'ı root olmayan `appuser` ile çalışır.
- Kimliksiz yazma uçları (`/analytics/events`, `/feedback`, `/model-demands`)
  IP başına sabit-pencere rate limit uygular; ters proxy `X-Forwarded-For`
  başlığını gerçek istemci IP'siyle geçmelidir.
- `.env` / `.admin.env` dosyaları yerine üretimde secret'lar ortam
  değişkeni olarak enjekte edilmelidir.

Gözlem noktaları: `/health`, `/api/v1/system/health`, `/metrics`, Redpanda
Console, collector-run ve dead-letter admin endpoint'leridir.

## Sorun giderme

### Docker daemon çalışmıyor

Docker Desktop'ı açıp yeniden deneyin:

```bash
docker compose up -d
```

### Web veya API açılmıyor

```bash
docker compose ps web api
docker compose logs --tail=200 web api
```

Web bağımlılık volume'ı bozuksa:

```bash
docker compose run --rm web npm ci
docker compose up -d --force-recreate web
```

### API çalışıyor ama veri görünmüyor

```bash
docker compose ps processor scheduler redpanda postgres
docker compose logs --tail=200 processor scheduler
docker compose run --rm scheduler python -m llm_radar.collectors.run_openrouter
```

### Port çakışması

Varsayılan portlar: `3000`, `3001`, `5433`, `6380`, `8080`, `8081`, `8123`,
`9000`, `9001`, `9090`, `19092` ve `19644`. Çakışan host portu
`docker-compose.yml` içinde değiştirilmelidir.

## Ek dokümantasyon

- [Mimari özeti](docs/architecture.md)
- [Mimari görsel](docs/llm-radar-architecture-annotated.png)
- [Yerel API dokümantasyonu](http://localhost:8080/docs)

## Lisans

Depoda henüz lisans dosyası bulunmamaktadır. Açık kaynak kullanım koşulları
belirlenene kadar tüm haklar proje sahibine aittir.
