-- 0012 — Skill Status Model (Configurable Track Architecture, Phase 2).
--
-- Two SEPARATE dimensions per (user, skill):
--
--   verification level   skill_claim.state — gap → self_reported → practiced →
--                        demonstrated → verified. Written by the evaluation
--                        pipeline only (INV-1). UNCHANGED by this migration.
--
--   journey / progress   skill_progress.state_code — where the user is on the
--                        road for this skill (not started, in progress,
--                        submitted, under review, needs more evidence,
--                        evidence recorded …). Moved by EVENTS through
--                        transition RULES that are DATA, not code.
--
-- Nothing here is a verification: completing an activity moves progress, never
-- the claim. The states, the triggers and every transition rule are rows,
-- seeded DRAFT / NOT VALIDATED, and a rule becomes approved only through a
-- recorded approver. A progress state code can never be an evidence-level code.

-- ───────────────────────────── states (data) ─────────────────────────────
create table skill_progress_state (
  code               text primary key check (code ~ '^[a-z][a-z0-9_]{2,63}$'),
  label_ar           text not null,
  label_en           text not null,
  description_en     text not null,
  display_order      int not null default 0,
  is_initial         boolean not null default false,
  enabled            boolean not null default true,
  review_status      review_state not null default 'draft',
  approved_by        text,
  approved_at        timestamptz,
  validation_note_en text not null default 'DRAFT / NOT VALIDATED — pending expert validation',
  version            int not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- The journey vocabulary must never be confused with the verification ladder.
  constraint skill_progress_state_not_an_evidence_level check (code not in ('gap','self_reported','practiced','demonstrated','verified')),
  constraint skill_progress_state_approved_is_recorded check (
    review_status not in ('approved','published') or (approved_by is not null and approved_at is not null)
  )
);
create unique index skill_progress_state_one_initial on skill_progress_state(is_initial) where is_initial and enabled;
comment on table skill_progress_state is 'Journey states of a skill (Phase 2). Data, not enum. Separate from skill_claim.state (verification level). Seeded rows are DRAFT / NOT VALIDATED.';
create trigger skill_progress_state_touch before update on skill_progress_state for each row execute function touch_updated_at();

insert into skill_progress_state (code, label_ar, label_en, description_en, display_order, is_initial) values
  ('not_started',         'لم تبدأ',                      'Not started',          'No work on this skill has been recorded yet.',                                   10, true),
  ('in_progress',         'قيد العمل',                    'In progress',          'A project or material linked to this skill exists; nothing submitted yet.',       20, false),
  ('submitted',           'مُسلَّمة بانتظار التقييم',     'Submitted',            'Work claiming this skill is locked and awaits (or is in) deterministic evaluation.', 30, false),
  ('under_review',        'قيد المراجعة البشرية',         'Under human review',   'Judgement criteria of the latest submission are with a human reviewer.',          40, false),
  ('needs_more_evidence', 'تحتاج دليلًا إضافيًا',         'Needs more evidence',  'The latest evaluation did not produce evidence, or evidence was withdrawn; another attempt or more material is needed.', 50, false),
  ('evidence_recorded',   'سُجِّل دليل مُقيَّم',          'Evidence recorded',    'An evaluation produced an evaluated fact for this skill. This is a journey milestone, NOT a verification level.', 60, false);

-- ───────────────────────────── triggers (data) ─────────────────────────────
-- An event the product emits. `active = false` registers a trigger that has no
-- producer yet (same pattern as OPEN-045 future_deterministic checks).
create table skill_progress_trigger (
  code           text primary key check (code ~ '^[a-z][a-z0-9_.]{2,63}$'),
  label_en       text not null,
  description_en text not null,
  producer_en    text not null,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
insert into skill_progress_trigger (code, label_en, description_en, producer_en, active) values
  ('project.created',             'Project created',             'A platform-activity project linked to the skill was created.',           'CareerService.createProject (activity_skill rows)', true),
  ('evidence_item.added',         'Material added',              'The user added or linked material to the skill (evidence ledger).',      'EvidenceService.createItem / linkSkills', true),
  ('submission.created',          'Submission created',          'A submission claiming the skill was locked.',                            'SubmissionService.createSubmission', true),
  ('evaluation.queued_for_human', 'Evaluation queued for human', 'Deterministic stage done; judgement criteria queued for a reviewer.',    'EvaluationService.evaluateSubmission', true),
  ('evaluation.completed',        'Evaluation completed',        'An evaluation concluded (facts: outcome, produced_evidence).',          'EvaluationService.evaluateSubmission / finalizeHumanReview', true),
  ('evidence.withdrawn',          'Evidence withdrawn',          'The user withdrew evaluated evidence (facts: standing_evidence_count).', 'WithdrawalService.withdraw', true),
  ('more_evidence.requested',     'More evidence requested',     'A reviewer or policy asked for more evidence. No producer yet.',         'none yet — registered for a later phase', false),
  ('history.backfill',            'History backfill',            'State derived from pre-0012 history by migration.',                      'migration 0012 only', false);

-- ───────────────────────────── transition rules (data) ─────────────────────────────
-- `guard` is a small declarative predicate over the event facts:
--   {"outcome": "passed"}  {"outcome": {"not": "passed"}}  {"standing_evidence_count": 0}  {"depth": {"in": ["primary","secondary"]}}
-- The domain evaluates it; nothing is interpreted in SQL.
create table skill_progress_transition (
  id                 uuid primary key default gen_random_uuid(),
  from_state         text not null references skill_progress_state(code) on delete restrict,
  to_state           text not null references skill_progress_state(code) on delete restrict,
  trigger_code       text not null references skill_progress_trigger(code) on delete restrict,
  guard              jsonb not null default '{}'::jsonb,
  rationale_en       text not null,
  enabled            boolean not null default true,
  version            int not null default 1,
  review_status      review_state not null default 'draft',
  approved_by        text,
  approved_at        timestamptz,
  validation_note_en text not null default 'DRAFT / NOT VALIDATED — pending expert validation',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint skill_progress_transition_moves check (from_state <> to_state),
  constraint skill_progress_transition_guard_is_object check (jsonb_typeof(guard) = 'object'),
  constraint skill_progress_transition_approved_is_recorded check (
    review_status not in ('approved','published') or (approved_by is not null and approved_at is not null)
  ),
  unique (from_state, to_state, trigger_code, version)
);
comment on table skill_progress_transition is 'Journey transition rules (Phase 2). Rows, versioned, DRAFT until a named expert approves. The domain picks the single enabled rule matching (from, trigger, guard); two matches is a data error.';
create trigger skill_progress_transition_touch before update on skill_progress_transition for each row execute function touch_updated_at();

insert into skill_progress_transition (from_state, to_state, trigger_code, guard, rationale_en) values
  ('not_started',         'in_progress',         'project.created',             '{}',                                 'Starting a project linked to the skill is the first step of the journey.'),
  ('not_started',         'in_progress',         'evidence_item.added',         '{}',                                 'Adding material to a skill shows work has begun.'),
  ('not_started',         'submitted',           'submission.created',          '{}',                                 'A submission can be the first recorded step.'),
  ('in_progress',         'submitted',           'submission.created',          '{}',                                 'Work was submitted for evaluation.'),
  ('needs_more_evidence', 'submitted',           'submission.created',          '{}',                                 'A new attempt after more evidence was needed.'),
  ('evidence_recorded',   'submitted',           'submission.created',          '{}',                                 'A further attempt re-enters evaluation; the verification level is untouched.'),
  ('submitted',           'under_review',        'evaluation.queued_for_human', '{}',                                 'Judgement criteria are with a reviewer.'),
  ('submitted',           'evidence_recorded',   'evaluation.completed',        '{"produced_evidence": true}',        'The evaluation produced an evaluated fact.'),
  ('under_review',        'evidence_recorded',   'evaluation.completed',        '{"produced_evidence": true}',        'Human review concluded and evidence was produced.'),
  ('submitted',           'needs_more_evidence', 'evaluation.completed',        '{"produced_evidence": false}',       'The evaluation concluded without producing evidence.'),
  ('under_review',        'needs_more_evidence', 'evaluation.completed',        '{"produced_evidence": false}',       'Human review concluded without producing evidence.'),
  ('evidence_recorded',   'needs_more_evidence', 'evidence.withdrawn',          '{"standing_evidence_count": 0}',     'The last standing evidence was withdrawn.'),
  ('evidence_recorded',   'needs_more_evidence', 'more_evidence.requested',     '{}',                                 'A reviewer or policy asked for more (trigger has no producer yet).'),
  ('submitted',           'needs_more_evidence', 'more_evidence.requested',     '{}',                                 'A reviewer or policy asked for more (trigger has no producer yet).');

-- ───────────────────────────── progress rows ─────────────────────────────
create table skill_progress (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references app_user(id) on delete cascade,
  skill_id           uuid not null references skill(id) on delete restrict,
  target_role_id     uuid references target_role(id) on delete restrict,
  state_code         text not null references skill_progress_state(code) on delete restrict,
  reason             text not null,
  last_trigger_code  text references skill_progress_trigger(code) on delete restrict,
  last_event_at      timestamptz,
  transition_rule_id uuid references skill_progress_transition(id) on delete restrict,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, skill_id)
);
comment on table skill_progress is 'Journey state per (user, skill). Separate from skill_claim; moved only by the progress engine through data rules. Never a verification.';
create index skill_progress_user_idx on skill_progress(user_id);
create trigger skill_progress_touch before update on skill_progress for each row execute function touch_updated_at();

-- APPEND-ONLY event log: every emitted trigger is recorded, applied or not.
create table skill_progress_event (
  id                 uuid primary key default gen_random_uuid(),
  skill_progress_id  uuid not null references skill_progress(id) on delete cascade,
  user_id            uuid not null references app_user(id) on delete cascade,
  skill_id           uuid not null references skill(id) on delete restrict,
  trigger_code       text not null references skill_progress_trigger(code) on delete restrict,
  from_state         text not null references skill_progress_state(code) on delete restrict,
  to_state           text references skill_progress_state(code) on delete restrict,
  applied            boolean not null,
  outcome            text not null check (outcome in ('transitioned','no_matching_rule','rules_inactive','backfilled')),
  transition_rule_id uuid references skill_progress_transition(id) on delete restrict,
  rule_version       int,
  facts              jsonb not null default '{}'::jsonb,
  event_ref_table    text,
  event_ref_id       uuid,
  reason             text not null,
  actor_kind         text not null check (actor_kind in ('user','human_reviewer','system')),
  created_at         timestamptz not null default now(),
  constraint skill_progress_event_applied_shape check ((applied and to_state is not null and outcome in ('transitioned','backfilled')) or (not applied and to_state is null)),
  constraint skill_progress_event_facts_is_object check (jsonb_typeof(facts) = 'object')
);
create index skill_progress_event_progress_idx on skill_progress_event(skill_progress_id, created_at);
create or replace function skill_progress_event_immutable() returns trigger language plpgsql as $$
begin raise exception 'skill_progress_event is append-only'; end $$;
create trigger skill_progress_event_immutable_trg before update or delete on skill_progress_event for each row execute function skill_progress_event_immutable();

-- ───────────────────────────────── RLS ─────────────────────────────────
alter table skill_progress_state      enable row level security; alter table skill_progress_state      force row level security;
alter table skill_progress_trigger    enable row level security; alter table skill_progress_trigger    force row level security;
alter table skill_progress_transition enable row level security; alter table skill_progress_transition force row level security;
alter table skill_progress            enable row level security; alter table skill_progress            force row level security;
alter table skill_progress_event      enable row level security; alter table skill_progress_event      force row level security;

grant select on skill_progress_state, skill_progress_trigger, skill_progress_transition to anon, authenticated;
grant select, insert, update, delete on skill_progress_state, skill_progress_trigger, skill_progress_transition to service_role;
grant select, insert, update, delete on skill_progress, skill_progress_event to authenticated, service_role;
grant select on skill_progress, skill_progress_event to anon;

create policy skill_progress_state_read on skill_progress_state for select to anon, authenticated using (true);
create policy skill_progress_trigger_read on skill_progress_trigger for select to anon, authenticated using (true);
create policy skill_progress_transition_read on skill_progress_transition for select to anon, authenticated using (true);
-- The owner reads their journey. They never write it: only the engine does, as the service role.
create policy skill_progress_select_own on skill_progress for select to authenticated using (user_id = auth.uid());
create policy skill_progress_event_select_own on skill_progress_event for select to authenticated using (user_id = auth.uid());

-- ───────────────────────────── backfill (additive) ─────────────────────────────
-- Derives a journey state from history for every (user, skill) that has a claim
-- or a submission. skill_claim is read, never written.
with pairs as (
  select user_id, skill_id from skill_claim
  union
  select user_id, skill_id from submission_claimed_skill
), derived as (
  select p.user_id, p.skill_id,
    case
      when exists (select 1 from evidence e where e.user_id = p.user_id and e.skill_id = p.skill_id and e.withdrawn_at is null) then 'evidence_recorded'
      when exists (select 1 from evaluation ev join submission_claimed_skill scs on scs.submission_id = ev.submission_id
                    where ev.user_id = p.user_id and scs.skill_id = p.skill_id and ev.state = 'queued_for_human') then 'under_review'
      when exists (select 1 from evaluation ev join submission_claimed_skill scs on scs.submission_id = ev.submission_id
                    where ev.user_id = p.user_id and scs.skill_id = p.skill_id and ev.state = 'completed') then 'needs_more_evidence'
      when exists (select 1 from evidence e where e.user_id = p.user_id and e.skill_id = p.skill_id) then 'needs_more_evidence'
      when exists (select 1 from submission_claimed_skill scs join submission s on s.id = scs.submission_id
                    where s.user_id = p.user_id and scs.skill_id = p.skill_id) then 'submitted'
      else 'in_progress'
    end as state_code
  from pairs p
)
insert into skill_progress (user_id, skill_id, target_role_id, state_code, reason, last_trigger_code, last_event_at)
select d.user_id, d.skill_id,
       (select g.target_role_id from career_goal g where g.user_id = d.user_id and g.is_current limit 1),
       d.state_code, 'derived from pre-0012 history (migration backfill); not a verification', 'history.backfill', now()
  from derived d;

insert into skill_progress_event (skill_progress_id, user_id, skill_id, trigger_code, from_state, to_state, applied, outcome, reason, actor_kind)
select sp.id, sp.user_id, sp.skill_id, 'history.backfill', 'not_started', sp.state_code, true, 'backfilled',
       'derived from pre-0012 history (migration backfill)', 'system'
  from skill_progress sp where sp.last_trigger_code = 'history.backfill';
