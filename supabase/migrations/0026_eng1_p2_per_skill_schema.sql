-- ═══════════════════════════════════════════════════════════════════════════
-- 0026 — ENG-1 P2: additive, INACTIVE schema for per-skill assessment records.
--
-- What it adds:
--   skill_assessment            immutable per-skill outcome + versioned evaluation context
--   skill_assessment_criterion  the exact criterion results each skill outcome rests on
--   verification_decision.skill_assessment_id   decision provenance (nullable; legacy rows stay null)
--   evidence.skill_assessment_id                evidence provenance (nullable; legacy rows stay null)
--   verification_policy.assessment_scope        'primary_claimed_skill' (today, the default for every row)
--                                               | 'per_skill' (SEALED: cannot be active, see below)
--   evidence uniqueness: one platform evidence row per (evaluation result, skill)  (F-10)
--
-- What it does NOT do:
--   * no existing row is modified (new columns are null / defaulted; nothing is backfilled);
--   * nothing reads or writes the new tables in any service (P3 is not implemented);
--   * no policy is activated. A per_skill policy row can exist only INACTIVE: the check
--     `verification_policy_per_skill_sealed` refuses any other activation. Lifting the seal is a
--     future, separately approved migration (P3/P6), never a configuration change.
--   * H6 stays off and is structurally exclusive with per_skill.
--
-- Pre-check: the new evidence uniqueness is verified against existing rows first; on any duplicate
-- the migration aborts with a report and changes nothing (no row is ever deleted to make it fit).
--
-- Rollback: supabase/rollback/0026_eng1_p2_per_skill_schema.down.sql (refuses while per-skill rows exist).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────── pre-check ──────────────────────────────────
do $$
declare dup record; n int := 0;
begin
  for dup in
    select evaluation_result_id, skill_id, count(*) as c from evidence
     where source_strength = 'platform_controlled' and evaluation_result_id is not null
     group by 1, 2 having count(*) > 1 limit 20
  loop
    n := n + 1;
    raise warning 'duplicate platform evidence: evaluation_result % skill % (% rows)', dup.evaluation_result_id, dup.skill_id, dup.c;
  end loop;
  if n > 0 then
    raise exception '0026 aborted: % (evaluation_result, skill) pair(s) already carry more than one platform evidence row; resolve by review, never by deletion', n;
  end if;
end $$;

-- ───────────────────────────── policy scope ─────────────────────────────────
alter table verification_policy
  add column assessment_scope text not null default 'primary_claimed_skill'
    constraint verification_policy_assessment_scope_check check (assessment_scope in ('primary_claimed_skill', 'per_skill')),
  add constraint verification_policy_scope_excludes_h6 check (not (assessment_scope = 'per_skill' and per_skill_evidence_derivation)),
  add constraint verification_policy_per_skill_sealed check (assessment_scope <> 'per_skill' or activation = 'inactive');

comment on column verification_policy.assessment_scope is
  'ENG-1: which skills a decision may move. primary_claimed_skill = the legacy path (one explicitly attributed skill, ENG-1 P0). per_skill = one decision per skill from its own criteria (P1 domain); SEALED inactive by verification_policy_per_skill_sealed until a separately approved migration.';
comment on constraint verification_policy_per_skill_sealed on verification_policy is
  'ENG-1 P2: the per-skill pathway is schema-only. No per_skill policy can be development_only, production_active or a baseline.';

-- ──────────────────────────── skill_assessment ──────────────────────────────
create table skill_assessment (
  id                        uuid primary key default gen_random_uuid(),
  assessment_id             uuid not null references assessment(id) on delete restrict,
  evaluation_result_id      uuid not null references evaluation_result(id) on delete restrict,
  user_id                   uuid not null references app_user(id) on delete cascade,
  skill_id                  uuid not null references skill(id) on delete restrict,
  -- Versioned evaluation context.
  model_version             text not null check (model_version ~ '^per_skill@[0-9]+$'),
  domain_ruleset_version    text not null check (length(btrim(domain_ruleset_version)) > 0),
  rubric_version_id         uuid not null references rubric_version(id) on delete restrict,
  rubric_version            text not null,
  activity_spec_id          uuid not null references activity_spec(id) on delete restrict,
  activity_spec_version     text not null,
  rubric_resolution         text not null check (rubric_resolution in ('bound', 'legacy_unbound_single')),
  track_config_version_id   uuid references track_config_version(id) on delete restrict,
  -- Outcome.
  claimed                   boolean not null,
  outcome                   text not null check (outcome in ('met', 'not_met', 'incomplete', 'not_assessed', 'blocked')),
  basis_independently_verified boolean not null,
  basis_reasons             text[] not null default '{}',
  confidence                numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  current_state             evidence_state not null,
  proposed_state            evidence_state,
  reason                    text not null check (length(btrim(reason)) > 0),
  created_at                timestamptz not null default now(),
  constraint skill_assessment_one_per_skill unique (assessment_id, skill_id),
  constraint skill_assessment_proposal_only_when_met check (proposed_state is null or outcome = 'met'),
  constraint skill_assessment_never_proposes_verified check (proposed_state is null or proposed_state <> 'verified'),
  constraint skill_assessment_proposal_above_own_state check (proposed_state is null or evidence_ordinal(proposed_state) > evidence_ordinal(current_state)),
  constraint skill_assessment_verified_basis_has_no_reasons check (not basis_independently_verified or cardinality(basis_reasons) = 0)
);
comment on table skill_assessment is
  'ENG-1 P2 (INACTIVE): one skill''s outcome from ONE evaluation, derived only from that skill''s own criteria (domain per-skill-assessment, per_skill@1). Immutable. No service writes it yet.';
create index skill_assessment_user_skill_idx on skill_assessment(user_id, skill_id);
create index skill_assessment_result_idx on skill_assessment(evaluation_result_id);

create table skill_assessment_criterion (
  skill_assessment_id             uuid not null references skill_assessment(id) on delete restrict,
  assessment_criterion_result_id  uuid not null references assessment_criterion_result(id) on delete restrict,
  user_id                         uuid not null references app_user(id) on delete cascade,
  criterion_key                   text not null,
  status                          text not null check (status in ('met', 'not_met', 'pending', 'threshold_unapproved')),
  score                           numeric,
  max_score                       numeric not null check (max_score > 0),
  threshold                       numeric(4,3) check (threshold is null or (threshold > 0 and threshold <= 1)),
  threshold_status                text,
  primary key (skill_assessment_id, criterion_key),
  constraint skill_assessment_criterion_once unique (skill_assessment_id, assessment_criterion_result_id),
  constraint skill_assessment_criterion_met_has_approved_threshold check (status <> 'met' or (threshold is not null and threshold_status = 'approved' and score is not null))
);
comment on table skill_assessment_criterion is
  'ENG-1 P2 (INACTIVE): the exact criterion results (with the threshold and value status used) a skill_assessment rests on. Recorded with its assessment, in the same transaction; immutable.';

-- Consistency of a skill_assessment with its assessment (same user, result, rubric, activity version; canonical skill).
create or replace function skill_assessment_consistent() returns trigger
  language plpgsql as $$
  declare a record;
  begin
    select user_id, evaluation_result_id, rubric_version_id, activity_spec_id, activity_spec_version into a from assessment where id = new.assessment_id;
    if a.user_id is distinct from new.user_id then raise exception 'skill_assessment: user does not match its assessment'; end if;
    if a.evaluation_result_id is distinct from new.evaluation_result_id then raise exception 'skill_assessment: evaluation result does not match its assessment'; end if;
    if a.rubric_version_id is distinct from new.rubric_version_id or a.activity_spec_id is distinct from new.activity_spec_id
       or a.activity_spec_version is distinct from new.activity_spec_version then
      raise exception 'skill_assessment: evaluation context (rubric / activity version) does not match its assessment';
    end if;
    if canonical_skill_id(new.skill_id) <> new.skill_id then raise exception 'skill_assessment: skill must be canonical (OPEN-039)'; end if;
    return new;
  end $$;
create trigger skill_assessment_consistent_trg before insert on skill_assessment for each row execute function skill_assessment_consistent();

-- Outcome ↔ criteria, checked at commit (criteria are inserted after their assessment, same transaction).
create or replace function skill_assessment_outcome_consistent() returns trigger
  language plpgsql as $$
  declare n int; n_met int;
  begin
    select count(*), count(*) filter (where status = 'met') into n, n_met from skill_assessment_criterion where skill_assessment_id = new.id;
    if new.outcome = 'met' and (n = 0 or n_met <> n) then raise exception 'skill_assessment %: met requires every recorded criterion met (% of %)', new.id, n_met, n; end if;
    if new.outcome = 'not_assessed' and n > 0 then raise exception 'skill_assessment %: not_assessed cannot cite criteria', new.id; end if;
    if new.outcome in ('not_met', 'incomplete') and n = 0 then raise exception 'skill_assessment %: % must cite the criteria it rests on', new.id, new.outcome; end if;
    return null;
  end $$;
create constraint trigger skill_assessment_outcome_consistent_trg after insert on skill_assessment
  deferrable initially deferred for each row execute function skill_assessment_outcome_consistent();

-- A criterion row belongs to the same assessment, user and (canonical) skill, and is recorded with its parent.
create or replace function skill_assessment_criterion_consistent() returns trigger
  language plpgsql as $$
  declare sa record; cr record;
  begin
    select assessment_id, user_id, skill_id, created_at into sa from skill_assessment where id = new.skill_assessment_id;
    select assessment_id, user_id, skill_id, criterion_key, criterion_kind into cr from assessment_criterion_result where id = new.assessment_criterion_result_id;
    if sa.created_at <> now() then raise exception 'skill_assessment_criterion: criteria are recorded with their skill assessment, never later'; end if;
    if cr.assessment_id <> sa.assessment_id then raise exception 'skill_assessment_criterion: criterion result belongs to another assessment'; end if;
    if cr.user_id <> sa.user_id or new.user_id <> sa.user_id then raise exception 'skill_assessment_criterion: user mismatch'; end if;
    if cr.criterion_key <> new.criterion_key then raise exception 'skill_assessment_criterion: criterion key mismatch'; end if;
    if coalesce(cr.criterion_kind::text, 'skill_evidence') <> 'skill_evidence' or cr.skill_id is null or canonical_skill_id(cr.skill_id) <> sa.skill_id then
      raise exception 'skill_assessment_criterion: criterion % does not measure this skill', new.criterion_key;
    end if;
    return new;
  end $$;
create trigger skill_assessment_criterion_consistent_trg before insert on skill_assessment_criterion for each row execute function skill_assessment_criterion_consistent();

create trigger skill_assessment_immutable_trg before update or delete on skill_assessment for each row execute function assessment_immutable();
create trigger skill_assessment_criterion_immutable_trg before update or delete on skill_assessment_criterion for each row execute function assessment_immutable();

-- ───────────────────────── decision provenance ──────────────────────────────
alter table verification_decision add column skill_assessment_id uuid references skill_assessment(id) on delete restrict;
comment on column verification_decision.skill_assessment_id is
  'ENG-1 P2 (INACTIVE): the per-skill assessment this decision rests on. Null for every legacy decision (primary_claimed_skill scope).';
create unique index verification_decision_one_per_skill_assessment on verification_decision(skill_assessment_id)
  where skill_assessment_id is not null and human_override_of is null;

create or replace function verification_decision_skill_assessment_consistent() returns trigger
  language plpgsql as $$
  declare sa record;
  begin
    if new.skill_assessment_id is null then return new; end if;
    select assessment_id, evaluation_result_id, user_id, skill_id, outcome, current_state, proposed_state, basis_independently_verified into sa
      from skill_assessment where id = new.skill_assessment_id;
    if sa.assessment_id <> new.assessment_id or sa.evaluation_result_id <> new.evaluation_result_id or sa.user_id <> new.user_id or sa.skill_id <> new.skill_id then
      raise exception 'verification_decision: skill assessment belongs to another assessment, result, user or skill';
    end if;
    if new.previous_state <> sa.current_state then raise exception 'verification_decision: previous state must be the skill''s own state at assessment'; end if;
    if new.decision = 'accepted' and (sa.outcome <> 'met' or not sa.basis_independently_verified or sa.proposed_state is null) then
      raise exception 'verification_decision: accepted requires a met, independently verified skill assessment with a proposal';
    end if;
    return new;
  end $$;
create trigger verification_decision_skill_assessment_trg before insert on verification_decision
  for each row execute function verification_decision_skill_assessment_consistent();

-- ───────────────────────── evidence provenance ──────────────────────────────
alter table evidence add column skill_assessment_id uuid references skill_assessment(id) on delete restrict;
comment on column evidence.skill_assessment_id is
  'ENG-1 P2 (INACTIVE): the per-skill assessment this evidence was earned on. Null for every legacy row. Set only at insert; immutable.';
create unique index evidence_one_per_skill_assessment on evidence(skill_assessment_id) where skill_assessment_id is not null;
-- F-10: at most one platform evidence row per (evaluation result, skill), whatever path wrote it.
create unique index evidence_one_platform_row_per_result_skill on evidence(evaluation_result_id, skill_id)
  where source_strength = 'platform_controlled' and evaluation_result_id is not null;

create or replace function evidence_skill_assessment_guard() returns trigger
  language plpgsql as $$
  declare sa record;
  begin
    if tg_op = 'UPDATE' then
      if new.skill_assessment_id is distinct from old.skill_assessment_id then
        raise exception 'evidence.skill_assessment_id is set at insert and immutable';
      end if;
      return new;
    end if;
    if new.skill_assessment_id is null then return new; end if;
    select user_id, skill_id, evaluation_result_id, outcome, basis_independently_verified into sa from skill_assessment where id = new.skill_assessment_id;
    if sa.user_id <> new.user_id or sa.skill_id <> new.skill_id or sa.evaluation_result_id is distinct from new.evaluation_result_id then
      raise exception 'evidence: skill assessment belongs to another user, skill or result';
    end if;
    if sa.outcome <> 'met' or not sa.basis_independently_verified then
      raise exception 'evidence: only a met, independently verified skill assessment can carry evidence';
    end if;
    return new;
  end $$;
create trigger evidence_skill_assessment_guard_trg before insert or update on evidence
  for each row execute function evidence_skill_assessment_guard();

-- ─────────────────────────────────── RLS ────────────────────────────────────
alter table skill_assessment enable row level security;           alter table skill_assessment force row level security;
alter table skill_assessment_criterion enable row level security; alter table skill_assessment_criterion force row level security;
grant select on skill_assessment, skill_assessment_criterion to authenticated;
grant select, insert on skill_assessment, skill_assessment_criterion to service_role;
create policy skill_assessment_select_own on skill_assessment for select to authenticated using (user_id = auth.uid());
create policy skill_assessment_criterion_select_own on skill_assessment_criterion for select to authenticated using (user_id = auth.uid());
-- No insert/update/delete policy for any client role: only the service writes, and nothing is ever rewritten.
