-- ═══════════════════════════════════════════════════════════════════════════
-- 0033 — EXT-1 `integrated_assessment_passed` (INACTIVE development extension; PO "Post-P4 gate", Task C).
--
-- 1. readiness_rule.rule_type gains `integrated_assessment_passed`. It names one activity, never a skill (skill_id null).
-- 2. SEAL: the 0030 seal extended to EXT-1. A readiness rule set containing an EXT-1 or EXT-2 rule:
--      - can never be approved, published, production_active or a baseline (until a separately authorized P6 migration);
--      - becomes development_only only with the explicit, transaction-local opt-in naqla.readiness_ext_dev_activation = 'on',
--        and never when naqla.production = 'on';
--      - and neither rule type can be added to (or re-typed in) a set that is approved, published or not inactive.
-- Params (activity, pinned activity/rubric versions, pass rule PR-1 | PR-2) are validated by the domain and by
-- config-admin against published, non-demo, values-approved content (fail closed). No rule set is created here.
-- Rollback: supabase/rollback/0033_eng1_ext1_integrated_assessment.down.sql (refuses while an EXT-1 rule exists).
-- ═══════════════════════════════════════════════════════════════════════════

alter table readiness_rule drop constraint readiness_rule_rule_type_check;
alter table readiness_rule add constraint readiness_rule_rule_type_check check (rule_type in (
  'required_skill_at_level', 'non_compensable_skill', 'min_skills_at_level', 'all_core_skills_at_level', 'all_skills_at_expected_level',
  'min_evidence_per_skill', 'skill_evidence_path', 'integrated_assessment_passed'));
alter table readiness_rule add constraint readiness_rule_integrated_has_no_skill check (rule_type <> 'integrated_assessment_passed' or skill_id is null);

create or replace function readiness_rule_set_has_sealed_rule(p_set uuid) returns boolean
  language sql stable as $$
    select exists (select 1 from readiness_rule where rule_set_id = p_set and rule_type in ('skill_evidence_path', 'integrated_assessment_passed'))
  $$;
comment on function readiness_rule_set_has_sealed_rule(uuid) is 'ENG-1: the set contains an EXT-1 or EXT-2 rule (sealed until the P6 decision).';

create or replace function readiness_rule_set_evidence_path_seal() returns trigger
  language plpgsql as $$
  begin
    if tg_op = 'INSERT' or not readiness_rule_set_has_sealed_rule(new.id) then return new; end if;
    if new.review_status in ('approved', 'published') or new.activation in ('production_active', 'legacy_baseline') then
      raise exception 'ENG-1: a readiness rule set with an EXT-1 (integrated_assessment_passed) or EXT-2 (skill_evidence_path) rule is sealed: it cannot be approved, published or production-activated before the P6 decision'
        using errcode = 'check_violation';
    end if;
    if new.activation = 'development_only' and old.activation is distinct from 'development_only' then
      if coalesce(current_setting('naqla.production', true), '') = 'on' then
        raise exception 'ENG-1: an EXT-1/EXT-2 readiness rule set can never be activated in production' using errcode = 'insufficient_privilege';
      end if;
      if coalesce(current_setting('naqla.readiness_ext_dev_activation', true), '') <> 'on' then
        raise exception 'ENG-1: an EXT-1/EXT-2 readiness rule set becomes development_only only with the explicit, transaction-local test opt-in naqla.readiness_ext_dev_activation = on'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
    return new;
  end $$;

create or replace function readiness_rule_evidence_path_seal() returns trigger
  language plpgsql as $$
  declare s record;
  begin
    if new.rule_type not in ('skill_evidence_path', 'integrated_assessment_passed') then return new; end if;
    select review_status::text as review_status, activation into s from readiness_rule_set where id = new.rule_set_id;
    if s.review_status in ('approved', 'published') or s.activation <> 'inactive' then
      raise exception 'ENG-1: an EXT-1 or EXT-2 rule can be added only to an inactive, unapproved readiness rule set' using errcode = 'check_violation';
    end if;
    return new;
  end $$;
comment on function readiness_rule_set_evidence_path_seal() is
  'ENG-1 (0030, 0033): EXT-1 and EXT-2 readiness rule sets are development-only (explicit opt-in, never in production) and never approved/production_active until the PO''s P6 decision.';
