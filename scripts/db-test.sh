#!/usr/bin/env bash
# Runs the schema and its proofs against a throwaway PostgreSQL database.
#
#   scripts/db-test.sh                       # uses $DATABASE_URL
#   PGURL=postgres://... scripts/db-test.sh  # or an explicit one
#
# It drops and recreates the target database, so never point it at anything
# you care about.
set -euo pipefail

PGURL="${PGURL:-${DATABASE_URL:-}}"
if [[ -z "$PGURL" ]]; then
  echo "Set DATABASE_URL or PGURL to a PostgreSQL server." >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${NAQLA_TEST_DB:-naqla_test}"

echo "==> recreating $DB"
psql "$PGURL" -v ON_ERROR_STOP=1 -c "drop database if exists $DB;" -c "create database $DB;" >/dev/null

TARGET="${PGURL%/*}/$DB"

echo "==> applying migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "    $(basename "$f")"
  psql "$TARGET" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
done

echo "==> invariant proofs (each must be REJECTED by the database)"
psql "$TARGET" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/invariants.sql" 2>&1 | grep -E 'PASS|FAIL' || true

echo "==> access model proofs"
psql "$TARGET" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/rls.sql" 2>&1 | grep -E 'ROLE|PASS|FAIL' || true

echo "==> all database proofs passed"
