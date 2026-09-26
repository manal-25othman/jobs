-- ═══════════════════════════════════════════════════════════════════════════
-- Vertical Slice 1 — what the flow needs and Phase 0 did not yet have.
--
--   career goal → project → submission → evaluation → evidence transition
--   → professional asset → career evidence report
--
-- Everything here follows the Phase 0 rules: enums not free text, constraints
-- not application checks, append-only where there is history.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────── structured evidence carried by a submission ─────────────
--
-- Rows, not a JSON blob. A criterion points at one artifact, and a reviewer can
-- see exactly which fact satisfied which criterion. A blob would make both
-- impossible without parsing it in application code.

create type submission_artifact_kind as enum ('boolean', 'number', 'text', 'file', 'link');

create table submission_artifact (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references submission(id) on delete cascade,
  user_id         uuid not null references app_user(id) on delete cascade,
  key             text not null,
  kind            submission_artifact_kind not null,
  value_bool      boolean,
  value_number    numeric,
  value_text      text,
  -- Where in the submission this fact came from, shown as the excerpt.
  locator         text,
  created_at      timestamptz not null default now(),
  unique (submission_id, key),
  constraint submission_artifact_value_matches_kind check (
    (kind = 'boolean' and value_bool   is not null) or
    (kind = 'number'  and value_number is not null) or
    (kind in ('text','file','link') and value_text is not null)
  )
);
create index submission_artifact_submission_idx on submission_artifact(submission_id);

comment on table submission_artifact is
  'Structured evidence as rows. Each criterion can cite one, so a score is always traceable to a fact.';

-- Which skill the submission claims. A submission that claims nothing cannot
-- move any claim, so the link is explicit rather than inferred from the rubric.
create table submission_claimed_skill (
  submission_id   uuid not null references submission(id) on delete cascade,
  skill_id        uuid not null references skill(id) on delete restrict,
  user_id         uuid not null references app_user(id) on delete cascade,
  primary key (submission_id, skill_id)
);

-- ───────────────────────────── integrity specs ─────────────────────────────
-- Versioned content, like rubrics: authored once, frozen on publication.

create table integrity_check_spec (
  id                  uuid primary key default gen_random_uuid(),
  activity_spec_id    uuid not null references activity_spec(id) on delete cascade,
  key                 text not null,
  classification      text not null check (classification in ('user_facing','assessment_only')),
  -- A blocking failure stops the pipeline before any scoring happens.
  blocking            boolean not null default false,
  check_definition    jsonb not null,
  user_facing_message text,
  created_at          timestamptz not null default now(),
  unique (activity_spec_id, key),
  -- assessment_only detail is never shown, so it must not carry a message that
  -- someone could later surface "just this once".
  constraint integrity_spec_assessment_only_has_no_message check (
    classification <> 'assessment_only' or user_facing_message is null
  )
);

comment on constraint integrity_spec_assessment_only_has_no_message on integrity_check_spec is
  'An assessment-only check carries no user-facing text, so none can leak by accident.';

comment on column integrity_check_spec.check_definition is
  'JSONB justified: a small predicate, versioned content, never queried as domain state.';

-- ──────────────────────────────── verification ─────────────────────────────
--
-- A SEPARATE concept from evaluation (D-051). EvaluationOutcome says what
-- happened during an attempt; VerificationOutcome says what an independent
-- step decided about that attempt's result. Two questions, two tables, and no
-- shared status column that would blur them.

create table verification (
  id                    uuid primary key default gen_random_uuid(),
  evaluation_result_id  uuid not null unique references evaluation_result(id) on delete restrict,
  user_id               uuid not null references app_user(id) on delete cascade,
  outcome               verification_outcome not null,
  proposed_state        evidence_state not null,
  resulting_state       evidence_state not null,
  human_reviewer_id     uuid references app_user(id) on delete restrict,
  role_performed        role_performed,
  reason                text not null check (length(btrim(reason)) > 0),
  decided_at            timestamptz not null default now(),

  -- Verification lowers or holds. It never raises above what was proposed.
  constraint verification_never_raises check (
    evidence_ordinal(resulting_state) <= evidence_ordinal(proposed_state)
  ),
  -- Escalation and exceptions are human decisions by definition.
  constraint verification_human_outcomes_need_reviewer check (
    outcome not in ('escalated_to_human','exception_granted')
    or (human_reviewer_id is not null and role_performed is not null)
  )
);

comment on table verification is
  'At most one decision per evaluation result: two verdicts on one result is an ambiguity with no correct reading.';
comment on constraint verification_never_raises on verification is
  'doc 11 section 7: verification lowers or holds, and never raises.';

-- ────────────────────── professional asset lifecycle ───────────────────────
--
-- Phase 0 had a generic status. The slice needs the explicit approval ladder:
--   draft → preview → approved → active → retired

create type asset_lifecycle_state as enum ('draft','preview','approved','active','retired');

alter table professional_asset
  add column lifecycle_state asset_lifecycle_state not null default 'draft',
  add column body_en         text,
  add column skill_id        uuid references skill(id) on delete restrict,
  add column project_id      uuid references project(id) on delete set null,
  add column evaluation_result_id uuid references evaluation_result(id) on delete restrict;

-- Approval is what turns generated wording into a claim the user stands behind.
alter table professional_asset
  add constraint asset_approved_needs_user_approval check (
    lifecycle_state not in ('approved','active') or user_approved_at is not null
  );

comment on constraint asset_approved_needs_user_approval on professional_asset is
  'No system-generated professional wording becomes approved or active without explicit user approval.';

-- Every clause of a generated asset traces to a fact. Rows, so the trace is
-- inspectable rather than a paragraph someone has to trust.
create table asset_trace (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references professional_asset(id) on delete cascade,
  clause      text not null,
  kind        text not null check (kind in ('evidence','criterion','project','skill')),
  ref         text not null check (length(btrim(ref)) > 0),
  position    int not null default 0
);

comment on table asset_trace is
  'One row per clause. An untraced clause cannot exist, because there is nowhere to put it.';

-- ─────────────────────── career evidence report ────────────────────────────

create table evidence_report (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references app_user(id) on delete cascade,
  career_goal_id  uuid not null references career_goal(id) on delete restrict,
  -- The rendered projection, exactly as it was served. Kept so a shared link
  -- shows what the recruiter saw, not a later regeneration.
  projection      jsonb not null,
  -- Literal for this slice; a column so a future AI-assisted report cannot
  -- inherit this claim by accident.
  ai_disclosure   text not null,
  generated_at    timestamptz not null default now(),
  constraint evidence_report_discloses_ai check (length(btrim(ai_disclosure)) > 0)
);
create index evidence_report_user_idx on evidence_report(user_id, generated_at desc);

comment on column evidence_report.projection is
  'JSONB justified: an immutable snapshot of what was served, not queryable domain state.';

-- ─────────────────────────── demo role fixture flag ────────────────────────
-- Distinguishes seeded demo content from real curated content, so a fixture
-- can never be mistaken for an approved role definition in production.

alter table target_role   add column is_demo_fixture boolean not null default false;
alter table activity_spec add column is_demo_fixture boolean not null default false;
alter table skill         add column is_demo_fixture boolean not null default false;

comment on column target_role.is_demo_fixture is
  'Seeded demo content. Never SME-approved, and never eligible to yield Verified.';

-- ═══════════════════════════════ RLS ═══════════════════════════════════════

alter table submission_artifact      enable row level security;
alter table submission_artifact      force  row level security;
alter table submission_claimed_skill enable row level security;
alter table submission_claimed_skill force  row level security;
alter table integrity_check_spec     enable row level security;
alter table integrity_check_spec     force  row level security;
alter table verification             enable row level security;
alter table verification             force  row level security;
alter table asset_trace              enable row level security;
alter table asset_trace              force  row level security;
alter table evidence_report          enable row level security;
alter table evidence_report          force  row level security;

grant select, insert, update, delete on submission_artifact, submission_claimed_skill,
  integrity_check_spec, verification, asset_trace, evidence_report
  to authenticated, service_role;
grant select on submission_artifact, submission_claimed_skill, integrity_check_spec,
  verification, asset_trace, evidence_report to anon;

-- The user reads their own submission facts, and inserts them with a
-- submission. They never write a verification or a trace: those are outcomes.
create policy submission_artifact_select_own on submission_artifact
  for select to authenticated using (user_id = auth.uid());
create policy submission_artifact_insert_own on submission_artifact
  for insert to authenticated with check (user_id = auth.uid());

create policy submission_claimed_skill_select_own on submission_claimed_skill
  for select to authenticated using (user_id = auth.uid());
create policy submission_claimed_skill_insert_own on submission_claimed_skill
  for insert to authenticated with check (user_id = auth.uid());

create policy verification_select_own on verification
  for select to authenticated using (user_id = auth.uid());

create policy evidence_report_select_own on evidence_report
  for select to authenticated using (user_id = auth.uid());

-- A trace is readable with the asset it belongs to.
create policy asset_trace_select_own on asset_trace
  for select to authenticated using (
    exists (
      select 1 from professional_asset pa
      where pa.id = asset_trace.asset_id and pa.user_id = auth.uid()
    )
  );

-- Integrity SPECS are assessment material: knowing the checks teaches how to
-- pass them. No client policy at all, for either role.

-- ─────────────── a shared report reveals only its projection ───────────────
--
-- The row carries the projection that was served; the policy opens the row,
-- and the projection itself is already narrowed by the domain.

create policy evidence_report_read_via_share_link on evidence_report
  for select to anon
  using (public.share_link_opens('recruiter_report', evidence_report.id));

comment on policy evidence_report_read_via_share_link on evidence_report is
  'Anonymous access needs a live, unrevoked link. The row holds only the public projection fields.';
