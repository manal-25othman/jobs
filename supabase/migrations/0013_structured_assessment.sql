-- 0013 — Structured Assessment + Verification Decision (Configurable Track
-- Architecture, Phase 3).
--
-- Three records that were one before:
--
--   evaluation_result      UNCHANGED. Score, outcome, history (backward compat).
--   assessment             what an EVALUATOR observed: who/what evaluated, which
--                          versions, which inputs, the raw result, per-criterion
--                          structure (evidence used / missing, observations,
--                          gaps, confidence, next action). Never a verdict.
--   verification_decision  what the POLICY decided about an assessment: which
--                          policy and version, previous/proposed/resulting state,
--                          who decided (policy or human — NEVER an llm), reason.
--
-- The policy that decides is a ROW (`verification_policy`), seeded DRAFT / NOT
-- VALIDATED with values that reproduce the behaviour in effect before this
-- migration exactly. Every expert-dependent knob (confidence floor, evidence
-- sufficiency, escalation, blocking rule, per-skill derivation) is a column,
-- null or off in the draft, so an expert later changes a value, not code.
-- The legacy `verification` table keeps being written exactly as before.

-- ───────────────────────────── verification policy (data) ─────────────────────────────
create table verification_policy (
  id                          uuid primary key default gen_random_uuid(),
  key                         text not null check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  version                     int not null check (version >= 1),
  description_en              text not null,
  -- Which evaluation outcomes a verification step applies to (legacy: passed only).
  applies_outcomes            evaluation_outcome[] not null default '{passed}',
  -- Legacy behaviour: accept the state the rubric proposes.
  accept_rubric_proposal      boolean not null default true,
  -- NULL = no cap in the policy (the code invariant D-059/D-102 still caps production at demonstrated).
  max_resulting_state         evidence_state,
  -- Expert-dependent knobs. NULL / off = not in effect (draft = legacy behaviour).
  min_assessment_confidence   numeric(4,3) check (min_assessment_confidence is null or (min_assessment_confidence >= 0 and min_assessment_confidence <= 1)),
  min_independent_evidence    int check (min_independent_evidence is null or min_independent_evidence >= 1),
  escalate_on                 jsonb not null default '{}'::jsonb,
  blocking_rule               text not null default 'mandatory_criteria_unmet_blocks' check (blocking_rule in ('mandatory_criteria_unmet_blocks','threshold_only')),
  per_skill_evidence_derivation boolean not null default false,
  -- Who may decide. An llm is structurally excluded (INV-3): the column cannot even name it.
  decision_actors             text[] not null default '{policy,human}',
  enabled                     boolean not null default true,
  review_status               review_state not null default 'draft',
  approved_by                 text,
  approved_at                 timestamptz,
  validation_note_en          text not null default 'DRAFT / NOT VALIDATED — pending expert validation',
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (key, version),
  constraint verification_policy_escalate_is_object check (jsonb_typeof(escalate_on) = 'object'),
  constraint verification_policy_llm_never_decides check (not ('llm' = any(decision_actors)) and not ('agent' = any(decision_actors))),
  constraint verification_policy_actors_known check (decision_actors <@ array['policy','human']::text[] and cardinality(decision_actors) >= 1),
  constraint verification_policy_approved_is_recorded check (
    review_status not in ('approved','published') or (approved_by is not null and approved_at is not null)
  )
);
create unique index verification_policy_one_enabled_per_key on verification_policy(key) where enabled;
comment on table verification_policy is 'Verification policy as data (Phase 3). The seeded default v1 is DRAFT and equals pre-0013 behaviour exactly. An llm can never be a decision actor.';
create trigger verification_policy_touch before update on verification_policy for each row execute function touch_updated_at();

insert into verification_policy (key, version, description_en)
values ('default', 1, 'DRAFT / NOT VALIDATED — reproduces the behaviour in effect before Phase 3 exactly: a passed evaluation that proposes a higher state is accepted at that state; no confidence floor, no evidence-count floor, no escalation rule, no per-skill derivation.');

-- ───────────────────────────────── assessment ─────────────────────────────────
create table assessment (
  id                      uuid primary key default gen_random_uuid(),
  evaluation_result_id    uuid not null references evaluation_result(id) on delete restrict,
  evaluation_id           uuid not null references evaluation(id) on delete restrict,
  submission_id           uuid not null references submission(id) on delete restrict,
  user_id                 uuid not null references app_user(id) on delete cascade,
  -- rule = deterministic evaluator; human = aggregate incl. human criterion decisions; llm = reserved (no provider is connected).
  evaluator_kind          text not null check (evaluator_kind in ('rule','human','llm')),
  evaluator_ref           text not null,
  rubric_version_id       uuid references rubric_version(id) on delete restrict,
  rubric_version          text,
  activity_spec_id        uuid references activity_spec(id) on delete restrict,
  activity_spec_version   text,
  domain_ruleset_version  text not null,
  context_policy_version  text,
  inputs_used             jsonb not null default '{}'::jsonb,
  raw_result              jsonb not null,
  outcome                 evaluation_outcome not null,
  total_score             numeric(8,3) not null,
  max_score               numeric(8,3) not null,
  confidence              numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at              timestamptz not null default now(),
  unique (evaluation_result_id, evaluator_kind),
  constraint assessment_inputs_is_object check (jsonb_typeof(inputs_used) = 'object'),
  constraint assessment_raw_is_object check (jsonb_typeof(raw_result) = 'object')
);
comment on table assessment is 'What an evaluator observed about a submission (Phase 3): versions, inputs, raw result, confidence. Never a verdict; the verdict is verification_decision.';
create index assessment_submission_idx on assessment(submission_id);

create table assessment_criterion_result (
  id                        uuid primary key default gen_random_uuid(),
  assessment_id             uuid not null references assessment(id) on delete cascade,
  user_id                   uuid not null references app_user(id) on delete cascade,
  criterion_key             text not null,
  criterion_kind            criterion_kind not null default 'skill_evidence',
  skill_id                  uuid references skill(id) on delete restrict,
  status                    text not null check (status in ('met','partially_met','not_met','pending_human','not_applicable')),
  score                     numeric(6,3) not null,
  max_score                 numeric(6,3) not null,
  evidence_used             text[] not null default '{}',
  evidence_missing          text[] not null default '{}',
  observations              text not null,
  strengths                 text[] not null default '{}',
  gaps                      text[] not null default '{}',
  confidence                numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evaluator_kind            text not null check (evaluator_kind in ('rule','human','llm')),
  reason                    text not null,
  recommended_next_action_en text,
  position                  int not null default 0,
  unique (assessment_id, criterion_key)
);

-- Assessments are history: never rewritten, never deleted.
create or replace function assessment_immutable() returns trigger language plpgsql as $$
begin raise exception '% is immutable: a new evaluation produces a new assessment', tg_table_name; end $$;
create trigger assessment_immutable_trg before update or delete on assessment for each row execute function assessment_immutable();
create trigger assessment_criterion_result_immutable_trg before update or delete on assessment_criterion_result for each row execute function assessment_immutable();

-- ───────────────────────────── verification decision ─────────────────────────────
create table verification_decision (
  id                      uuid primary key default gen_random_uuid(),
  assessment_id           uuid not null references assessment(id) on delete restrict,
  evaluation_result_id    uuid not null references evaluation_result(id) on delete restrict,
  user_id                 uuid not null references app_user(id) on delete cascade,
  skill_id                uuid not null references skill(id) on delete restrict,
  policy_id               uuid not null references verification_policy(id) on delete restrict,
  policy_key              text not null,
  policy_version          int not null,
  policy_status           review_state not null,
  domain_ruleset_version  text not null,
  -- Who decided. Structurally: policy or human. Never an llm, never an agent.
  decided_by_kind         text not null check (decided_by_kind in ('policy','human')),
  decided_by_ref          text,
  decision                text not null check (decision in ('accepted','downgraded','rejected','escalated_to_human','exception_granted','not_applicable','evidence_reestablished')),
  previous_state          evidence_state not null,
  proposed_state          evidence_state,
  resulting_state         evidence_state not null,
  confidence              numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  reason                  text not null check (length(btrim(reason)) > 0),
  human_override_of       uuid references verification_decision(id) on delete restrict,
  verification_id         uuid references verification(id) on delete restrict,
  evidence_id             uuid references evidence(id) on delete restrict,
  decided_at              timestamptz not null default now(),
  -- Verification lowers or holds. It never raises above the proposal, and never below the previous state (v1: no backward movement).
  constraint verification_decision_never_raises check (proposed_state is null or evidence_ordinal(resulting_state) <= evidence_ordinal(proposed_state)),
  constraint verification_decision_never_demotes check (evidence_ordinal(resulting_state) >= evidence_ordinal(previous_state)),
  constraint verification_decision_human_has_ref check (decided_by_kind <> 'human' or decided_by_ref is not null),
  constraint verification_decision_override_is_human check (human_override_of is null or decided_by_kind = 'human')
);
comment on table verification_decision is 'A policy''s (or a named human''s) decision about an assessment (Phase 3). Records the policy and ruleset versions. An llm can never decide. Immutable; a human override is a NEW row that points at the one it overrides.';
create index verification_decision_user_skill_idx on verification_decision(user_id, skill_id);
create trigger verification_decision_immutable_trg before update or delete on verification_decision for each row execute function assessment_immutable();

-- ───────────────────────────────── RLS ─────────────────────────────────
alter table verification_policy          enable row level security; alter table verification_policy          force row level security;
alter table assessment                   enable row level security; alter table assessment                   force row level security;
alter table assessment_criterion_result  enable row level security; alter table assessment_criterion_result  force row level security;
alter table verification_decision        enable row level security; alter table verification_decision        force row level security;

grant select on verification_policy to anon, authenticated;
grant select, insert, update, delete on verification_policy to service_role;
grant select, insert, update, delete on assessment, assessment_criterion_result, verification_decision to authenticated, service_role;
grant select on assessment, assessment_criterion_result, verification_decision to anon;

create policy verification_policy_read on verification_policy for select to anon, authenticated using (true);
-- The owner reads assessments and decisions about their own work. Only the pipeline writes them (service role).
create policy assessment_select_own on assessment for select to authenticated using (user_id = auth.uid());
create policy assessment_criterion_result_select_own on assessment_criterion_result for select to authenticated using (user_id = auth.uid());
create policy verification_decision_select_own on verification_decision for select to authenticated using (user_id = auth.uid());

-- ───────────────────────────── backfill (additive) ─────────────────────────────
-- Every historical evaluation_result becomes an assessment (rule) with its
-- criterion scores, and every historical verification becomes a decision under
-- the draft default policy (which equals the behaviour that produced it).
-- Results with no verification get an explicit not_applicable decision when a
-- claimed skill is known. Nothing historical is rewritten.
insert into assessment (evaluation_result_id, evaluation_id, submission_id, user_id, evaluator_kind, evaluator_ref, rubric_version_id, rubric_version,
                        activity_spec_id, activity_spec_version, domain_ruleset_version, inputs_used, raw_result, outcome, total_score, max_score, confidence, created_at)
select r.id, r.evaluation_id, r.submission_id, r.user_id, 'rule', 'backfill:0013 (pre-0013 deterministic evaluator)', r.rubric_version_id, rv.version,
       r.activity_spec_id, r.activity_spec_version, 'pre-0.10.0',
       jsonb_build_object('backfilled', true),
       jsonb_build_object('backfilled', true, 'outcome', r.outcome,
         'criteria', coalesce((select jsonb_agg(jsonb_build_object('key', s.criterion_key, 'score', s.score, 'maxScore', s.max_score) order by s.criterion_key) from evaluation_criterion_score s where s.evaluation_result_id = r.id), '[]'::jsonb),
         'integrityChecks', coalesce((select jsonb_agg(jsonb_build_object('key', i.check_key, 'passed', i.passed) order by i.check_key) from integrity_check i where i.evaluation_result_id = r.id), '[]'::jsonb)),
       r.outcome,
       coalesce((select sum(s.score) from evaluation_criterion_score s where s.evaluation_result_id = r.id), 0),
       coalesce((select sum(s.max_score) from evaluation_criterion_score s where s.evaluation_result_id = r.id), 0),
       null, r.evaluated_at
  from evaluation_result r left join rubric_version rv on rv.id = r.rubric_version_id;

insert into assessment_criterion_result (assessment_id, user_id, criterion_key, criterion_kind, skill_id, status, score, max_score, observations, confidence, evaluator_kind, reason, position)
select a.id, a.user_id, s.criterion_key, coalesce(rc.criterion_kind, 'skill_evidence'), s.skill_id,
       case when s.score >= s.max_score then 'met' when s.score > 0 then 'partially_met' else 'not_met' end,
       s.score, s.max_score, s.rationale, s.confidence, 'rule', 'backfilled from evaluation_criterion_score (0013)', coalesce(rc.position, 0)
  from assessment a
  join evaluation_criterion_score s on s.evaluation_result_id = a.evaluation_result_id
  left join rubric_criterion rc on rc.rubric_version_id = a.rubric_version_id and rc.key = s.criterion_key
 where a.evaluator_ref like 'backfill:0013%';

insert into verification_decision (assessment_id, evaluation_result_id, user_id, skill_id, policy_id, policy_key, policy_version, policy_status, domain_ruleset_version,
                                   decided_by_kind, decided_by_ref, decision, previous_state, proposed_state, resulting_state, reason, verification_id, evidence_id, decided_at)
select a.id, v.evaluation_result_id, v.user_id,
       coalesce((select e.skill_id from evidence e where e.evaluation_result_id = v.evaluation_result_id limit 1),
                (select canonical_skill_id(scs.skill_id) from submission_claimed_skill scs where scs.submission_id = a.submission_id limit 1)),
       p.id, p.key, p.version, p.review_status, 'pre-0.10.0',
       case when v.human_reviewer_id is null then 'policy' else 'human' end,
       case when v.human_reviewer_id is null then 'backfill:0013' else 'backfill:0013 reviewer ' || v.human_reviewer_id::text end,
       v.outcome::text,
       -- previous = resulting when accepted-from-below is unknowable; the ladder forbids demotion so this is the safe floor.
       case when v.outcome = 'accepted' then coalesce((select t.from_state from evidence_transition t where t.evaluation_result_id = v.evaluation_result_id limit 1), v.resulting_state) else v.resulting_state end,
       v.proposed_state, v.resulting_state, v.reason, v.id,
       (select e.id from evidence e where e.evaluation_result_id = v.evaluation_result_id limit 1), v.decided_at
  from verification v
  join assessment a on a.evaluation_result_id = v.evaluation_result_id and a.evaluator_ref like 'backfill:0013%'
  cross join (select id, key, version, review_status from verification_policy where key = 'default' and enabled) p;
