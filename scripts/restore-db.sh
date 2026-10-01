#!/usr/bin/env bash
# Restore a Postgres snapshot created by export-db.sh (custom format).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="${1:-}"

if [[ -z "$FILE" ]]; then
  echo "Usage: $0 <path-to.dump>" >&2
  echo "Example: $0 snapshots/hub-20261001-120000.dump" >&2
  exit 1
fi

if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE" >&2
  exit 1
fi

if [[ -f "${ROOT}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a && source "${ROOT}/.env" && set +a
fi

POSTGRES_USER="${POSTGRES_USER:-hub}"
POSTGRES_DB="${POSTGRES_DB:-learning_hub}"

if docker compose -f "${ROOT}/docker-compose.yml" ps postgres 2>/dev/null | grep -q healthy; then
  echo "Restoring via docker compose postgres service..."
  cat "$FILE" | docker compose -f "${ROOT}/docker-compose.yml" exec -T postgres \
    pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists
elif command -v pg_restore >/dev/null 2>&1; then
  echo "Restoring via local pg_restore..."
  pg_restore -d "${DATABASE_URL_NODE:-postgresql://hub:hub_secret@localhost:5432/learning_hub}" \
    --clean --if-exists "$FILE"
else
  echo "Neither docker compose postgres nor local pg_restore available." >&2
  exit 1
fi

echo "Restore complete. Restart APIs to re-sync seed metadata if needed:"
echo "  docker compose restart api-python api-node"
