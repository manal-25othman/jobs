-- ═══════════════════════════════════════════════════════════════════════════
-- 0030 — ENG-1 P4 / EXT-2: independent-evidence support (INACTIVE).
--
-- 1. Content facts for independence (ENG-2), additive and NULLABLE — null means "not reviewed", which the
--    EXT-2 rule treats as indeterminate (fail closed). No row is populated by this migration.
--      activity_spec.variant_family  tasks in one family are not independent of each other (I-2)
--      activity_spec.task_purpose    practice | validation | integrated (I-1). The existing
--                                    `is_validation_activity` is `not null default false`, so it cannot say
--                                    "not reviewed"; it is kept unchanged and must agree with task_purpose.
--    Both are content: settable while the activity is draft or curated, immutable from SME review on, for every
--    role (a published activity cannot be re-familied to manufacture independence).
-- 2. activity_starter_checksum: platform starter files of an activity, which are never a reuse conflict (I-5).
--    Service-only, content-governed in the same way. Empty.
-- 3. readiness_rule.rule_type gains `skill_evidence_path`.
-- 4. SEAL (until the Product Owner's P6 decision): a readiness rule set that contains a skill_evidence_path rule
--      - can never be approved, published or production_active (or a baseline);
--      - becomes development_only only with the explicit, transaction-local opt-in
--        naqla.readiness_ext_dev_activation = 'on', and never when naqla.production = 'on';
--      - and no such rule can be added to a set that is approved, published or not inactive.
--
-- 5. CORROBORATING EVIDENCE (PO decision on the P4 audit conflict): a per_skill policy may set
--    record_corroborating_evidence (default false; the column is meaningful only in the per_skill scope, which is
--    itself development-only). A new decision kind `evidence_corroborated` records that a claimed skill, met on a
--    verified basis, already at the level its rubric proposes, produced corroborating evidence. For every role it
--    must rest on a met, independently verified per-skill assessment with no proposal, carry its evidence, and keep
--    previous = resulting state (no level change). The legacy path never writes it.
--
-- No readiness rule set is created, approved or activated. No threshold or path value is approved.
-- Rollback: supabase/rollback/0030_eng1_p4_independent_evidence.down.sql (refuses while an EXT-2 rule exists).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────── 1. content facts ───────────────────────────────
alter table activity_spec
  add column variant_family text,
  add column task_purpose text,
  add constraint activity_spec_variant_family_format check (variant_family is null or variant_family ~ '^[a-z][a-z0-9_.-]{1,63}$'),
  add constraint activity_spec_task_purpose_check check (task_purpose is null or task_purpose in ('practice', 'validation', 'integrated')),
  add constraint activity_spec_task_purpose_agrees check (task_purpose is null or (task_purpose = 'validation') = is_validation_activity);

comment on column activity_spec.variant_family is
  'ENG-1 P4 / EXT-2 (I-2): tasks of one variant family are never independent of each other. Null = not reviewed (EXT-2 indeterminate). Content: fixed from SME review on.';
comment on column activity_spec.task_purpose is
  'ENG-1 P4 / EXT-2 (I-1): practice | validation | integrated. Null = not reviewed (EXT-2 indeterminate). Must agree with is_validation_activity. Content: fixed from SME review on.';

create or replace function activity_spec_independence_fields_guard() returns trigger
  language plpgsql as $$
  begin
    if (new.variant_family is distinct from old.variant_family or new.task_purpose is distinct from old.task_purpose)
       and old.status not in ('draft', 'curated', 'needs_revision', 'rejected') then
      raise exception 'activity % is %: its variant family and task purpose are content fixed from SME review on; create a new version', old.id, old.status
        using errcode = 'check_violation';
    end if;
    return new;
  end $$;
create trigger activity_spec_independence_fields_guard_trg before update on activity_spec
  for each row execute function activity_spec_independence_fields_guard();

-- ─────────────────────────────── 2. starter files ───────────────────────────────
create table activity_starter_checksum (
  activity_spec_id  uuid not null references activity_spec(id) on delete restrict,
  checksum_sha256   text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  label             text not null check (length(btrim(label)) > 0),
  created_at        timestamptz not null default now(),
  primary key (activity_spec_id, checksum_sha256)
);
comment on table activity_starter_checksum is
  'ENG-1 P4 / EXT-2 (I-5): checksums of an activity''s platform starter files; never a reuse conflict between two tasks. Service-only content; fixed from SME review on.';
alter table activity_starter_checksum enable row level security;
alter table activity_starter_checksum force row level security;
revoke all on activity_starter_checksum from anon, authenticated;
grant select, insert on activity_starter_checksum to service_role;

create or replace function activity_starter_checksum_guard() returns trigger
  language plpgsql as $$
  declare st text;
  begin
    select status::text into st from activity_spec where id = coalesce(new.activity_spec_id, old.activity_spec_id);
    if st not in ('draft', 'curated', 'needs_revision', 'rejected') then
      raise exception 'activity starter files are content fixed from SME review on (activity is %)', st using errcode = 'check_violation';
    end if;
    return coalesce(new, old);
  end $$;
create trigger activity_starter_checksum_guard_trg before insert or update or delete on activity_starter_checksum
  for each row execute function activity_starter_checksum_guard();

-- ─────────────────────────────── 3. rule type ───────────────────────────────
alter table readiness_rule drop constraint readiness_rule_rule_type_check;
alter table readiness_rule add constraint readiness_rule_rule_type_check check (rule_type in (
  'required_skill_at_level', 'non_compensable_skill', 'min_skills_at_level', 'all_core_skills_at_level', 'all_skills_at_expected_level',
  'min_evidence_per_skill', 'skill_evidence_path'));
alter table readiness_rule add constraint readiness_rule_evidence_path_has_skill check (rule_type <> 'skill_evidence_path' or skill_id is not null);

-- ─────────────────────────────── 4. the seal ───────────────────────────────
create or replace function readiness_rule_set_has_evidence_path(p_set uuid) returns boolean
  language sql stable as $$ select exists (select 1 from readiness_rule where rule_set_id = p_set and rule_type = 'skill_evidence_path') $$;

create or replace function readiness_rule_set_evidence_path_seal() returns trigger
  language plpgsql as $$
  begin
    if tg_op = 'INSERT' or not readiness_rule_set_has_evidence_path(new.id) then return new; end if;
    if new.review_status in ('approved', 'published') or new.activation in ('production_active', 'legacy_baseline') then
      raise exception 'ENG-1 P4: a readiness rule set with a skill_evidence_path (EXT-2) rule is sealed: it cannot be approved, published or production-activated before the P6 decision'
        using errcode = 'check_violation';
    end if;
    if new.activation = 'development_only' and old.activation is distinct from 'development_only' then
      if coalesce(current_setting('naqla.production', true), '') = 'on' then
        raise exception 'ENG-1 P4: an EXT-2 readiness rule set can never be activated in production' using errcode = 'insufficient_privilege';
      end if;
      if coalesce(current_setting('naqla.readiness_ext_dev_activation', true), '') <> 'on' then
        raise exception 'ENG-1 P4: an EXT-2 readiness rule set becomes development_only only with the explicit, transaction-local test opt-in naqla.readiness_ext_dev_activation = on'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
    return new;
  end $$;
create trigger readiness_rule_set_evidence_path_seal_trg before insert or update on readiness_rule_set
  for each row execute function readiness_rule_set_evidence_path_seal();

create or replace function readiness_rule_evidence_path_seal() returns trigger
  language plpgsql as $$
  declare s record;
  begin
    if new.rule_type <> 'skill_evidence_path' then return new; end if;
    select review_status::text as review_status, activation into s from readiness_rule_set where id = new.rule_set_id;
    if s.review_status in ('approved', 'published') or s.activation <> 'inactive' then
      raise exception 'ENG-1 P4: a skill_evidence_path rule can be added only to an inactive, unapproved readiness rule set' using errcode = 'check_violation';
    end if;
    return new;
  end $$;
create trigger readiness_rule_evidence_path_seal_trg before insert or update on readiness_rule
  for each row execute function readiness_rule_evidence_path_seal();

comment on function readiness_rule_set_evidence_path_seal() is
  'ENG-1 P4: EXT-2 readiness rule sets are development-only (explicit opt-in, never in production) and never approved/production_active until the PO''s P6 decision.';

-- ─────────────────────────────── 5. corroborating evidence ───────────────────────────────
alter table verification_policy
  add column record_corroborating_evidence boolean not null default false,
  add constraint verification_policy_corroboration_per_skill_only check (not record_corroborating_evidence or assessment_scope = 'per_skill');
comment on column verification_policy.record_corroborating_evidence is
  'ENG-1 P4: per_skill scope only (development-only): a met, verified, claimed skill already at the proposed level records evidence_corroborated + evidence; never a level change.';

alter table verification_decision drop constraint verification_decision_decision_check;
alter table verification_decision add constraint verification_decision_decision_check check (decision in (
  'accepted', 'downgraded', 'rejected', 'escalated_to_human', 'exception_granted', 'not_applicable', 'evidence_reestablished', 'assessment_pending_validation',
  'evidence_corroborated'));

create or replace function verification_decision_corroboration_consistent() returns trigger
  language plpgsql as $$
  declare sa record;
  begin
    if new.decision <> 'evidence_corroborated' then return new; end if;
    if new.skill_assessment_id is null then
      raise exception 'evidence_corroborated exists only in the per-skill pathway (a skill assessment is required)' using errcode = 'check_violation';
    end if;
    select claimed, outcome, basis_independently_verified, proposed_state, current_state into sa from skill_assessment where id = new.skill_assessment_id;
    if not sa.claimed or sa.outcome <> 'met' or not sa.basis_independently_verified or sa.proposed_state is not null then
      raise exception 'evidence_corroborated requires a claimed, met, independently verified skill assessment with no proposal' using errcode = 'check_violation';
    end if;
    if new.previous_state <> new.resulting_state or new.resulting_state <> sa.current_state then
      raise exception 'evidence_corroborated never changes a level (previous = resulting = the skill''s own state)' using errcode = 'check_violation';
    end if;
    if new.evidence_id is null then raise exception 'evidence_corroborated carries the evidence it recorded' using errcode = 'check_violation'; end if;
    return new;
  end $$;
create trigger verification_decision_corroboration_trg before insert on verification_decision
  for each row execute function verification_decision_corroboration_consistent();
