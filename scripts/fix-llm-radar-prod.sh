#!/usr/bin/env bash
# Sunucuda: bash /tmp/fix-llm-radar-prod.sh
set -euo pipefail
cd ~/llm-radar-deploy
export COMPOSE='docker compose --env-file .env -f docker-compose.yml -f docker-compose.override.yml'

echo "== minio ports =="
sed -i \
  -e 's/127.0.0.1:9000:9000/127.0.0.1:9100:9000/' \
  -e 's/127.0.0.1:9001:9001/127.0.0.1:9101:9001/' \
  docker-compose.yml
grep -n '910[01]:900' docker-compose.yml | head -5

echo "== override =="
if [[ -f /tmp/docker-compose.override.prod.example.yml ]]; then
  cp /tmp/docker-compose.override.prod.example.yml docker-compose.override.yml
else
  python3 -c 'open("docker-compose.override.yml","w").write("""services:
  minio:
    ports:
      - \"127.0.0.1:9100:9000\"
      - \"127.0.0.1:9101:9001\"
  api:
    labels:
      - \"traefik.enable=true\"
      - \"traefik.docker.network=web\"
      - \"traefik.http.routers.llm-radar-api.rule=Host(`llmradar.planetai9.com`) && PathPrefix(`/api`)\"
      - \"traefik.http.routers.llm-radar-api.entrypoints=websecure\"
      - \"traefik.http.routers.llm-radar-api.tls=true\"
      - \"traefik.http.routers.llm-radar-api.tls.certresolver=le\"
      - \"traefik.http.routers.llm-radar-api.priority=100\"
      - \"traefik.http.services.llm-radar-api.loadbalancer.server.port=8080\"
    networks: [default, web]
  web:
    networks: [default, web]
networks:
  web:
    external: true
""")'
fi
grep -E '9100|traefik.enable' docker-compose.override.yml | head -5

echo "== web from /data =="
python3 - <<'PY'
from pathlib import Path
p = Path("docker-compose.yml")
text = p.read_text()
prod = Path("/data/dbrain-websites/llm-radar/docker-compose.yml").read_text()

def grab(src, start, ends):
    i = src.index(start)
    rest = src[i + len(start) :]
    js = [rest.find(m) for m in ends if rest.find(m) != -1]
    j = min(js) if js else len(rest)
    return start + rest[:j]

web = grab(prod, "  web:\n", ["\nvolumes:", "\nnetworks:"])
i = text.index("  web:\n")
j = text.index("\nvolumes:", i)
p.write_text(text[:i] + web.rstrip() + "\n" + text[j:])
assert "3002" in web, "prod web missing 3002"
print("web OK")
PY

echo "== recreate minio + web + api =="
$COMPOSE stop minio web 2>/dev/null || true
$COMPOSE rm -f minio 2>/dev/null || true
$COMPOSE up -d minio web api
sleep 20
$COMPOSE ps minio web api
echo "== health =="
curl -sS http://127.0.0.1:8080/health; echo
curl -sS -o /dev/null -w 'site:%{http_code}\n' https://llmradar.planetai9.com/
curl -sS -o /dev/null -w 'api:%{http_code}\n' https://llmradar.planetai9.com/api/v1/stats
$COMPOSE logs --tail=15 web || true
