-- ═══════════════════════════════════════════════════════════════════════════
-- 0023 · Critical verification-integrity remediation (D-118)
--
-- Before: a passed deterministic evaluation promoted the skill to the rubric's
-- proposal under the legacy baseline `default@1`, even when every criterion was
-- a user-ticked checkbox or the mere presence of an uploaded file; and a
-- submission alone recorded Practiced. A declaration is not evidence.
--
-- After:
--   1. verification_policy states what a promotion must rest on
--      (`promotion_basis`) and whether submitting alone records Practiced
--      (`practiced_on_submission`). Versioned, governed configuration.
--   2. `default@2` — a migration-created SAFETY BASELINE — is in effect:
--      `independently_verified`, no Practiced on submission. It restricts; it
--      grants nothing. It is not SME-validated (a later approved policy may
--      enable automatic decisions once criteria are independently verifiable
--      and calibrated).
--   3. `default@1` (the legacy behaviour) is deactivated and kept as history.
--      The legacy basis may never again be production_active or a baseline:
--      the database refuses it. It can only be development_only (which the
--      guard already refuses in production).
--   4. A new decision value `assessment_pending_validation`: the run is
--      recorded, the level is unchanged.
-- Historical evaluations, decisions, transitions and audit rows are untouched.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Columns. Existing rows describe what they did (legacy); new rows default to the safe values.
alter table verification_policy add column promotion_basis text not null default 'legacy_any_pass'
  check (promotion_basis in ('independently_verified','legacy_any_pass'));
alter table verification_policy alter column promotion_basis set default 'independently_verified';
alter table verification_policy add column practiced_on_submission boolean not null default true;
alter table verification_policy alter column practiced_on_submission set default false;
comment on column verification_policy.promotion_basis is
  'D-118: independently_verified = a level only on criteria decided by a named human reviewer or on platform-verified artifacts, with SME-approved rubric values; legacy_any_pass = pre-remediation behaviour, development/test only (never production_active, never a baseline).';
comment on column verification_policy.practiced_on_submission is
  'D-118: whether submitting work alone records Practiced (legacy T-LINK at submission). Off in the safety baseline.';

-- 2. The decision value for "observed, not yet validated".
alter table verification_decision drop constraint verification_decision_decision_check;
alter table verification_decision add constraint verification_decision_decision_check
  check (decision in ('accepted','downgraded','rejected','escalated_to_human','exception_granted','not_applicable','evidence_reestablished','assessment_pending_validation'));

-- 3. Retire the legacy baseline (audited), then install the safety baseline (migration-created).
-- Session-scoped for this migration's audited act (psql runs each statement in its own transaction); cleared below.
select set_config('naqla.config_actor', 'migration 0023', false),
       set_config('naqla.config_reason', 'D-118 critical remediation: the legacy basis promoted on declarations; replaced by the safety baseline default@2', false);
update verification_policy set activation = 'inactive' where key = 'default' and version = 1 and activation = 'legacy_baseline';

alter table verification_policy disable trigger verification_policy_activation;
insert into verification_policy (key, version, description_en, applies_outcomes, accept_rubric_proposal, max_resulting_state, min_assessment_confidence,
  min_independent_evidence, escalate_on, blocking_rule, per_skill_evidence_derivation, decision_actors, promotion_basis, practiced_on_submission,
  activation, baseline_of, activated_at, validation_note_en)
values ('default', 2,
  'SAFETY BASELINE (D-118) — a passed evaluation proposes a level only when every skill-evidence criterion was decided by a named human reviewer or rests on platform-verified artifacts, and the rubric values are SME-approved. Otherwise: assessment_pending_validation, level unchanged. Submitting work alone records no level.',
  '{passed}', true, null, null, null, '{}'::jsonb, 'mandatory_criteria_unmet_blocks', false, '{policy,human}', 'independently_verified', false,
  'legacy_baseline', 'D-118 critical verification-integrity remediation (migration 0023): restrictive safety baseline replacing default@1', now(),
  'SAFETY BASELINE — restricts, never grants. NOT SME validated. Automatic levels require a later, SME-approved policy.');
alter table verification_policy enable trigger verification_policy_activation;
insert into config_change (entity_table, entity_id, field, old_value, new_value, actor, reason)
select 'verification_policy', id, 'activation', null, 'legacy_baseline', 'migration 0023', 'D-118 safety baseline (restrictive)' from verification_policy where key = 'default' and version = 2;
select set_config('naqla.config_actor', '', false), set_config('naqla.config_reason', '', false);

-- 4. The legacy basis can never decide in production: never production_active, never a baseline again.
create or replace function verification_policy_legacy_basis_guard() returns trigger language plpgsql as $$
begin
  if new.promotion_basis = 'legacy_any_pass' and new.activation in ('production_active','legacy_baseline') then
    raise exception 'verification_policy %@%: the legacy promotion basis (declarations may earn a level) can only be development_only, never % (D-118)', new.key, new.version, new.activation;
  end if;
  return new;
end $$;
create trigger verification_policy_legacy_basis before insert or update on verification_policy
  for each row execute function verification_policy_legacy_basis_guard();
