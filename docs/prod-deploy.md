# LLM Radar prod deploy (PlanetAI sunucu)

Hedef: `https://llmradar.planetai9.com`  
SSH: `bdincer@212.58.12.163`  
Çalışma dizini: **`~/llm-radar-deploy`** (yazılabilir).  
`/data/dbrain-websites/llm-radar` → `gturkyilmaz` sahibi; `git write` / `chown` yok — oraya dokunma.

## Mac vs sunucu (en sık hata)

| Nerede | Ne yapılır |
|--------|------------|
| **Mac** (`…MacBook…`) | Sadece `scp` dump; isteğe bağlı lokal test |
| **Sunucu** (`bdincer@Dbrain-2`) | `git`, `docker compose`, `pg_restore`, collect |

Prompt `MacBook` ise sunucu komutlarını **çalıştırma**.

## Kalıcı dosyalar (git reset silmesin)

`git reset --hard origin/main` şunları **sıfırlar**:

- `docker-compose.override.yml` (Traefik labels / `web` network)
- `docker-compose.yml` içindeki **prod web** bloğu → yine `3000` + `npm run dev`
- (Eski main’de) minio `9000/9001` — **artık base `9100/9101`**; yine de script doğrular

**Compose `ports` merge eder, REPLACE etmez** — override’a 9100 yazmak yetmez; base’de 9001 kalırsa yine çakışır.

### Reset sonrası zorunlu (heredoc yapıştırma)

```bash
cd ~/llm-radar-deploy
bash scripts/prod-after-git-reset.sh
```

Script: example → override, minio 9100/9101, `/data/.../docker-compose.yml` web bloğunu kopyalar.

## Standart güncelleme sırası

### 1) Mac — dump (gerekirse)

```bash
# lokal dump zaten varsa:
scp ~/Downloads/llm-radar-YYYYMMDDTHHMMSSZ.dump bdincer@212.58.12.163:/tmp/
```

### 2) Sunucu — kod

```bash
ssh bdincer@212.58.12.163
cd ~/llm-radar-deploy
export COMPOSE='docker compose --env-file .env -f docker-compose.yml -f docker-compose.override.yml'

git fetch origin
git reset --hard origin/main
git log -1 --oneline

bash scripts/prod-after-git-reset.sh
```

### 3) Sunucu — DB restore (dump ile)

```bash
mkdir -p sql
mv /tmp/llm-radar-*.dump sql/   # dosya adını kontrol et
ls -lah sql/

$COMPOSE stop api processor scheduler outbox-worker web backup

$COMPOSE exec -T postgres psql -U llm_radar -d postgres \
  -c "DROP DATABASE llm_radar WITH (FORCE);" \
  -c "CREATE DATABASE llm_radar OWNER llm_radar;"

$COMPOSE cp sql/llm-radar-YYYYMMDDTHHMMSSZ.dump postgres:/tmp/llm-radar.dump

$COMPOSE exec -T postgres pg_restore \
  -U llm_radar -d llm_radar \
  --no-owner --no-privileges \
  /tmp/llm-radar.dump

$COMPOSE exec -T postgres psql -U llm_radar -d llm_radar \
  -c "select count(*) from models;" \
  -c "select version_num from alembic_version;"
```

Sadece kod güncellemesi ise bu adımı atla; dump geldiyse **mutlaka** restore et (`up --build` restore’dan önce değil).

### 4) Sunucu — ayağa kaldır

```bash
$COMPOSE up -d --build
$COMPOSE ps
curl -sS http://127.0.0.1:8080/health
curl -sS -o /dev/null -w 'site:%{http_code} api:%{http_code}\n' \
  https://llmradar.planetai9.com/ https://llmradar.planetai9.com/api/v1/stats
```

Beklenen: API `ok`, `site:200 api:200`, web log’da `Production server running at http://0.0.0.0:3002`.

### 5) Collector (Türkçe / HF modelleri)

```bash
$COMPOSE run --rm --no-deps scheduler python -m llm_radar.collectors.run_huggingface
```

## Bilinen portlar

| Servis | Host | Not |
|--------|------|-----|
| API | `8080` | Traefik `/api` → 8080 |
| Web | `3002` | Traefik site → 3002; **3000 kullanma** |
| Minio | `9100` / `9101` | `9001` ticket-minio’da dolu |
| Postgres | `5433` | |

## Kontrol listesi (deploy bitmeden)

- [ ] Komutlar `bdincer@Dbrain-2` üzerinde
- [ ] `~/llm-radar-deploy` + `COMPOSE` override ile
- [ ] `git log -1` beklenen commit
- [ ] Dump varsa restore + `models` count > 0
- [ ] minio `9100/9101`, web `3002`
- [ ] site + api HTTP 200
- [ ] Gerekirse HF collect

## Kalıcı çözüm (ileride)

`/data/dbrain-websites/llm-radar` için `bdincer` yazma izni veya planetai9 gibi grup paylaşımı — o zaman tek dizin, home clone gerekmez.
