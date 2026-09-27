-- ═══════════════════════════════════════════════════════════════════════════
-- Human evaluation flow (OPEN-041), rubric value status (OPEN-043) and
-- demo → canonical promotion (OPEN-040).
--
--   Submission → deterministic checks → criteria requiring human review →
--   review queue → blind review → criterion-level decision → written rationale
--   → immutable review record → aggregation → domain transition.
--
-- SME (reviews career content) and Human Reviewer (reviews submissions against
-- an approved rubric) stay separate roles; `role_performed` is stored on every
-- grant, decision and review-log row even when one person holds both.
-- ═══════════════════════════════════════════════════════════════════════════

create type review_queue_state as enum ('pending','assigned','in_review','completed','returned','escalated');
create type value_status as enum ('approved','proposed','TBD');
create type promotion_step as enum ('review_copy_created','corrected','approved','published','abandoned');

-- ───────────────────────────── reviewer grants ─────────────────────────────
-- Who may review, in which role. Granted by the service (an operator action),
-- never self-service. Revocation keeps history.
create table reviewer_grant (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app_user(id) on delete restrict,
  role_performed role_performed not null,
  granted_by    text not null,
  granted_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  revoke_reason text,
  constraint reviewer_grant_revoke_has_reason check (revoked_at is null or length(btrim(coalesce(revoke_reason,''))) > 0)
);
create unique index reviewer_grant_active_unique on reviewer_grant(user_id, role_performed) where revoked_at is null;

-- ───────────────────────────── review queue ────────────────────────────────
-- One item per (evaluation, human criterion). Deterministic criteria never enter.
create table review_queue_item (
  id                 uuid primary key default gen_random_uuid(),
  evaluation_id      uuid not null references evaluation(id) on delete restrict,
  submission_id      uuid not null references submission(id) on delete restrict,
  activity_spec_id   uuid not null references activity_spec(id) on delete restrict,
  rubric_version_id  uuid not null references rubric_version(id) on delete restrict,
  criterion_id       uuid not null references rubric_criterion(id) on delete restrict,
  criterion_key      text not null,
  state              review_queue_state not null default 'pending',
  assigned_to        uuid references app_user(id) on delete restrict,
  assigned_at        timestamptz,
  completed_at       timestamptz,
  conflict_of_interest boolean not null default false,
  escalation_reason  text,
  return_reason      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (evaluation_id, criterion_key),
  constraint queue_assigned_has_assignee check (state not in ('assigned','in_review','completed') or assigned_to is not null),
  constraint queue_escalated_has_reason check (state <> 'escalated' or length(btrim(coalesce(escalation_reason,''))) > 0)
);
create index review_queue_pending_idx on review_queue_item(state, created_at);
create trigger review_queue_item_touch before update on review_queue_item for each row execute function touch_updated_at();

-- Queue transitions mirror the domain (assertQueueTransition).
create function review_queue_guard() returns trigger language plpgsql as $$
begin
  if new.state = old.state then return new; end if;
  if not (case old.state
    when 'pending' then new.state in ('assigned','escalated')
    when 'assigned' then new.state in ('in_review','pending','escalated')
    when 'in_review' then new.state in ('completed','returned','escalated')
    when 'completed' then new.state in ('in_review')
    when 'returned' then new.state in ('pending','assigned')
    when 'escalated' then new.state in ('assigned','pending')
    else false end) then
    raise exception 'review queue: % → % is not a permitted transition', old.state, new.state;
  end if;
  if new.state = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
  return new;
end $$;
create trigger review_queue_guard_trg before update on review_queue_item for each row execute function review_queue_guard();

-- ───────────────────────── immutable review records ────────────────────────
create table criterion_review (
  id                    uuid primary key default gen_random_uuid(),          -- review_id
  queue_item_id         uuid not null references review_queue_item(id) on delete restrict,
  reviewer_id           uuid not null references app_user(id) on delete restrict,
  role_performed        role_performed not null,
  submission_id         uuid not null references submission(id) on delete restrict,
  activity_spec_id      uuid not null references activity_spec(id) on delete restrict,
  criterion_id          uuid not null references rubric_criterion(id) on delete restrict,
  criterion_key         text not null,
  rubric_version_id     uuid not null references rubric_version(id) on delete restrict,
  rubric_version        text not null,
  decision              text not null,                                       -- the level key chosen
  score                 numeric(6,3) not null check (score >= 0),
  max_score             numeric(6,3) not null check (max_score > 0 and score <= max_score),
  rationale             text not null check (length(btrim(rationale)) >= 12),
  -- JSONB justified: a snapshot of the deterministic results the reviewer saw, frozen with the decision.
  deterministic_check_context jsonb not null,
  disagreement_with_automated_result boolean not null default false,
  conflict_of_interest  boolean not null default false,
  supersedes_review_id  uuid references criterion_review(id) on delete restrict,
  created_at            timestamptz not null default now()
);
create unique index criterion_review_supersede_once on criterion_review(supersedes_review_id) where supersedes_review_id is not null;
create index criterion_review_item_idx on criterion_review(queue_item_id, created_at desc);
create function criterion_review_immutable() returns trigger language plpgsql as $$
begin raise exception 'criterion_review is immutable: a changed judgement is a new record that supersedes this one'; end $$;
create trigger criterion_review_immutable_trg before update or delete on criterion_review for each row execute function criterion_review_immutable();
comment on table criterion_review is 'FR-P-037 at criterion level: who (reviewer_id), as what (role_performed), decided what, why. Never edited.';

-- The interim result of a run awaiting review carries this outcome already:
-- evaluation_outcome has 'needs_human_review'; evaluation.state has 'queued_for_human'.

-- ─────────────────── rubric weights / thresholds status (OPEN-043) ─────────
alter table rubric_criterion
  add column weight_status    value_status not null default 'TBD',
  add column threshold_status value_status not null default 'TBD';
alter table rubric_version
  add column pass_threshold_status value_status not null default 'TBD';
comment on column rubric_criterion.weight_status is 'OPEN-043: a draft weight never becomes production truth silently. Real content publishes only with approved.';

-- ───────────────────── demo → canonical promotion (OPEN-040) ────────────────
-- A demo row is never mutated into approved content. A non-demo REVIEW COPY is
-- created, linked by promoted_from_id, and walks the ordinary review workflow.
-- Both may exist at once (one demo, one canonical per code), so the code
-- uniqueness becomes per is_demo_fixture.
do $$
declare t text; col text;
begin
  for t, col in select * from (values ('skill','slug'),('target_role','slug'),('task','code'),('learning_resource','code'),('data_source','code'),
                                      ('skill_family','code'),('recency_policy','code'),('proficiency_scale','code'),('criterion_library','key')) v
  loop
    execute format('alter table %I add column promoted_from_id uuid references %I(id) on delete restrict', t, t);
  end loop;
  for t in select unnest(array['activity_spec','rubric_version','role_requirement','career_presentation_rule','skill_synonym']) loop
    execute format('alter table %I add column promoted_from_id uuid references %I(id) on delete restrict', t, t);
  end loop;
end $$;

alter table skill drop constraint skill_slug_key;
create unique index skill_slug_demo_unique on skill(slug) where is_demo_fixture;
create unique index skill_slug_canonical_unique on skill(slug) where not is_demo_fixture;
alter table target_role drop constraint target_role_slug_key;
create unique index target_role_slug_demo_unique on target_role(slug) where is_demo_fixture;
create unique index target_role_slug_canonical_unique on target_role(slug) where not is_demo_fixture;
alter table task drop constraint task_code_key;
create unique index task_code_demo_unique on task(code) where is_demo_fixture;
create unique index task_code_canonical_unique on task(code) where not is_demo_fixture;
alter table learning_resource drop constraint learning_resource_code_key;
create unique index learning_resource_code_demo_unique on learning_resource(code) where is_demo_fixture;
create unique index learning_resource_code_canonical_unique on learning_resource(code) where not is_demo_fixture;
alter table data_source drop constraint data_source_code_key;
create unique index data_source_code_demo_unique on data_source(code) where is_demo_fixture;
create unique index data_source_code_canonical_unique on data_source(code) where not is_demo_fixture;
alter table skill_family drop constraint skill_family_code_key;
create unique index skill_family_code_demo_unique on skill_family(code) where is_demo_fixture;
create unique index skill_family_code_canonical_unique on skill_family(code) where not is_demo_fixture;
alter table recency_policy drop constraint recency_policy_code_key;
create unique index recency_policy_code_demo_unique on recency_policy(code) where is_demo_fixture;
create unique index recency_policy_code_canonical_unique on recency_policy(code) where not is_demo_fixture;
alter table proficiency_scale drop constraint proficiency_scale_code_key;
create unique index proficiency_scale_code_demo_unique on proficiency_scale(code) where is_demo_fixture;
create unique index proficiency_scale_code_canonical_unique on proficiency_scale(code) where not is_demo_fixture;
alter table criterion_library drop constraint criterion_library_key_key;
create unique index criterion_library_key_demo_unique on criterion_library(key) where is_demo_fixture;
create unique index criterion_library_key_canonical_unique on criterion_library(key) where not is_demo_fixture;
alter table activity_spec drop constraint activity_spec_slug_version_key;
create unique index activity_spec_slug_version_demo_unique on activity_spec(slug, version) where is_demo_fixture;
create unique index activity_spec_slug_version_canonical_unique on activity_spec(slug, version) where not is_demo_fixture;
alter table career_presentation_rule drop constraint career_presentation_rule_asset_type_evidence_level_key;
create unique index presentation_rule_demo_unique on career_presentation_rule(asset_type, evidence_level) where is_demo_fixture;
create unique index presentation_rule_canonical_unique on career_presentation_rule(asset_type, evidence_level) where not is_demo_fixture;

create table content_promotion (
  id                  uuid primary key default gen_random_uuid(),
  entity_kind         career_entity_kind not null,
  demo_entity_id      uuid not null,
  canonical_entity_id uuid not null,
  step                promotion_step not null default 'review_copy_created',
  created_by          text not null,
  created_at          timestamptz not null default now(),
  -- JSONB justified: a list of field-level corrections {field, from, to, by, at}; audit material, never queried as state.
  corrections         jsonb not null default '[]'::jsonb,
  reviewer_id         uuid,
  reviewer_label      text,
  review_log_ids      uuid[] not null default '{}',
  approved_at         timestamptz,
  published_at        timestamptz,
  canonical_version   int,
  note                text,
  unique (entity_kind, demo_entity_id, canonical_entity_id),
  constraint promotion_approved_has_reviewer check (step not in ('approved','published') or (reviewer_id is not null and approved_at is not null)),
  constraint promotion_published_has_time check (step <> 'published' or published_at is not null)
);
comment on table content_promotion is 'OPEN-040: original demo source, reviewer, decisions (review_log ids), corrections, approval time, resulting canonical record and version.';

-- Real (non-demo) rubric publishes only with SME-approved weights and thresholds.
create or replace function rubric_values_publishable() returns trigger language plpgsql as $$
declare n int;
begin
  if new.status = 'published' and (old.status is distinct from 'published') and not new.is_demo_fixture then
    if new.pass_threshold_status <> 'approved' then raise exception 'rubric % publishes only with an SME-approved pass threshold (status %)', new.version, new.pass_threshold_status; end if;
    select count(*) into n from rubric_criterion where rubric_version_id = new.id and (weight_status <> 'approved' or threshold_status <> 'approved');
    if n > 0 then raise exception 'rubric % has % criterion value(s) still proposed/TBD; SME approval of weights and thresholds is required (OPEN-043)', new.version, n; end if;
  end if;
  return new;
end $$;
create trigger rubric_values_publishable_trg before update on rubric_version for each row execute function rubric_values_publishable();

-- ──────────────────────────────── RLS ──────────────────────────────────────
-- Review is blind and operational: no client policy at all. The API (service
-- role) authorises reviewers through reviewer_grant and shapes a blind payload.
do $$
declare t text;
begin
  foreach t in array array['reviewer_grant','review_queue_item','criterion_review','content_promotion'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('grant select, insert, update, delete on %I to service_role', t);
  end loop;
end $$;
comment on table review_queue_item is 'No client policy: the reviewed user must not read the queue; reviewers reach it through the API only.';

-- A user reads the criterion scores of their OWN results (a gap the human-review
-- flow exposed: the evaluation GET returned no criteria under RLS). Integrity
-- checks stay unreadable by any client, as before.
create policy evaluation_criterion_score_select_own on evaluation_criterion_score
  for select to authenticated
  using (exists (select 1 from evaluation_result r where r.id = evaluation_result_id and r.user_id = auth.uid()));

