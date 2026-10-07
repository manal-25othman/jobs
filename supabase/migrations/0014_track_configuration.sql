-- 0014 — Configuration & Policy Layer (Configurable Track Architecture, Phase 4).
--
-- 1. ACTIVATION MODEL. A governed configuration row (verification policy,
--    assessment-context policy, claim policy, challenge policy, track
--    configuration version) carries TWO separate things:
--      review_status   expert validation (draft → … → approved/published)
--      activation      whether the product USES it:
--        inactive           default for every new row; never consulted
--        development_only   may run outside production only (demo / dev)
--        legacy_baseline    the behaviour that existed BEFORE the policy layer.
--                           Runs in production because it IS the pre-existing
--                           behaviour, not because it is validated. Only a
--                           migration can create one (baseline_of is frozen at
--                           insert), so no new draft can ever become a baseline.
--        production_active  explicit, audited promotion of a VALIDATED row.
--    One active row per key (or per track). A newly created draft is inactive
--    and cannot replace an active row by accident: activating is a separate,
--    audited act that needs an actor and a reason (config_change).
--
-- 2. VERSIONING. Historical assessments and decisions reference the exact
--    configuration rows that produced them; those rows become content-immutable
--    the moment they are first activated. A change is a new version.
--    Nothing here recalculates any historical result.
--
-- 3. Every expert-dependent value seeded here stays DRAFT / NOT VALIDATED.

-- ───────────────────────────── config change audit ─────────────────────────────
create table config_change (
  id            uuid primary key default gen_random_uuid(),
  entity_table  text not null,
  entity_id     uuid not null,
  field         text not null,
  old_value     text,
  new_value     text,
  actor         text not null check (length(btrim(actor)) > 0),
  reason        text not null check (length(btrim(reason)) > 0),
  created_at    timestamptz not null default now()
);
create index config_change_entity_idx on config_change(entity_table, entity_id, created_at);
create or replace function config_change_immutable() returns trigger language plpgsql as $$
begin raise exception 'config_change is append-only'; end $$;
create trigger config_change_immutable_trg before update or delete on config_change for each row execute function config_change_immutable();

-- The guard shared by every governed table. Reads the actor/reason the
-- application sets for the transaction (set_config('naqla.config_actor', …, true)).
create or replace function config_activation_guard() returns trigger language plpgsql as $$
declare
  actor text := nullif(btrim(coalesce(current_setting('naqla.config_actor', true), '')), '');
  reason text := nullif(btrim(coalesce(current_setting('naqla.config_reason', true), '')), '');
  production boolean := coalesce(current_setting('naqla.production', true), '') = 'on';
  governance text[] := array['activation','activated_at','deactivated_at','review_status','approved_by','approved_at','validation_note_en','updated_at'];
  old_j jsonb; new_j jsonb;
begin
  if new.activation not in ('inactive','development_only','legacy_baseline','production_active') then
    raise exception 'unknown activation %', new.activation;
  end if;
  -- A baseline is frozen at insert by a migration; the application can never create or assign one.
  if tg_op = 'INSERT' and new.baseline_of is not null then
    raise exception 'a legacy baseline can only be created by a migration (baseline_of is not assignable)';
  end if;
  if tg_op = 'UPDATE' and new.baseline_of is distinct from old.baseline_of then
    raise exception 'baseline_of is frozen; a draft can never become a legacy baseline';
  end if;
  if new.activation = 'legacy_baseline' and new.baseline_of is null then
    raise exception 'legacy_baseline requires a migration-created baseline row';
  end if;
  -- Production activation is the explicit promotion of a VALIDATED row only.
  if new.activation = 'production_active' and (new.review_status not in ('approved','published') or new.approved_by is null or new.approved_at is null) then
    raise exception 'production_active requires review_status approved/published with a recorded approver; a draft (DRAFT / NOT VALIDATED) cannot be active in production';
  end if;
  if new.activation = 'development_only' and production then
    raise exception 'development_only configuration cannot be activated in production';
  end if;
  if new.review_status in ('approved','published') and (new.approved_by is null or new.approved_at is null) then
    raise exception 'approved/published requires approved_by and approved_at';
  end if;
  if tg_op = 'UPDATE' then
    -- Content is frozen once the row has ever been active: a change is a new version.
    old_j := to_jsonb(old) - governance; new_j := to_jsonb(new) - governance;
    if old.activated_at is not null and old_j <> new_j then
      raise exception '% % has been active; its content is immutable — create a new version', tg_table_name, old.id;
    end if;
    if new.activation is distinct from old.activation or new.review_status is distinct from old.review_status then
      if actor is null or reason is null then
        raise exception 'changing activation/review_status on % needs naqla.config_actor and naqla.config_reason (an audited act)', tg_table_name;
      end if;
      if new.activation is distinct from old.activation then
        insert into config_change (entity_table, entity_id, field, old_value, new_value, actor, reason) values (tg_table_name, new.id, 'activation', old.activation, new.activation, actor, reason);
        if new.activation <> 'inactive' and old.activation = 'inactive' then new.activated_at := coalesce(new.activated_at, now()); end if;
        if new.activation = 'inactive' then new.deactivated_at := now(); end if;
      end if;
      if new.review_status is distinct from old.review_status then
        insert into config_change (entity_table, entity_id, field, old_value, new_value, actor, reason) values (tg_table_name, new.id, 'review_status', old.review_status::text, new.review_status::text, actor, reason);
      end if;
    end if;
  elsif new.activation <> 'inactive' then
    if actor is null or reason is null then
      raise exception 'inserting an active % needs naqla.config_actor and naqla.config_reason', tg_table_name;
    end if;
    new.activated_at := coalesce(new.activated_at, now());
    insert into config_change (entity_table, entity_id, field, old_value, new_value, actor, reason) values (tg_table_name, new.id, 'activation', null, new.activation, actor, reason);
  end if;
  return new;
end $$;

-- ───────────────────────── verification_policy: activation replaces `enabled` ─────────────────────────
drop index verification_policy_one_enabled_per_key;
alter table verification_policy
  add column activation     text not null default 'inactive',
  add column baseline_of    text,
  add column activated_at   timestamptz,
  add column deactivated_at timestamptz;
-- The seeded default@1 IS the pre-policy-layer behaviour: a baseline, not a validated policy.
update verification_policy set activation = 'legacy_baseline', baseline_of = 'pre_0013_verification_behaviour', activated_at = created_at,
  validation_note_en = 'LEGACY BASELINE — NOT EXPERT-VALIDATED. Reproduces the behaviour in effect before the policy layer; runs in production only for that reason. Promotion to a validated policy is a separate, audited act.'
 where key = 'default' and version = 1;
alter table verification_policy drop column enabled;
create unique index verification_policy_one_active_per_key on verification_policy(key) where activation <> 'inactive';
alter table verification_policy add constraint verification_policy_baseline_shape check (activation <> 'legacy_baseline' or baseline_of is not null);
create trigger verification_policy_activation before insert or update on verification_policy for each row execute function config_activation_guard();

-- ───────────────────────────── assessment-context policy ─────────────────────────────
-- Which inputs an evaluator may see, per kind: required | optional | excluded.
-- Identity is excluded by the CODE invariant too; the constraint makes a row that says otherwise unrepresentable.
create table assessment_context_policy (
  id                 uuid primary key default gen_random_uuid(),
  key                text not null check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  version            int not null check (version >= 1),
  description_en     text not null,
  inputs             jsonb not null,
  review_status      review_state not null default 'draft',
  approved_by        text,
  approved_at        timestamptz,
  validation_note_en text not null default 'DRAFT / NOT VALIDATED — pending expert validation',
  activation         text not null default 'inactive',
  baseline_of        text,
  activated_at       timestamptz,
  deactivated_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (key, version),
  constraint assessment_context_inputs_is_object check (jsonb_typeof(inputs) = 'object'),
  constraint assessment_context_identity_excluded check (inputs->>'user_identity' = 'excluded' and inputs->>'user_profile' = 'excluded'),
  constraint assessment_context_baseline_shape check (activation <> 'legacy_baseline' or baseline_of is not null)
);
create unique index assessment_context_policy_one_active_per_key on assessment_context_policy(key) where activation <> 'inactive';
create trigger assessment_context_policy_touch before update on assessment_context_policy for each row execute function touch_updated_at();
insert into assessment_context_policy (key, version, description_en, inputs, activation, baseline_of, activated_at, validation_note_en) values
  ('default', 1, 'LEGACY BASELINE — what the deterministic evaluator and the blind human review could see before Phase 4: submission artifacts (required), ledger items (optional), AI disclosure (required), previous attempts (optional), human criterion decisions (optional). Identity and profile excluded.',
   '{"submission_artifacts":"required","evidence_items":"optional","ai_disclosure":"required","previous_attempts":"optional","human_review_decisions":"optional","user_identity":"excluded","user_profile":"excluded"}',
   'legacy_baseline', 'pre_0014_assessment_context', now(),
   'LEGACY BASELINE — NOT EXPERT-VALIDATED. Records the inputs the pre-Phase-4 pipeline already used; a validated context policy is a separate, audited act.');
create trigger assessment_context_policy_activation before insert or update on assessment_context_policy for each row execute function config_activation_guard();

-- ───────────────────────────────── claim policy ─────────────────────────────────
-- NOT CONSUMED in Phase 4: presentationFor()/career_presentation_rule keep deciding CV/LinkedIn eligibility
-- until Phase 7 (H4). Seeded as a DRAFT mirror of the current behaviour so the expert review starts from data.
create table claim_policy (
  id                             uuid primary key default gen_random_uuid(),
  key                            text not null check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  version                        int not null check (version >= 1),
  claim_kind                     text not null check (claim_kind in ('cv_bullet','linkedin_skill','linkedin_project','linkedin_headline','linkedin_about','professional_summary','case_study','professional_profile','evidence_report')),
  description_en                 text not null,
  min_evidence_level             evidence_state not null,
  min_evidence_count             int check (min_evidence_count is null or min_evidence_count >= 1),
  min_source_strength            evidence_source_strength,
  requires_verification_decision boolean not null default false,
  requires_user_approval         boolean not null default true check (requires_user_approval = true),
  lock_until_grounded            boolean not null default true,
  review_status                  review_state not null default 'draft',
  approved_by                    text,
  approved_at                    timestamptz,
  validation_note_en             text not null default 'DRAFT / NOT VALIDATED — pending expert validation',
  activation                     text not null default 'inactive',
  baseline_of                    text,
  activated_at                   timestamptz,
  deactivated_at                 timestamptz,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  unique (key, version, claim_kind),
  constraint claim_policy_baseline_shape check (activation <> 'legacy_baseline' or baseline_of is not null)
);
comment on column claim_policy.requires_user_approval is 'BR-021: a professional claim always passes Evidence → Proposed Claim → User Preview → User Approval. The constraint makes a policy that says otherwise unrepresentable.';
create unique index claim_policy_one_active_per_key_kind on claim_policy(key, claim_kind) where activation <> 'inactive';
create trigger claim_policy_touch before update on claim_policy for each row execute function touch_updated_at();
insert into claim_policy (key, version, claim_kind, description_en, min_evidence_level, min_evidence_count) values
  ('default', 1, 'cv_bullet',            'DRAFT mirror of presentationFor(): a CV bullet needs demonstrated. Not consumed until Phase 7.',           'demonstrated', null),
  ('default', 1, 'linkedin_skill',       'DRAFT mirror of presentationFor(): a LinkedIn skill needs demonstrated. Not consumed until Phase 7.',     'demonstrated', null),
  ('default', 1, 'linkedin_project',     'DRAFT mirror of presentationFor(): a project mention is allowed from practiced. Not consumed until Phase 7.', 'practiced', null),
  ('default', 1, 'linkedin_headline',    'DRAFT: headline wording follows demonstrated evidence. Not consumed until Phase 7.',                      'demonstrated', null),
  ('default', 1, 'linkedin_about',       'DRAFT: about wording follows demonstrated evidence. Not consumed until Phase 7.',                         'demonstrated', null),
  ('default', 1, 'professional_summary', 'DRAFT: a summary follows demonstrated evidence. Not consumed until Phase 7.',                             'demonstrated', null),
  ('default', 1, 'case_study',           'DRAFT mirror of career_presentation_rule: a case study needs demonstrated. Not consumed until Phase 7.',  'demonstrated', null),
  ('default', 1, 'professional_profile', 'DRAFT mirror of career_presentation_rule: a public profile claim needs verified (blocked in P1). Not consumed until Phase 7.', 'verified', null),
  ('default', 1, 'evidence_report',      'DRAFT: the recruiter report lists demonstrated evidence. Not consumed until Phase 7.',                    'demonstrated', null);
create trigger claim_policy_activation before insert or update on claim_policy for each row execute function config_activation_guard();

-- ───────────────────────────── challenge types + policy ─────────────────────────────
-- Registered, inactive. There is no challenge runner in the product; nothing here triggers a challenge.
create table verification_challenge_type (
  code               text primary key check (code ~ '^[a-z][a-z0-9_]{2,63}$'),
  label_ar           text not null,
  label_en           text not null,
  description_en     text not null,
  delivery           text not null check (delivery in ('question','modification','walkthrough','probe')),
  enabled            boolean not null default false,
  review_status      review_state not null default 'draft',
  approved_by        text,
  approved_at        timestamptz,
  validation_note_en text not null default 'DRAFT / NOT VALIDATED — pending expert validation',
  created_at         timestamptz not null default now(),
  constraint verification_challenge_type_approved_is_recorded check (review_status not in ('approved','published') or (approved_by is not null and approved_at is not null))
);
insert into verification_challenge_type (code, label_ar, label_en, description_en, delivery) values
  ('clarification_question', 'سؤال استيضاح',       'Clarification question',  'The user answers a short question about a choice in their work.',           'question'),
  ('explanation_question',   'سؤال شرح',           'Explanation question',    'The user explains how a part of their work functions.',                     'question'),
  ('followup_modification',  'تعديل لاحق',         'Follow-up modification',  'The user makes a small requested change and resubmits.',                    'modification'),
  ('code_reading_probe',     'قراءة كود',          'Code reading probe',      'The user reads a given snippet and states what it does.',                   'probe'),
  ('live_walkthrough',       'عرض حي',             'Live walkthrough',        'The user walks a reviewer through the work. (OD-10: not a P1 requirement.)', 'walkthrough');

create table challenge_policy (
  id                 uuid primary key default gen_random_uuid(),
  key                text not null check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  version            int not null check (version >= 1),
  description_en     text not null,
  applies_scope      text not null default 'global' check (applies_scope in ('global','track','activity','skill')),
  scope_ref          uuid,
  -- {} = never. A trigger rule is data interpreted later; nothing interprets it in Phase 4.
  trigger_rule       jsonb not null default '{}'::jsonb,
  challenge_types    text[] not null default '{}',
  max_challenges     int check (max_challenges is null or max_challenges >= 0),
  review_status      review_state not null default 'draft',
  approved_by        text,
  approved_at        timestamptz,
  validation_note_en text not null default 'DRAFT / NOT VALIDATED — pending expert validation',
  activation         text not null default 'inactive',
  baseline_of        text,
  activated_at       timestamptz,
  deactivated_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (key, version),
  constraint challenge_policy_trigger_is_object check (jsonb_typeof(trigger_rule) = 'object'),
  constraint challenge_policy_scope_shape check ((applies_scope = 'global') = (scope_ref is null)),
  constraint challenge_policy_baseline_shape check (activation <> 'legacy_baseline' or baseline_of is not null)
);
create unique index challenge_policy_one_active_per_key on challenge_policy(key) where activation <> 'inactive';
create trigger challenge_policy_touch before update on challenge_policy for each row execute function touch_updated_at();
insert into challenge_policy (key, version, description_en) values
  ('default', 1, 'DRAFT: no challenge is triggered. Registered so that experts decide when, how many and which kinds; nothing runs until a validated policy is activated AND a runner exists.');
create trigger challenge_policy_activation before insert or update on challenge_policy for each row execute function config_activation_guard();

-- ───────────────────────────── TrackSkill presentation / configuration ─────────────────────────────
-- Display and configuration fields on the TrackSkill row (role_requirement). Nothing here is a
-- readiness threshold, and nothing marks a skill "core"/"mandatory" as validated:
-- classification_status stays pending until a named expert approves it.
alter table role_requirement
  add column category               text,
  add column display_order          int,
  add column expected_level         evidence_state,
  add column readiness_contribution text check (readiness_contribution is null or readiness_contribution in ('counts','informational')),
  add column enabled                boolean not null default true,
  add column classification_status  text not null default 'pending_expert_validation' check (classification_status in ('pending_expert_validation','proposed','approved')),
  add constraint role_requirement_classification_approved_is_reviewed check (classification_status <> 'approved' or (reviewed_by is not null and reviewed_at is not null));
comment on column role_requirement.classification_status is 'Whether is_core/importance/mandatory-ness may be SHOWN as validated. pending_expert_validation until a named expert approves (D-111). The UI must not present is_core as "core" before that.';
comment on column role_requirement.readiness_contribution is 'Reserved for the readiness engine (Phase 5). NULL = undecided; no threshold exists.';

-- ───────────────────────────── track configuration version ─────────────────────────────
create table track_config_version (
  id                           uuid primary key default gen_random_uuid(),
  target_role_id               uuid not null references target_role(id) on delete restrict,
  version                      int not null check (version >= 1),
  label                        text not null,
  pack_version                 text,
  verification_policy_id       uuid not null references verification_policy(id) on delete restrict,
  assessment_context_policy_id uuid not null references assessment_context_policy(id) on delete restrict,
  claim_policy_ref             text not null,
  challenge_policy_id          uuid references challenge_policy(id) on delete restrict,
  progress_rules_version       int not null,
  readiness_rule_set_id        uuid,
  skill_config_snapshot        jsonb not null default '[]'::jsonb,
  notes_en                     text,
  review_status                review_state not null default 'draft',
  approved_by                  text,
  approved_at                  timestamptz,
  validation_note_en           text not null default 'DRAFT / NOT VALIDATED — pending expert validation',
  activation                   text not null default 'inactive',
  baseline_of                  text,
  activated_at                 timestamptz,
  deactivated_at               timestamptz,
  created_by                   text not null,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  unique (target_role_id, version),
  constraint track_config_snapshot_is_array check (jsonb_typeof(skill_config_snapshot) = 'array'),
  constraint track_config_baseline_shape check (activation <> 'legacy_baseline' or baseline_of is not null),
  constraint track_config_no_readiness_rules_yet check (readiness_rule_set_id is null)
);
comment on table track_config_version is 'The assembled, versioned configuration of a track (Phase 4): which policy versions apply and a snapshot of TrackSkill configuration. Content-immutable once active; a change is a new version. Assessments and decisions reference the version that produced them.';
comment on constraint track_config_no_readiness_rules_yet on track_config_version is 'Phase 5 lifts this. No readiness threshold exists in Phase 4.';
create unique index track_config_version_one_active_per_role on track_config_version(target_role_id) where activation <> 'inactive';
create trigger track_config_version_touch before update on track_config_version for each row execute function touch_updated_at();

create or replace function track_skill_config_snapshot(p_role uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'role_requirement_id', rr.id, 'skill_id', rr.skill_id, 'is_core', rr.is_core, 'importance', rr.importance, 'target_proficiency', rr.target_proficiency,
    'minimum_evidence_count', rr.minimum_evidence_count, 'evidence_type_expected', rr.evidence_type_expected, 'category', rr.category, 'display_order', rr.display_order,
    'expected_level', rr.expected_level, 'readiness_contribution', rr.readiness_contribution, 'enabled', rr.enabled, 'classification_status', rr.classification_status,
    'review_status', rr.review_status, 'version', rr.version) order by rr.display_order nulls last, rr.skill_id), '[]'::jsonb)
  from role_requirement rr where rr.target_role_id = p_role
$$;

-- Baseline v1 for every track that exists at migration time: the behaviour already in effect.
insert into track_config_version (target_role_id, version, label, verification_policy_id, assessment_context_policy_id, claim_policy_ref, challenge_policy_id, progress_rules_version,
                                  skill_config_snapshot, notes_en, activation, baseline_of, activated_at, created_by, validation_note_en)
select tr.id, 1, 'legacy baseline',
       (select id from verification_policy where key = 'default' and version = 1),
       (select id from assessment_context_policy where key = 'default' and version = 1),
       'default@1',
       (select id from challenge_policy where key = 'default' and version = 1),
       coalesce((select max(version) from skill_progress_transition), 1),
       track_skill_config_snapshot(tr.id),
       'Assembled by migration 0014 from the policies and TrackSkill rows in effect before the configuration layer existed.',
       'legacy_baseline', 'pre_0014_track_configuration', now(), 'migration 0014',
       'LEGACY BASELINE — NOT EXPERT-VALIDATED. The configuration in effect before Phase 4. A validated track configuration is a separate, audited act.'
  from target_role tr;
create trigger track_config_version_activation before insert or update on track_config_version for each row execute function config_activation_guard();

-- ───────────────────────── assessments/decisions reference their configuration ─────────────────────────
-- Nullable: historical rows predate the layer (null = pre-0014) and are never rewritten (immutable).
alter table assessment
  add column track_config_version_id uuid references track_config_version(id) on delete restrict,
  add column context_policy_id       uuid references assessment_context_policy(id) on delete restrict,
  add column config_resolution       text check (config_resolution is null or config_resolution in ('production_active','legacy_baseline','development_only','no_active_track_config'));
alter table verification_decision
  add column track_config_version_id uuid references track_config_version(id) on delete restrict;
comment on column assessment.config_resolution is 'How the track configuration was resolved for this run. null = assessed before 0014.';

-- ───────────────────────────────── RLS ─────────────────────────────────
alter table config_change                enable row level security; alter table config_change                force row level security;
alter table assessment_context_policy    enable row level security; alter table assessment_context_policy    force row level security;
alter table claim_policy                 enable row level security; alter table claim_policy                 force row level security;
alter table verification_challenge_type  enable row level security; alter table verification_challenge_type  force row level security;
alter table challenge_policy             enable row level security; alter table challenge_policy             force row level security;
alter table track_config_version         enable row level security; alter table track_config_version         force row level security;
grant select on assessment_context_policy, claim_policy, verification_challenge_type, challenge_policy, track_config_version to anon, authenticated;
grant select, insert, update, delete on config_change, assessment_context_policy, claim_policy, verification_challenge_type, challenge_policy, track_config_version to service_role;
create policy assessment_context_policy_read on assessment_context_policy for select to anon, authenticated using (true);
create policy claim_policy_read on claim_policy for select to anon, authenticated using (true);
create policy verification_challenge_type_read on verification_challenge_type for select to anon, authenticated using (true);
create policy challenge_policy_read on challenge_policy for select to anon, authenticated using (true);
create policy track_config_version_read on track_config_version for select to anon, authenticated using (true);
-- config_change: service role only (no user policy). Users never see or write the governance log.

-- ───────────────────── first configuration version for a track created later ─────────────────────
-- A track imported or seeded after this migration has no baseline (nothing pre-existed for it).
-- Its first version is a DRAFT: `development_only` outside production (so dev/e2e assessments can
-- reference it), `inactive` in production. Promotion stays an explicit, audited act.
create or replace function ensure_track_config_version(p_role uuid, p_pack_version text, p_created_by text, p_activation text)
returns uuid language plpgsql as $$
declare existing uuid; new_id uuid;
begin
  if p_activation not in ('inactive','development_only') then
    raise exception 'ensure_track_config_version creates drafts only (inactive or development_only), never a baseline or a production activation';
  end if;
  select id into existing from track_config_version where target_role_id = p_role order by version desc limit 1;
  if existing is not null then return existing; end if;
  perform set_config('naqla.config_actor', p_created_by, true);
  perform set_config('naqla.config_reason', 'first draft configuration version for a track created after migration 0014 (' || p_activation || ')', true);
  insert into track_config_version (target_role_id, version, label, pack_version, verification_policy_id, assessment_context_policy_id, claim_policy_ref, challenge_policy_id,
                                    progress_rules_version, skill_config_snapshot, notes_en, activation, created_by)
  values (p_role, 1, 'draft v1', p_pack_version,
          (select id from verification_policy where key = 'default' and activation <> 'inactive'),
          (select id from assessment_context_policy where key = 'default' and activation <> 'inactive'),
          'default@1',
          (select id from challenge_policy where key = 'default' and version = 1),
          coalesce((select max(version) from skill_progress_transition), 1),
          track_skill_config_snapshot(p_role),
          'First draft version assembled from the active baseline policies and the TrackSkill rows at creation. DRAFT / NOT VALIDATED.',
          p_activation, p_created_by)
  returning id into new_id;
  return new_id;
end $$;
