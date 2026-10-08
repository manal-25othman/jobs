-- 0017 — Career Claim Drafts & policy-driven CV/LinkedIn suggestions (Configurable Track Architecture, Phase 7, D-114).
--
-- Extends, does not duplicate: a claim draft IS an agent_proposal of a wording
-- type (0005) — the same gateway, validation, preview (D-057), approval and
-- professional_asset path. This migration adds what a claim draft must carry:
-- its claim kind, the exact claim-policy row that judged it, its grounding
-- status and report, and an append-only history of what happened to it.
--
-- presentationFor() → data. The levels presentationFor() hard-coded become the
-- migration-created baseline `legacy_presentation@1` (activation =
-- legacy_baseline). It runs in production ONLY because it reproduces the
-- behaviour that already existed; it is not expert-validated. The exhaustive
-- equivalence proof is packages/domain/src/career-claims.test.ts; the e2e suite
-- proves these rows equal LEGACY_PRESENTATION_BASELINE. The DRAFT rows of
-- `default@1` stay inactive: no new claim policy is activated here.
--
-- Nothing here recalculates history: existing proposals and assets keep their
-- rows byte-identical in every pre-existing column (proof in the phase report).

-- ───────────────────────────── claim kinds ─────────────────────────────
alter table claim_policy drop constraint claim_policy_claim_kind_check;
alter table claim_policy add constraint claim_policy_claim_kind_check check (claim_kind in (
  'cv_bullet','project_description','linkedin_skill','linkedin_project','linkedin_headline','linkedin_about','professional_summary','case_study','professional_profile','evidence_report'));

-- The CV project line presentationFor() called 'project_description_only'. DRAFT, inactive, like the rest of default@1.
insert into claim_policy (key, version, claim_kind, description_en, min_evidence_level) values
  ('default', 1, 'project_description', 'DRAFT mirror of presentationFor(): a CV project description is allowed from practiced. Inactive until validated and activated.', 'practiced');
-- default@1 was never activated, so its wording may still be corrected: it is now consumed once activated.
update claim_policy set description_en = replace(description_en, 'Not consumed until Phase 7.', 'Inactive until validated and activated.')
 where key = 'default' and version = 1 and activated_at is null;

-- ───────────────────────────── legacy baseline (migration-created) ─────────────────────────────
-- The activation guard refuses any INSERT that carries baseline_of: only a
-- migration may create a baseline. This is that migration; the guard is
-- suspended for these rows alone and the activation is logged in config_change.
alter table claim_policy disable trigger claim_policy_activation;
insert into claim_policy (key, version, claim_kind, description_en, min_evidence_level, activation, baseline_of, activated_at, validation_note_en) values
  ('legacy_presentation', 1, 'cv_bullet',            'LEGACY BASELINE — presentationFor().cv = ''bullet'' from demonstrated.',                      'demonstrated', 'legacy_baseline', 'presentationFor().cv=bullet', now(),
   'LEGACY BASELINE — NOT EXPERT-VALIDATED. Reproduces presentationFor(); runs in production only for that reason.'),
  ('legacy_presentation', 1, 'project_description',  'LEGACY BASELINE — presentationFor().cv = ''project_description_only'' from practiced.',     'practiced',    'legacy_baseline', 'presentationFor().cv=project_description_only', now(),
   'LEGACY BASELINE — NOT EXPERT-VALIDATED. Reproduces presentationFor(); runs in production only for that reason.'),
  ('legacy_presentation', 1, 'linkedin_skill',       'LEGACY BASELINE — presentationFor().linkedIn = ''skill'' from demonstrated.',                 'demonstrated', 'legacy_baseline', 'presentationFor().linkedIn=skill', now(),
   'LEGACY BASELINE — NOT EXPERT-VALIDATED. Reproduces presentationFor(); runs in production only for that reason.'),
  ('legacy_presentation', 1, 'linkedin_project',     'LEGACY BASELINE — presentationFor().linkedIn = ''project_mention_only'' from practiced.',     'practiced',    'legacy_baseline', 'presentationFor().linkedIn=project_mention_only', now(),
   'LEGACY BASELINE — NOT EXPERT-VALIDATED. Reproduces presentationFor(); runs in production only for that reason.'),
  ('legacy_presentation', 1, 'professional_summary', 'LEGACY BASELINE — the pre-0017 proposal validation: a skill a summary names must be demonstrated.', 'demonstrated', 'legacy_baseline', 'validateAgainstDomain named-skill rule (pre-0017)', now(),
   'LEGACY BASELINE — NOT EXPERT-VALIDATED. Reproduces the pre-0017 validation rule; runs in production only for that reason.'),
  ('legacy_presentation', 1, 'linkedin_headline',    'LEGACY BASELINE — the pre-0017 proposal validation: a skill a headline names must be demonstrated.', 'demonstrated', 'legacy_baseline', 'validateAgainstDomain named-skill rule (pre-0017)', now(),
   'LEGACY BASELINE — NOT EXPERT-VALIDATED. Reproduces the pre-0017 validation rule; runs in production only for that reason.'),
  ('legacy_presentation', 1, 'linkedin_about',       'LEGACY BASELINE — the pre-0017 proposal validation: a skill an About names must be demonstrated.', 'demonstrated', 'legacy_baseline', 'validateAgainstDomain named-skill rule (pre-0017)', now(),
   'LEGACY BASELINE — NOT EXPERT-VALIDATED. Reproduces the pre-0017 validation rule; runs in production only for that reason.');
alter table claim_policy enable trigger claim_policy_activation;
insert into config_change (entity_table, entity_id, field, old_value, new_value, actor, reason)
select 'claim_policy', id, 'activation', null, 'legacy_baseline', 'migration 0017_career_claims',
       'Phase 7 (D-114): presentationFor() moved into data as a legacy baseline; not expert-validated'
  from claim_policy where key = 'legacy_presentation' and version = 1;
-- case_study, professional_profile, evidence_report: no pre-existing behaviour, so no baseline.
-- Production refuses a case-study draft until a validated policy is activated.

-- ───────────────────────────── claim drafts (agent_proposal) ─────────────────────────────
alter table agent_proposal
  add column claim_kind              text check (claim_kind is null or claim_kind in (
    'cv_bullet','project_description','linkedin_skill','linkedin_project','linkedin_headline','linkedin_about','professional_summary','case_study')),
  add column claim_policy_id         uuid references claim_policy(id) on delete restrict,
  add column claim_policy_ref        text,
  add column claim_policy_resolution text check (claim_policy_resolution is null or claim_policy_resolution in ('production_active','legacy_baseline','development_only')),
  add column grounding_status        text check (grounding_status is null or grounding_status in ('grounded','evidence_withdrawn','not_eligible')),
  add column grounding_report        jsonb,
  add constraint proposal_claim_draft_shape check (
    (claim_kind is null and claim_policy_id is null and claim_policy_ref is null and claim_policy_resolution is null and grounding_status is null and grounding_report is null)
    or (claim_kind is not null and claim_policy_id is not null and claim_policy_ref is not null and claim_policy_resolution is not null
        and grounding_status is not null and jsonb_typeof(grounding_report) = 'array'));
comment on column agent_proposal.claim_kind is 'Phase 7: set on a claim draft (a wording proposal judged by a claim policy). Null on a proposal created before 0017 or on a non-wording proposal.';
comment on column agent_proposal.claim_policy_id is 'The exact claim_policy row that judged the draft when it was drafted. Approval re-checks against the policy active THEN and records that one on the asset.';
comment on column agent_proposal.grounding_report is 'JSONB justified: the ordered list of named grounding checks ({check, passed, detail}) the draft passed, kept so the user and an auditor see what was checked.';

-- Approved and rejected drafts are history: the claim columns freeze with the rest.
create or replace function agent_proposal_freeze() returns trigger language plpgsql as $$
begin
  if old.lifecycle in ('approved','rejected') then
    if new.structured_payload <> old.structured_payload or new.lifecycle <> old.lifecycle
       or new.summary <> old.summary or new.evidence_refs <> old.evidence_refs
       or new.claim_kind is distinct from old.claim_kind or new.claim_policy_id is distinct from old.claim_policy_id
       or new.grounding_status is distinct from old.grounding_status then
      raise exception 'agent_proposal % is % and cannot be rewritten', old.id, old.lifecycle;
    end if;
  end if;
  return new;
end $$;

-- ───────────────────────────── claim draft history (append-only) ─────────────────────────────
create table claim_draft_event (
  id               uuid primary key default gen_random_uuid(),
  proposal_id      uuid not null references agent_proposal(id) on delete cascade,
  user_id          uuid not null references app_user(id) on delete cascade,
  event            text not null check (event in ('drafted','previewed','approved','rejected','flagged_evidence_withdrawn','refused_not_eligible')),
  claim_kind       text not null,
  claim_policy_id  uuid references claim_policy(id) on delete restrict,
  claim_policy_ref text,
  actor_kind       text not null check (actor_kind in ('user','system')),
  detail           text not null check (length(btrim(detail)) > 0),
  asset_id         uuid references professional_asset(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index claim_draft_event_proposal_idx on claim_draft_event(proposal_id, created_at);
comment on table claim_draft_event is 'Phase 7: what happened to a claim draft, in order — drafted, previewed, approved, rejected, flagged when its evidence was withdrawn, refused at approval by the policy then active. Append-only.';
create or replace function claim_draft_event_append_only() returns trigger language plpgsql as $$
begin raise exception 'claim_draft_event is append-only'; end $$;
create trigger claim_draft_event_append_only_trg before update or delete on claim_draft_event for each row execute function claim_draft_event_append_only();

-- ───────────────────────────── professional assets ─────────────────────────────
alter table professional_asset drop constraint professional_asset_kind_check;
alter table professional_asset add constraint professional_asset_kind_check check (kind in (
  'cv_bullet','linkedin_skill','case_study','showcase_project',
  'project_description','linkedin_project','linkedin_headline','linkedin_about','professional_summary'));
alter table professional_asset
  add column claim_policy_id  uuid references claim_policy(id) on delete restrict,
  add column claim_policy_ref text;
comment on column professional_asset.claim_policy_id is 'Phase 7: the claim policy active when the user approved this asset. Null = approved before the claim-policy layer (kept as approved; never recalculated).';

-- ───────────────────────────────── RLS ─────────────────────────────────
alter table claim_draft_event enable row level security; alter table claim_draft_event force row level security;
grant select on claim_draft_event to authenticated;
grant select, insert, update, delete on claim_draft_event to service_role;
create policy claim_draft_event_select_own on claim_draft_event for select to authenticated using (user_id = auth.uid());
