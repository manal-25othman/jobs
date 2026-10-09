-- 0020 — Admin Track Builder (Configurable Track Architecture, Phase 8, D-116).
--
-- Extends, does not replace, the Phase 4 governance model. An administrator
-- DRAFTS; a named SME VALIDATES (professional authority); a product owner
-- ACTIVATES or PUBLISHES. The database enforces what the API also checks:
--   1. four eyes — whoever drafted a governed configuration row cannot approve it;
--   2. track-skill edits are drafts that reach live role_requirement rows only
--      when a new track configuration version is activated (readiness reads
--      role_requirement live, so editing it in place would bypass versioning);
--   3. a published activity's deliverables are frozen (as rubric criteria already are);
--   4. an approved asset records the grounding version it was checked under, so a
--      vocabulary or engine change can never leave it shown as evidence-backed
--      without a re-check (fail closed).
-- Nothing here approves, activates or finalises an expert-dependent value.

-- ───────────────────────────── drafted_by + four eyes ─────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['verification_policy','assessment_context_policy','claim_policy','challenge_policy','track_config_version',
                           'readiness_rule_set','disclosure_questionnaire','grounding_lexicon'] loop
    execute format('alter table %I add column drafted_by uuid references app_user(id) on delete restrict', t);
    execute format('comment on column %I.drafted_by is %L', t, 'Phase 8: the administrator who drafted this version through the Admin Track Builder. Four eyes: they cannot approve it. Null for rows created by migrations, seeds or the CLI.');
  end loop;
end $$;

create or replace function config_four_eyes_guard() returns trigger language plpgsql as $$
begin
  if new.drafted_by is not null and new.review_status in ('sme_reviewed','approved','published')
     and new.review_status is distinct from old.review_status and new.approved_by = new.drafted_by::text then
    raise exception 'four eyes: % %@% was drafted by this person; another, named reviewer must approve it', tg_table_name, new.key, new.version;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['verification_policy','assessment_context_policy','claim_policy','challenge_policy',
                           'readiness_rule_set','disclosure_questionnaire','grounding_lexicon'] loop
    execute format('create trigger %1$I_four_eyes before update on %1$I for each row execute function config_four_eyes_guard()', t);
  end loop;
end $$;
-- track_config_version has no `key`; same rule, its own message.
create or replace function track_version_four_eyes_guard() returns trigger language plpgsql as $$
begin
  if new.drafted_by is not null and new.review_status in ('sme_reviewed','approved','published')
     and new.review_status is distinct from old.review_status and new.approved_by = new.drafted_by::text then
    raise exception 'four eyes: track configuration v% was drafted by this person; another, named reviewer must approve it', new.version;
  end if;
  return new;
end $$;
create trigger track_config_version_four_eyes before update on track_config_version for each row execute function track_version_four_eyes_guard();

-- ───────────────────────────── track-skill drafts ─────────────────────────────
alter table track_config_version add column applies_skill_config boolean not null default false;
comment on column track_config_version.applies_skill_config is 'Phase 8: true for a version built by the Admin Track Builder from approved track-skill changes. Activating it writes its snapshot to role_requirement in the same transaction. False for baseline/seed/CLI versions, whose activation changes nothing (as before).';

create table track_skill_change (
  id                     uuid primary key default gen_random_uuid(),
  target_role_id         uuid not null references target_role(id) on delete restrict,
  role_requirement_id    uuid not null references role_requirement(id) on delete restrict,
  proposed               jsonb not null check (jsonb_typeof(proposed) = 'object'),
  base                   jsonb not null check (jsonb_typeof(base) = 'object'),
  professional           boolean not null,
  status                 text not null default 'draft' check (status in ('draft','pending_review','approved','rejected','withdrawn','included','applied')),
  reason                 text not null check (length(btrim(reason)) > 0),
  drafted_by             uuid not null references app_user(id) on delete restrict,
  drafted_at             timestamptz not null default now(),
  decided_by             uuid references app_user(id) on delete restrict,
  decided_role           text check (decided_role is null or decided_role in ('sme','product_owner')),
  decided_at             timestamptz,
  decision_reason        text,
  included_in_version_id uuid references track_config_version(id) on delete restrict,
  applied_at             timestamptz,
  constraint track_skill_change_four_eyes check (decided_by is null or decided_by <> drafted_by),
  constraint track_skill_change_professional_needs_sme check (status not in ('approved','included','applied') or not professional or decided_role = 'sme'),
  constraint track_skill_change_decided_shape check (status not in ('approved','rejected') or (decided_by is not null and decided_at is not null and length(btrim(coalesce(decision_reason,''))) > 0)),
  constraint track_skill_change_included_shape check (status not in ('included','applied') or included_in_version_id is not null)
);
create index track_skill_change_role_idx on track_skill_change(target_role_id, status);
comment on table track_skill_change is 'Phase 8: a proposed change to one TrackSkill (role_requirement) configuration. Draft → pending_review → approved (a named SME for professional fields; never its author) → included in a draft track version → applied when that version is activated. Live rows never change before activation.';
create or replace function track_skill_change_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'track_skill_change is history; withdraw it instead'; end if;
  if old.status <> 'draft' and (new.proposed is distinct from old.proposed or new.base is distinct from old.base or new.drafted_by is distinct from old.drafted_by) then
    raise exception 'a submitted track-skill change is immutable; draft a new one';
  end if;
  if not (old.status = new.status or (case old.status
      when 'draft' then new.status in ('pending_review','withdrawn')
      when 'pending_review' then new.status in ('approved','rejected','withdrawn')
      when 'approved' then new.status in ('included','withdrawn')
      when 'included' then new.status in ('applied')
      else false end)) then
    raise exception 'track_skill_change: % → % is not a permitted transition', old.status, new.status;
  end if;
  return new;
end $$;
create trigger track_skill_change_guard_trg before update or delete on track_skill_change for each row execute function track_skill_change_guard();

-- ───────────────────────────── published deliverables are frozen ─────────────────────────────
create or replace function activity_deliverable_frozen() returns trigger language plpgsql as $$
declare st review_state; demo boolean;
begin
  select status, is_demo_fixture into st, demo from activity_spec where id = coalesce(new.activity_spec_id, old.activity_spec_id);
  if st in ('published','superseded') and not demo then
    raise exception 'activity % is % and its deliverables are frozen; publish a new version', coalesce(new.activity_spec_id, old.activity_spec_id), st;
  end if;
  return coalesce(new, old);
end $$;
create trigger activity_deliverable_frozen_trg before insert or update or delete on activity_deliverable for each row execute function activity_deliverable_frozen();

-- ───────────────────────────── grounding version of approved assets ─────────────────────────────
alter table professional_asset add column grounding_version text;
comment on column professional_asset.grounding_version is 'Phase 8: engine+vocabulary version the asset was last grounded under (approval, re-link, re-grounding). Presentation requires it to equal the version in effect; null (approved before this column) ⇒ not presented until re-grounded. Fail closed.';
alter table asset_standing_event drop constraint asset_standing_event_cause_check;
alter table asset_standing_event add constraint asset_standing_event_cause_check check (cause in ('policy_activation','revalidation_run','evidence_withdrawn','relinked','grounding_revalidation'));

-- ───────────────────────────────── RLS ─────────────────────────────────
alter table track_skill_change enable row level security; alter table track_skill_change force row level security;
grant select, insert, update on track_skill_change to service_role;
