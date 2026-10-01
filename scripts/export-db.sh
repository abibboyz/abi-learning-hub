#!/usr/bin/env bash
# Export Postgres snapshot (custom format) via docker compose or local pg_dump.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT}/snapshots"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="${OUT_DIR}/hub-${STAMP}.dump"

# Load .env if present
if [[ -f "${ROOT}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a && source "${ROOT}/.env" && set +a
fi

POSTGRES_USER="${POSTGRES_USER:-hub}"
POSTGRES_DB="${POSTGRES_DB:-learning_hub}"

if docker compose -f "${ROOT}/docker-compose.yml" ps postgres 2>/dev/null | grep -q healthy; then
  echo "Exporting via docker compose postgres service..."
  docker compose -f "${ROOT}/docker-compose.yml" exec -T postgres \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$OUT_FILE"
elif command -v pg_dump >/dev/null 2>&1; then
  echo "Exporting via local pg_dump..."
  pg_dump "${DATABASE_URL_NODE:-postgresql://hub:hub_secret@localhost:5432/learning_hub}" -Fc > "$OUT_FILE"
else
  echo "Neither docker compose postgres nor local pg_dump available." >&2
  exit 1
fi

echo "Wrote $OUT_FILE"
ls -lh "$OUT_FILE"
