-- 0010 — Frontend pack final content review preparation.
--   OPEN-039  canonical skill + alias: no schema change; a resolver function for lookups.
--   OPEN-044  criterion kinds: a gate/quality criterion names no skill and never yields evidence.
--   OPEN-045  integrity check evaluation modes; the mandatory-deliverables gate type.
--   Test 12   a proposed/TBD value cannot silently become approved.

-- ───────────────────────── OPEN-039: alias resolution ─────────────────────────
-- Follows merged_into to the canonical skill. The alias row keeps its id and every
-- historical reference (evidence, claims, scores) untouched; only NEW lookups resolve.
create or replace function canonical_skill_id(p_skill uuid) returns uuid language sql stable as $$
  with recursive chain as (
    select id, merged_into_id, status, 0 as depth from skill where id = p_skill
    union all
    select s.id, s.merged_into_id, s.status, c.depth + 1 from chain c join skill s on s.id = c.merged_into_id
     where c.status = 'merged_into' and c.depth < 5
  )
  select coalesce((select id from chain order by depth desc limit 1), p_skill)
$$;
comment on function canonical_skill_id(uuid) is 'OPEN-039 / D-097: alias → canonical. Historical rows are never rewritten; lookups resolve.';

-- ───────────────────────── OPEN-044: criterion kinds ──────────────────────────
create type criterion_kind as enum ('skill_evidence', 'gate', 'quality');
alter table rubric_criterion
  add column criterion_kind criterion_kind not null default 'skill_evidence';
comment on column rubric_criterion.criterion_kind is
  'OPEN-044 / D-098: only skill_evidence may feed skill evidence. gate = completeness/admissibility (may block, never evidence); quality = whole-submission quality, never evidence.';
alter table rubric_criterion alter column linked_skill_id drop not null;
alter table rubric_criterion alter column threshold_status drop not null;
-- Existing completeness criteria are gates: unmap them from the skill they were forced onto.
update rubric_criterion rc set criterion_kind = 'gate', linked_skill_id = null, threshold_for_skill = null, threshold_status = null
 where rc.dimension = 'completeness'
   and exists (select 1 from criterion_library l where l.id = rc.library_criterion_id and l.key = 'core.completeness.deliverables');
alter table rubric_criterion add constraint rubric_criterion_kind_shape check (
  (criterion_kind = 'skill_evidence' and linked_skill_id is not null and threshold_status is not null)
  or (criterion_kind <> 'skill_evidence' and linked_skill_id is null and threshold_for_skill is null and threshold_status is null)
);
comment on constraint rubric_criterion_kind_shape on rubric_criterion is
  'A skill-evidence criterion names its skill; a gate/quality criterion names none and has no skill threshold (OPEN-044).';

-- ───────────────────────── OPEN-045: evaluation modes ─────────────────────────
create type integrity_evaluation_mode as enum ('deterministic', 'human_observable', 'future_deterministic');
alter table integrity_check_spec
  add column evaluation_mode      integrity_evaluation_mode not null default 'deterministic',
  add column active               boolean not null default true,
  add column required_producer_en text;
comment on column integrity_check_spec.evaluation_mode is
  'OPEN-045 / D-099: deterministic = a rule over artifacts a producer creates; human_observable = an input to the linked human criterion; future_deterministic = registered, inactive, needs a producer.';
alter table integrity_check_spec add constraint integrity_check_mode_shape check (
  (evaluation_mode = 'deterministic')
  or (evaluation_mode = 'human_observable' and linked_criterion_key is not null and blocking = false and active = true and check_definition->>'type' = 'human_observation')
  or (evaluation_mode = 'future_deterministic' and active = false and blocking = false and required_producer_en is not null)
);
-- The user-facing gate type (see 0009) joins the classification rule.
alter table integrity_check_spec drop constraint integrity_check_type_matches_classification;
alter table integrity_check_spec add constraint integrity_check_type_matches_classification check (
  check_type is null
  or (classification = 'user_facing' and check_type in ('clarification_question','explanation_question','followup_modification','mandatory_deliverables'))
  or (classification = 'assessment_only' and check_type in ('planted_inconsistency','deterministic_signal','edge_case','output_consistency','expected_failure_mode'))
);
update integrity_check_spec set check_type = 'mandatory_deliverables' where key = 'files_present' and check_type = 'followup_modification';

-- ───────────── Test 12: no proposed/TBD value silently becomes approved ─────────────
alter table rubric_version
  add column values_approved_by       uuid,
  add column values_approved_by_label text,
  add column values_approved_at       timestamptz,
  add column values_approval_reason   text;
comment on column rubric_version.values_approved_at is
  'OPEN-043: the one recorded SME act that lets weight/threshold statuses become approved. Without it, approved is refused at the row.';
create or replace function rubric_value_status_guard() returns trigger language plpgsql as $$
declare rv record;
begin
  if tg_table_name = 'rubric_criterion' then
    if new.weight_status <> 'approved' and coalesce(new.threshold_status, 'TBD') <> 'approved' then return new; end if;
    select is_demo_fixture, values_approved_by, values_approved_at into rv from rubric_version where id = new.rubric_version_id;
  else
    if new.pass_threshold_status <> 'approved' then return new; end if;
    rv := new;
  end if;
  if rv.is_demo_fixture then
    raise exception 'a DEMO fixture never carries an approved weight or threshold (%)', tg_table_name;
  end if;
  if rv.values_approved_by is null or rv.values_approved_at is null then
    raise exception 'a value becomes approved only through a recorded SME approval on its rubric (values_approved_by/at are empty) — OPEN-043';
  end if;
  return new;
end $$;
create trigger rubric_criterion_value_status_guard before insert or update on rubric_criterion for each row execute function rubric_value_status_guard();
create trigger rubric_version_value_status_guard before insert or update on rubric_version for each row execute function rubric_value_status_guard();
