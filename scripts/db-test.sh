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
# A psql error stops the run and is printed in full — never hidden by the PASS/FAIL filter.
run_proofs() {
  local out
  if ! out="$(psql "$TARGET" -v ON_ERROR_STOP=1 -q -f "$1" 2>&1)"; then
    echo "$out" | tail -20
    echo "==> FAILED: $(basename "$1") stopped on an error" >&2
    exit 1
  fi
  echo "$out" | grep -E "$2" || true
}
run_proofs "$ROOT/supabase/tests/invariants.sql" 'PASS|FAIL'

echo "==> access model proofs"
run_proofs "$ROOT/supabase/tests/rls.sql" 'ROLE|PASS|FAIL'

echo "==> all database proofs passed"
