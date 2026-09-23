#!/usr/bin/env bash
# ~/llm-radar-deploy içinde, `git reset --hard` SONRASI, `up --build` ÖNCESİ çalıştır.
# Override + minio port + prod web (Traefik/3002) bloğunu geri koyar.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROD_COMPOSE="${PROD_COMPOSE:-/data/dbrain-websites/llm-radar/docker-compose.yml}"
EXAMPLE="docker-compose.override.prod.example.yml"
OVERRIDE="docker-compose.override.yml"

if [[ ! -f "$EXAMPLE" ]]; then
  echo "ERROR: $EXAMPLE missing (push it to main)." >&2
  exit 1
fi

# Override: reset siler / bozar — example'dan taze kopyala
cp "$EXAMPLE" "$OVERRIDE"
echo "OK override from $EXAMPLE"

# Minio host ports (idempotent; override merge yetmez)
python3 - <<'PY'
from pathlib import Path
p = Path("docker-compose.yml")
text = p.read_text()
old = text
text = text.replace("127.0.0.1:9000:9000", "127.0.0.1:9100:9000")
text = text.replace("127.0.0.1:9001:9001", "127.0.0.1:9101:9001")
# bare 9000:9000 / 9001:9001 under minio (unlikely)
if text != old:
    p.write_text(text)
    print("OK minio ports -> 9100/9101 in docker-compose.yml")
else:
    print("OK minio ports already 9100/9101 (or pattern not found)")
PY

# Prod web block (vinext + Traefik + 3002)
if [[ ! -r "$PROD_COMPOSE" ]]; then
  echo "ERROR: cannot read $PROD_COMPOSE" >&2
  exit 1
fi

python3 - <<PY
from pathlib import Path
p = Path("docker-compose.yml")
text = p.read_text()
prod = Path("$PROD_COMPOSE").read_text()

def grab(src, start, ends):
    i = src.index(start)
    rest = src[i + len(start):]
    js = [rest.find(m) for m in ends if rest.find(m) != -1]
    j = min(js) if js else len(rest)
    return start + rest[:j]

web = grab(prod, "  web:\n", ["\nvolumes:", "\nnetworks:"])
i = text.index("  web:\n")
j = text.index("\nvolumes:", i)
p.write_text(text[:i] + web.rstrip() + "\n" + text[j:])
ok_port = "3002" in web
ok_prod = "vinext" in web or "traefik" in web.lower() or "npm run start" in web or "next start" in web
print(f"OK web block from prod (3002={ok_port}, prod-ish={ok_prod})")
if not ok_port:
    raise SystemExit("web block missing 3002 — check $PROD_COMPOSE")
PY

echo "--- verify ---"
grep -n '910[01]:900' docker-compose.yml | head -5 || true
grep -E '9100|9101' "$OVERRIDE" | head -5 || true
grep -A3 '^  web:' docker-compose.yml | head -8
echo "Next: export COMPOSE=... && \$COMPOSE up -d --build"
