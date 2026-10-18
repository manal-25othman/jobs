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

echo "==> ENG-1 Phase A integrity hardening proofs (0028)"
run_proofs "$ROOT/supabase/tests/integrity_hardening.sql" 'PASS|FAIL'

echo "==> ENG-1 P3 development pathway proofs (0029)"
run_proofs "$ROOT/supabase/tests/per_skill_development.sql" 'PASS|FAIL'

echo "==> ENG-1 P4 / EXT-2 independent-evidence proofs (0030)"
run_proofs "$ROOT/supabase/tests/independent_evidence.sql" 'PASS|FAIL'

echo "==> ENG-1 P4 corroborating-evidence integrity (0031) and text-fingerprint (0032) proofs"
run_proofs "$ROOT/supabase/tests/corroboration_integrity.sql" 'PASS|FAIL'

echo "==> historical claimed-skill audit runs read-only and changes nothing"
before="$(psql "$TARGET" -At -c "select (select count(*) from submission_claimed_skill) || '/' || (select count(*) from evidence) || '/' || (select count(*) from skill_claim)")"
psql "$TARGET" -X -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/audit-claimed-skills.sql" >/dev/null
[[ "$(psql "$TARGET" -At -c "select (select count(*) from submission_claimed_skill) || '/' || (select count(*) from evidence) || '/' || (select count(*) from skill_claim)")" == "$before" ]] || { echo "FAIL  the audit changed data" >&2; exit 1; }
grep -q "transaction isolation level repeatable read read only" "$ROOT/scripts/audit-claimed-skills.sql" || { echo "FAIL  the audit is not read-only" >&2; exit 1; }
echo "PASS  audit-claimed-skills.sql ran in a read-only transaction and changed nothing ($before)"

echo "==> ENG-1 rollback refuses while per-skill records exist"
if psql "$TARGET" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/rollback/0026_eng1_p2_per_skill_schema.down.sql" >/dev/null 2>&1; then
  echo "FAIL  the 0026 rollback ran although per-skill records exist" >&2; exit 1
fi
echo "PASS  0026 rollback refused (per-skill history is never deleted by a rollback)"

echo "==> ENG-1 / O-2 migration round-trip on a separate database: up → down (0033, 0032, 0031, 0030, 0029, 0028, 0027, 0026, 0025) → up"
RT="${DB}_roundtrip"; RTURL="${PGURL%/*}/$RT"
psql "$PGURL" -v ON_ERROR_STOP=1 -q -c "drop database if exists $RT;" -c "create database $RT;" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null; done
for f in "$ROOT"/supabase/seed/*.sql; do psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null; done
shape() { psql "$RTURL" -At -c "select string_agg(table_name||'.'||column_name, ',' order by table_name, column_name) from information_schema.columns where table_schema = 'public'"; }
after_up="$(shape)"
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/rollback/0033_eng1_ext1_integrated_assessment.down.sql" >/dev/null
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/rollback/0032_eng1_text_fingerprint.down.sql" >/dev/null
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/rollback/0031_eng1_p4_corroboration_integrity.down.sql" >/dev/null
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/rollback/0030_eng1_p4_independent_evidence.down.sql" >/dev/null
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/rollback/0029_eng1_p3_development_pathway.down.sql" >/dev/null
[[ "$(psql "$RTURL" -At -c "select count(*) from pg_constraint where conname = 'verification_policy_per_skill_sealed'")" == "1" ]] || { echo "FAIL  0029 rollback did not restore the P2 seal" >&2; exit 1; }
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/rollback/0028_eng1_integrity_hardening.down.sql" >/dev/null
[[ "$(psql "$RTURL" -At -c "select has_table_privilege('authenticated', 'submission_claimed_skill', 'INSERT')")" == "t" ]] || { echo "FAIL  0028 rollback did not restore the pre-0028 grants" >&2; exit 1; }
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/rollback/0027_evidence_history_integrity.down.sql" >/dev/null
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/rollback/0026_eng1_p2_per_skill_schema.down.sql" >/dev/null
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/rollback/0025_eng1_p0_rubric_activity_binding.down.sql" >/dev/null
after_down="$(shape)"
for gone in artifact_text_fingerprint. evidence.evidence_role activity_spec.variant_family activity_spec.task_purpose activity_starter_checksum. skill_assessment. skill_assessment_criterion. evidence.skill_assessment_id verification_decision.skill_assessment_id verification_policy.assessment_scope rubric_version.activity_spec_version; do
  if [[ ",$after_down," == *",$gone"* ]]; then echo "FAIL  rollback left $gone" >&2; exit 1; fi
done
seeded="$(psql "$RTURL" -At -c "select count(*) from rubric_version where id = 'd0000000-0000-4000-8000-000000000001' and status = 'published'")"
[[ "$seeded" == "1" ]] || { echo "FAIL  rollback touched pre-existing rows" >&2; exit 1; }
echo "PASS  rollback removed exactly the ENG-1 objects; pre-existing rows intact"
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/0025_eng1_p0_rubric_activity_binding.sql" >/dev/null
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/0026_eng1_p2_per_skill_schema.sql" >/dev/null
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/0027_evidence_history_integrity.sql" >/dev/null
[[ "$(psql "$RTURL" -At -c "select has_column_privilege('authenticated', 'evidence', 'skill_id', 'UPDATE')")" == "f" ]] || { echo "FAIL  0027 re-apply did not restore column privileges" >&2; exit 1; }
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/0028_eng1_integrity_hardening.sql" >/dev/null
[[ "$(psql "$RTURL" -At -c "select has_table_privilege('authenticated', 'submission_claimed_skill', 'INSERT')::text || (select convalidated::text from pg_constraint where conname = 'verification_policy_no_submission_promotion')")" == "falsetrue" ]] || { echo "FAIL  0028 re-apply did not restore the guards" >&2; exit 1; }
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/0029_eng1_p3_development_pathway.sql" >/dev/null
[[ "$(psql "$RTURL" -At -c "select count(*) filter (where conname = 'verification_policy_per_skill_development_only') || '/' || count(*) filter (where conname = 'verification_policy_per_skill_sealed') from pg_constraint")" == "1/0" ]] || { echo "FAIL  0029 re-apply did not restore the development seal" >&2; exit 1; }
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/0030_eng1_p4_independent_evidence.sql" >/dev/null
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/0031_eng1_p4_corroboration_integrity.sql" >/dev/null
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/0032_eng1_text_fingerprint.sql" >/dev/null
psql "$RTURL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/0033_eng1_ext1_integrated_assessment.sql" >/dev/null
[[ "$(shape)" == "$after_up" ]] || { echo "FAIL  re-applying 0025/0026 did not restore the same schema" >&2; exit 1; }
legacy="$(psql "$RTURL" -At -c "select count(*) from rubric_version where activity_spec_version is null")"
echo "PASS  re-applied: identical schema; $legacy pre-existing rubric version(s) left unbound (legacy rows are never re-bound)"
psql "$PGURL" -q -c "drop database if exists $RT;" >/dev/null

echo "==> all database proofs passed"
