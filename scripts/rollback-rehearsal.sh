#!/usr/bin/env bash
# ENG-1 rollback / forward-recovery rehearsal on a POPULATED database (corroborating evidence and fingerprints exist).
# Works on a throw-away CLONE of the source database; the source is never touched. Development use only.
#   PGURL=postgresql://postgres@host:port/postgres SOURCE_DB=naqla_e2e bash scripts/rollback-rehearsal.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${PGURL:?set PGURL to the maintenance database URL}"
SOURCE_DB="${SOURCE_DB:-naqla_e2e}"
CLONE="${SOURCE_DB}_rehearsal"; CURL="${PGURL%/*}/$CLONE"
q() { psql "$CURL" -X -At -v ON_ERROR_STOP=1 -c "$1"; }
psql "$PGURL" -X -q -v ON_ERROR_STOP=1 -c "drop database if exists $CLONE" -c "create database $CLONE template $SOURCE_DB" >/dev/null
trap 'psql "$PGURL" -X -q -c "drop database if exists $CLONE" >/dev/null' EXIT

snap() { q "select (select count(*) from evidence) || '/' || (select count(*) from evidence where evidence_role = 'corroborating') || '/' ||
                   (select count(*) from verification_decision) || '/' || (select count(*) from skill_claim) || '/' ||
                   (select md5(coalesce(string_agg(id::text || coalesce(withdrawn_at::text, '-') || evidence_role, ',' order by id), '')) from evidence)"; }
fps() { q "select md5(coalesce(string_agg(submission_artifact_id::text || coalesce(fingerprint, '-'), ',' order by submission_artifact_id), '')) || ':' || count(*) from artifact_text_fingerprint where fingerprint_version = 'naqla-text-fp-v1'"; }

before="$(snap)"; corr="$(q "select count(*) from evidence where evidence_role = 'corroborating'")"; fp_before="$(fps)"
[[ "$corr" -gt 0 ]] || { echo "FAIL  the source has no corroborating evidence; run the API e2e first" >&2; exit 1; }
echo "PASS  clone of $SOURCE_DB: $corr corroborating evidence row(s); history snapshot $before; fingerprints ${fp_before#*:}"

# 1. Rolling back 0031 is REFUSED while corroborating evidence exists, and changes nothing (single transaction).
if psql "$CURL" -X -q -1 -v ON_ERROR_STOP=1 -f "$ROOT/supabase/rollback/0032_eng1_text_fingerprint.down.sql" -f "$ROOT/supabase/rollback/0031_eng1_p4_corroboration_integrity.down.sql" >/dev/null 2>&1; then
  echo "FAIL  0032+0031 rollback ran although corroborating evidence exists" >&2; exit 1
fi
[[ "$(snap)" == "$before" && "$(fps)" == "$fp_before" && "$(q "select count(*) from pg_proc where proname = 'evidence_role_guard'")" == "1" ]] \
  || { echo "FAIL  a refused rollback changed something" >&2; exit 1; }
echo "PASS  0031 rollback refused with corroborating evidence present; the whole transaction rolled back (history, guards and fingerprints unchanged)"

# 2. Rolling back 0032 alone succeeds and touches no evidence, decision or claim (fingerprints are derived data).
psql "$CURL" -X -q -1 -v ON_ERROR_STOP=1 -f "$ROOT/supabase/rollback/0032_eng1_text_fingerprint.down.sql" >/dev/null
[[ "$(snap)" == "$before" ]] || { echo "FAIL  0032 rollback changed history" >&2; exit 1; }
[[ "$(q "select count(*) from pg_proc where proname = 'evidence_normalized_text_hash'")" == "1" && "$(q "select to_regclass('artifact_text_fingerprint') is null")" == "t" ]] \
  || { echo "FAIL  0032 rollback did not restore the 0031 check" >&2; exit 1; }
echo "PASS  0032 rollback: 0031 duplicate check restored; evidence, decisions and claims identical"

# 3. Forward recovery: 0032 re-applies on the populated database; until fingerprints exist, duplicates fail closed.
psql "$CURL" -X -q -1 -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/0032_eng1_text_fingerprint.sql" >/dev/null
[[ "$(snap)" == "$before" && "$(q "select count(*) from artifact_text_fingerprint")" == "0" ]] || { echo "FAIL  0032 re-apply" >&2; exit 1; }
probe="$(q "select r.id || ' ' || e.user_id || ' ' || e.skill_id from evidence e join evaluation_result r on r.id = e.evaluation_result_id
             where e.evidence_role = 'corroborating' and exists (select 1 from submission_artifact sa where sa.submission_id = r.submission_id and sa.kind = 'text') limit 1")"
read -r rid uid sid <<<"$probe"
# A corroborating row's own result is the same assessment event; probe the fail-closed path on another skill of the same result.
other="$(q "select id from skill where id <> '$sid' and status = 'active' and not exists (select 1 from evidence where user_id = '$uid' and canonical_skill_id(skill_id) = canonical_skill_id(skill.id)) limit 1")"
[[ "$(q "select evidence_corroboration_conflict('$uid', '$other', '$rid')")" == "text_fingerprint_missing" ]] || { echo "FAIL  missing fingerprints did not fail closed" >&2; exit 1; }
echo "PASS  forward recovery: 0032 re-applied on populated data, history identical; with no fingerprint the check fails closed (text_fingerprint_missing)"

# 4. The writer's backfill recomputes EXACTLY the fingerprints that existed before (determinism of naqla-text-fp-v1).
DATABASE_URL="$CURL" node "$ROOT/scripts/backfill-text-fingerprints.mjs" >/dev/null
fp_after="$(fps)"
# Every fingerprint that existed before is recomputed identically (the backfill may add ones never computed before).
before_rows="$(psql "${PGURL%/*}/$SOURCE_DB" -X -At -c "select submission_artifact_id || '=' || coalesce(fingerprint, '-') from artifact_text_fingerprint where fingerprint_version = 'naqla-text-fp-v1' order by 1")"
after_rows="$(q "select submission_artifact_id || '=' || coalesce(fingerprint, '-') from artifact_text_fingerprint where fingerprint_version = 'naqla-text-fp-v1' order by 1")"
missing="$(comm -23 <(echo "$before_rows") <(echo "$after_rows") | grep -c . || true)"
[[ "$missing" == "0" ]] || { echo "FAIL  $missing fingerprint(s) recomputed differently" >&2; exit 1; }
[[ "$(snap)" == "$before" ]] || { echo "FAIL  the backfill changed history" >&2; exit 1; }
echo "PASS  backfill recomputed every earlier fingerprint identically (${fp_before#*:} before, ${fp_after#*:} after); history identical"
echo "==> rollback / forward-recovery rehearsal passed (clone dropped)"
