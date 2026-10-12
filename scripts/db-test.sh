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

echo "==> ENG-1 per-skill schema proofs (0025 binding, 0026 inactive schema)"
run_proofs "$ROOT/supabase/tests/per_skill_schema.sql" 'PASS|FAIL'

echo "==> O-2 / AP-1 evidence history and project identity proofs (0027)"
run_proofs "$ROOT/supabase/tests/evidence_integrity.sql" 'PASS|FAIL'

echo "==> ENG-1 rollback refuses while per-skill records exist"
if psql "$TARGET" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/rollback/0026_eng1_p2_per_skill_schema.down.sql" >/dev/null 2>&1; then
  echo "FAIL  the 0026 rollback ran although per-skill records exist" >&2; exit 1
fi
echo "PASS  0026 rollback refused (per-skill history is never deleted by a rollback)"

echo "==> ENG-1 / O-2 migration round-trip on a separate database: up → down (0027, 0026, 0025) → up"
RT="${DB}_roundtrip"; RTURL="${PGURL%/*}/$RT"
psql "$PGURL" -v ON_ERROR_STOP=1 -q -c "drop database if exists $RT;" -c "create database $RT;" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null; done
for f in "$ROOT"/supabase/seed/*.sql; do psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null; done
shape() { psql "$RTURL" -At -c "select string_agg(table_name||'.'||column_name, ',' order by table_name, column_name) from information_schema.columns where table_schema = 'public'"; }
after_up="$(shape)"
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/rollback/0027_evidence_history_integrity.down.sql" >/dev/null
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/rollback/0026_eng1_p2_per_skill_schema.down.sql" >/dev/null
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/rollback/0025_eng1_p0_rubric_activity_binding.down.sql" >/dev/null
after_down="$(shape)"
for gone in skill_assessment. skill_assessment_criterion. evidence.skill_assessment_id verification_decision.skill_assessment_id verification_policy.assessment_scope rubric_version.activity_spec_version; do
  if [[ ",$after_down," == *",$gone"* ]]; then echo "FAIL  rollback left $gone" >&2; exit 1; fi
done
seeded="$(psql "$RTURL" -At -c "select count(*) from rubric_version where id = 'd0000000-0000-4000-8000-000000000001' and status = 'published'")"
[[ "$seeded" == "1" ]] || { echo "FAIL  rollback touched pre-existing rows" >&2; exit 1; }
echo "PASS  rollback removed exactly the ENG-1 objects; pre-existing rows intact"
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/0025_eng1_p0_rubric_activity_binding.sql" >/dev/null
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/0026_eng1_p2_per_skill_schema.sql" >/dev/null
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/0027_evidence_history_integrity.sql" >/dev/null
[[ "$(psql "$RTURL" -At -c "select has_column_privilege('authenticated', 'evidence', 'skill_id', 'UPDATE')")" == "f" ]] || { echo "FAIL  0027 re-apply did not restore column privileges" >&2; exit 1; }
[[ "$(shape)" == "$after_up" ]] || { echo "FAIL  re-applying 0025/0026 did not restore the same schema" >&2; exit 1; }
legacy="$(psql "$RTURL" -At -c "select count(*) from rubric_version where activity_spec_version is null")"
echo "PASS  re-applied: identical schema; $legacy pre-existing rubric version(s) left unbound (legacy rows are never re-bound)"
psql "$PGURL" -q -c "drop database if exists $RT;" >/dev/null

echo "==> all database proofs passed"
