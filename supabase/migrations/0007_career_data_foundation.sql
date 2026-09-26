-- ═══════════════════════════════════════════════════════════════════════════
-- Career Data Foundation (Data Integration Phase).
--
-- Moves the approved data-foundation design (docs/data-foundation/28–31) into
-- normalized tables. Nothing here is a JSON shortcut: skills, roles, the
-- role↔skill mapping, tasks, activities, rubric criteria, sources and
-- presentation rules are rows with typed columns. JSONB remains only where
-- the design justified it (an L0 snapshot archive, a small check predicate).
--
-- Review workflow (domain: assertReviewTransition, mirrored by triggers here):
--   draft → curated → sme_reviewed → approved → published → superseded
--   rejected / needs_revision → curated
-- Nothing reaches sme_reviewed/approved without a named reviewer. A DEMO
-- fixture is never SME reviewed or approved; it may be published only outside
-- production (the API refuses to start with published demo content in
-- production).
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────── enums ───────────────────────────────────────

create type review_state as enum (
  'draft','curated','sme_reviewed','approved','published','superseded','rejected','needs_revision'
);
create type data_layer as enum ('raw','normalized','curated','approved','published','superseded');
create type drafting_aid as enum ('none','ai_assisted');
create type reviewer_role as enum ('content_author','sme','product_owner','system');
create type skill_type as enum ('core','supporting','tool','behavioral');
create type ai_substitutability as enum ('low','medium','high');
create type skill_status as enum ('active','deprecated','merged_into');
create type synonym_relation as enum ('equivalent','broader','narrower','related','tool_of','translation_variant');
create type synonym_form_type as enum ('exact','abbreviation','transliteration','vendor_variant','descriptive_phrase');
create type importance_level as enum ('critical','high','medium','low');
create type evidence_type as enum ('artifact','decision_rationale','live_defense','process_trace');
create type role_level as enum ('junior','mid','senior');
create type task_frequency as enum ('daily','weekly','monthly','occasional');
create type complexity_level as enum ('low','medium','high');
create type skill_involvement as enum ('primary','secondary');
create type rubric_dimension as enum ('correctness','judgment','communication','integrity','completeness');
create type evaluator_type as enum ('rule','llm','human');
create type criterion_check_type as enum ('none','artifact_present','artifact_at_least','artifact_text','all_of');
create type integrity_check_type as enum (
  'clarification_question','explanation_question','followup_modification',
  'planted_inconsistency','deterministic_signal','edge_case','output_consistency','expected_failure_mode'
);
create type source_type as enum ('official','curated','platform_generated','market_signal');
create type source_reliability as enum ('high','medium','low');
create type resource_type as enum ('video','course','documentation','article','tutorial','exercise','project');
create type free_or_paid as enum ('free','paid','freemium');
create type resource_quality as enum ('unverified','sme_reviewed','approved','flagged','retired');
create type presentation_asset_type as enum ('cv_bullet','linkedin_skill','linkedin_project','case_study','professional_profile');
create type career_entity_kind as enum (
  'skill','skill_synonym','target_role','role_requirement','task','activity_spec','rubric_version','rubric_criterion',
  'learning_resource','career_presentation_rule','criterion_library','skill_family','recency_policy','proficiency_scale','data_source'
);

-- Which layer a review state sits in (domain: layerOf).
create function data_layer_of(s review_state) returns data_layer language sql immutable as $$
  select case s when 'approved' then 'approved'::data_layer when 'published' then 'published'::data_layer
                when 'superseded' then 'superseded'::data_layer else 'curated'::data_layer end
$$;

-- ─────────────────────── global registries (shared by every track) ─────────

create table data_source (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique check (code ~ '^src_[a-z0-9_]+$'),
  source_type           source_type not null,
  source_name           text not null,
  publisher             text,
  jurisdiction          text not null,
  language              text not null,
  url                   text,
  url_verified          boolean not null default false,
  retrieved_at          timestamptz,
  version               text not null,
  license_or_usage_notes text not null check (length(btrim(license_or_usage_notes)) > 0),
  reliability           source_reliability not null default 'medium',
  review_status         review_state not null default 'draft',
  reviewed_by           uuid,
  reviewed_at           timestamptz,
  drafting_aid          drafting_aid not null default 'none',
  is_demo_fixture       boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- A non-curated source that is approved must say when it was retrieved.
  constraint data_source_retrieved_when_approved check (
    source_type = 'curated' or review_status not in ('approved','published') or retrieved_at is not null
  ),
  -- Market signals exist in the schema; none is ingested in this phase.
  constraint data_source_market_signal_not_published check (
    source_type <> 'market_signal' or review_status in ('draft','curated')
  )
);
comment on table data_source is 'Provenance root. A source without clear license notes never enters the raw layer.';
create trigger data_source_touch before update on data_source for each row execute function touch_updated_at();

create table skill_family (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[a-z][a-z0-9_]+$'),
  name_ar         text not null,
  name_en         text not null,
  description_ar  text,
  description_en  text,
  review_status   review_state not null default 'draft',
  reviewed_by     uuid, reviewed_at timestamptz,
  drafting_aid    drafting_aid not null default 'none',
  is_demo_fixture boolean not null default false,
  version         int not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger skill_family_touch before update on skill_family for each row execute function touch_updated_at();

create table proficiency_scale (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  version         text not null,
  name_ar         text not null, name_en text not null,
  review_status   review_state not null default 'draft',
  reviewed_by uuid, reviewed_at timestamptz, drafting_aid drafting_aid not null default 'none',
  is_demo_fixture boolean not null default false,
  created_at      timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table proficiency_level (
  id              uuid primary key default gen_random_uuid(),
  scale_id        uuid not null references proficiency_scale(id) on delete restrict,
  level_key       text not null,
  ordinal         int not null check (ordinal > 0),
  label_ar        text not null, label_en text not null,
  descriptor_ar   text not null, descriptor_en text not null,
  observable_at_this_level_ar text[] not null default '{}',
  observable_at_this_level_en text[] not null default '{}',
  unique (scale_id, level_key), unique (scale_id, ordinal)
);
comment on table proficiency_scale is 'How much someone knows. SEPARATE from evidence states (what they proved). Never mixed.';

create table recency_policy (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  applies_to      text not null,
  current_window_months int not null check (current_window_months > 0),
  aging_window_months   int not null check (aging_window_months >= current_window_months),
  stale_after_months    int not null check (stale_after_months >= aging_window_months),
  refresh_method  text not null,
  rationale       text not null,
  policy_version  text not null,
  review_status   review_state not null default 'draft',
  reviewed_by uuid, reviewed_at timestamptz, drafting_aid drafting_aid not null default 'none',
  is_demo_fixture boolean not null default false,
  created_at      timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table recency_policy is 'D-023: windows are initial values for calibration, not approved facts, until reviewed.';

-- ────────────────────────────── skill (extended) ───────────────────────────
-- The existing table is the global registry (DF-6). `id` is the canonical,
-- permanent identity; `slug` is the human code chosen at creation and never
-- changed even when names change (DF-3). Rows are never deleted: a wrong
-- skill is deprecated or merged, and its id can therefore never be reused.

alter table skill
  add column skill_family_id      uuid references skill_family(id) on delete restrict,
  add column skill_type           skill_type,
  add column description_ar       text,
  add column description_en       text,
  add column observable_indicators_ar text[] not null default '{}',
  add column observable_indicators_en text[] not null default '{}',
  add column common_failure_modes_ar  text[] not null default '{}',
  add column common_failure_modes_en  text[] not null default '{}',
  add column ai_substitutability  ai_substitutability,
  add column recency_policy_id    uuid references recency_policy(id) on delete restrict,
  add column proficiency_scale_id uuid references proficiency_scale(id) on delete restrict,
  add column evidence_types_possible evidence_type[] not null default '{}',
  add column status               skill_status not null default 'active',
  add column merged_into_id       uuid references skill(id) on delete restrict,
  add column review_status        review_state not null default 'draft',
  add column reviewed_by          uuid,
  add column reviewed_at          timestamptz,
  add column drafting_aid         drafting_aid not null default 'none',
  add column version              int not null default 1,
  add constraint skill_merge_points_elsewhere check (
    (status <> 'merged_into' and merged_into_id is null) or (status = 'merged_into' and merged_into_id is not null and merged_into_id <> id)
  );
comment on column skill.slug is 'Stable ASCII code chosen at creation; never changed when names change (DF-3). The canonical id is `id`.';
comment on column skill.label_ar is 'canonical_name_ar'; comment on column skill.label_en is 'canonical_name_en';
comment on column skill.family is 'Legacy free-text family; skill_family_id is authoritative.';

create function career_data_no_delete() returns trigger language plpgsql as $$
begin
  raise exception '% rows are never deleted: deprecate, merge or supersede instead (canonical ids are never reused)', tg_table_name;
end $$;
create trigger skill_no_delete before delete on skill for each row execute function career_data_no_delete();

create table skill_synonym (
  id              uuid primary key default gen_random_uuid(),
  skill_id        uuid not null references skill(id) on delete restrict,
  relation        synonym_relation not null,
  surface_form    text,
  language        text check (language in ('ar','en')),
  form_type       synonym_form_type,
  related_skill_id uuid references skill(id) on delete restrict,
  source_id       uuid references data_source(id) on delete restrict,
  decided_by      text,
  decided_at      timestamptz,
  confidence      source_reliability not null default 'medium',
  review_status   review_state not null default 'draft',
  reviewed_by uuid, reviewed_at timestamptz, drafting_aid drafting_aid not null default 'none',
  is_demo_fixture boolean not null default false,
  created_at      timestamptz not null default now(), updated_at timestamptz not null default now(),
  -- domain: assertSynonymWellFormed. A surface form names THIS skill; a link names ANOTHER. Never both.
  constraint synonym_shape check (
    (relation in ('equivalent','translation_variant') and surface_form is not null and length(btrim(surface_form)) > 0 and related_skill_id is null and language is not null)
    or
    (relation in ('broader','narrower','related','tool_of') and related_skill_id is not null and related_skill_id <> skill_id)
  )
);
create unique index skill_synonym_surface_unique on skill_synonym (skill_id, lower(surface_form), language) where surface_form is not null;
create unique index skill_synonym_link_unique on skill_synonym (skill_id, relation, related_skill_id) where related_skill_id is not null;
comment on table skill_synonym is 'Explicit, human-decided aliases and relations. broader/narrower/related/tool_of LINK skills; they never merge them.';

-- ───────────────────────────── target_role (extended) ──────────────────────

alter table target_role alter column review_status drop default;
alter table target_role alter column review_status type review_state
  using (case review_status::text when 'in_review' then 'curated' when 'deprecated' then 'superseded' else review_status::text end)::review_state;
alter table target_role alter column review_status set default 'draft';
alter table target_role
  add column family              text,
  add column level               role_level,
  add column description_ar      text,
  add column description_en      text,
  add column mission_statement_ar text,
  add column mission_statement_en text,
  add column typical_responsibilities_ar text[] not null default '{}',
  add column typical_responsibilities_en text[] not null default '{}',
  add column expected_outputs_ar text[] not null default '{}',
  add column expected_outputs_en text[] not null default '{}',
  add column expected_from_junior_ar text[] not null default '{}',
  add column expected_from_junior_en text[] not null default '{}',
  add column not_expected_from_junior_ar text[] not null default '{}',
  add column not_expected_from_junior_en text[] not null default '{}',
  add column region_scope        text,
  add column reviewed_by         uuid,
  add column reviewed_at         timestamptz,
  add column drafting_aid        drafting_aid not null default 'none',
  add column version             int not null default 1;
alter table target_role alter column is_demo_fixture set default false;
create trigger target_role_no_delete before delete on target_role for each row execute function career_data_no_delete();
comment on column target_role.label_ar is 'name_ar'; comment on column target_role.label_en is 'name_en';

create table role_tool (
  id              uuid primary key default gen_random_uuid(),
  target_role_id  uuid not null references target_role(id) on delete cascade,
  name            text not null,
  criticality     text not null check (criticality in ('essential','common','optional')),
  -- A tool may correspond to a tool-type skill, or to none. It never implies a framework.
  skill_id        uuid references skill(id) on delete restrict,
  note_en         text,
  unique (target_role_id, name)
);

-- ───────────────────────── role_requirement = RoleSkill ────────────────────
-- Role requirement ≠ user skill. Nothing here is ever copied into evidence.

alter table role_requirement alter column weight drop not null;
alter table role_requirement
  add column importance          importance_level,
  add column target_proficiency  text,
  add column why_required_ar     text,
  add column why_required_en     text,
  add column evidence_type_expected evidence_type[] not null default '{}',
  add column minimum_evidence_count int check (minimum_evidence_count > 0),
  add column can_be_partially_auto_evaluated boolean not null default false,
  add column human_review_required boolean not null default true,
  add column review_status       review_state not null default 'draft',
  add column reviewed_by         uuid,
  add column reviewed_at         timestamptz,
  add column drafting_aid        drafting_aid not null default 'none',
  add column version             int not null default 1,
  add column is_demo_fixture     boolean not null default false,
  add column updated_at          timestamptz not null default now();
comment on column role_requirement.weight is 'Gap weight — TBD until calibrated (D-052). NULL means "not decided", never 0.';
comment on column role_requirement.is_core is 'is_core_for_role: a property of the MAPPING, not of the skill (DF-6).';
create trigger role_requirement_touch before update on role_requirement for each row execute function touch_updated_at();

-- ───────────────────────────────── task library ────────────────────────────

create table task (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^tsk_[a-z0-9_]+$'),
  target_role_id  uuid not null references target_role(id) on delete restrict,
  title_ar        text not null, title_en text not null,
  description_ar  text not null, description_en text not null,
  frequency       task_frequency not null,
  complexity      complexity_level not null,
  expected_output_ar text not null, expected_output_en text not null,
  expected_output_kind text not null,
  typical_inputs_en text[] not null default '{}',
  common_tools    text[] not null default '{}',
  common_failure_modes_ar text[] not null default '{}',
  common_failure_modes_en text[] not null default '{}',
  realism_notes_en text,
  review_status   review_state not null default 'draft',
  reviewed_by uuid, reviewed_at timestamptz, drafting_aid drafting_aid not null default 'none',
  version         int not null default 1,
  is_demo_fixture boolean not null default false,
  created_at      timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger task_touch before update on task for each row execute function touch_updated_at();
create trigger task_no_delete before delete on task for each row execute function career_data_no_delete();
create table task_skill (
  task_id     uuid not null references task(id) on delete cascade,
  skill_id    uuid not null references skill(id) on delete restrict,
  involvement skill_involvement not null,
  primary key (task_id, skill_id)
);

-- ───────────────────────────── activity_spec (extended) ────────────────────

-- The read policy depends on the column type; recreate it around the change.
drop policy activity_spec_read_published on activity_spec;
alter table activity_spec drop constraint activity_spec_published_is_frozen;
alter table activity_spec alter column status drop default;
alter table activity_spec alter column status type review_state
  using (case status::text when 'in_review' then 'curated' when 'deprecated' then 'superseded' else status::text end)::review_state;
alter table activity_spec alter column status set default 'draft';
create policy activity_spec_read_published on activity_spec for select to authenticated, anon using (status = 'published');
alter table activity_spec add constraint activity_spec_published_is_frozen check (status <> 'published' or published_at is not null);
alter table activity_spec alter column spec drop not null;
alter table activity_spec
  add column target_role_id      uuid references target_role(id) on delete restrict,
  add column level               role_level,
  add column title_en            text,
  add column business_context_ar text,
  add column business_context_en text,
  add column objective_ar        text,
  add column objective_en        text,
  add column can_yield_demonstrated boolean not null default true,
  add column is_validation_activity boolean not null default false,
  add column evidence_strength_class evidence_source_strength not null default 'platform_controlled',
  add column reviewed_by         uuid,
  add column reviewed_at         timestamptz,
  add column drafting_aid        drafting_aid not null default 'none',
  add column authoring_effort_minutes int check (authoring_effort_minutes > 0),
  add column updated_at          timestamptz not null default now();
alter table activity_spec alter column is_demo_fixture set default false;
comment on column activity_spec.spec is 'Legacy narrative snapshot (nullable). Structure lives in activity_input, activity_deliverable, activity_skill, activity_task, integrity_check_spec.';
comment on column activity_spec.status is 'review_state; the product consumes published only.';
create trigger activity_spec_touch before update on activity_spec for each row execute function touch_updated_at();
create trigger activity_spec_no_delete before delete on activity_spec for each row execute function career_data_no_delete();

create table activity_input (
  id                uuid primary key default gen_random_uuid(),
  activity_spec_id  uuid not null references activity_spec(id) on delete cascade,
  key               text not null,
  description_ar    text not null, description_en text not null,
  is_platform_private boolean not null default true,
  contains_planted_issue boolean not null default false,
  unique (activity_spec_id, key)
);
create table activity_deliverable (
  id                uuid primary key default gen_random_uuid(),
  activity_spec_id  uuid not null references activity_spec(id) on delete cascade,
  key               text not null,
  format            text not null,
  mandatory         boolean not null default true,
  description_ar    text not null, description_en text not null,
  position          int not null default 0,
  unique (activity_spec_id, key)
);
create table activity_skill (
  activity_spec_id  uuid not null references activity_spec(id) on delete cascade,
  skill_id          uuid not null references skill(id) on delete restrict,
  depth             skill_involvement not null,
  primary key (activity_spec_id, skill_id)
);
create table activity_task (
  activity_spec_id  uuid not null references activity_spec(id) on delete cascade,
  task_id           uuid not null references task(id) on delete restrict,
  primary key (activity_spec_id, task_id)
);

-- integrity checks are part of the ActivitySpec (MD-09); typed by purpose.
alter table integrity_check_spec
  add column check_type            integrity_check_type,
  add column location_en           text,
  add column expected_user_behavior_en text,
  add column raw_ai_output_behavior_en text,
  add column linked_criterion_key  text,
  add column weight                numeric(4,3) check (weight is null or (weight > 0 and weight <= 1)),
  add constraint integrity_check_type_matches_classification check (
    check_type is null
    or (classification = 'user_facing' and check_type in ('clarification_question','explanation_question','followup_modification'))
    or (classification = 'assessment_only' and check_type in ('planted_inconsistency','deterministic_signal','edge_case','output_consistency','expected_failure_mode'))
  );
comment on constraint integrity_check_type_matches_classification on integrity_check_spec is
  'User-facing checks are questions and follow-ups (understanding + independence); assessment-only checks are signals never shown.';

-- ───────────────────────────── rubrics (normalized) ────────────────────────

alter table rubric_version drop constraint rubric_published_is_frozen;
alter table rubric_version alter column status drop default;
alter table rubric_version alter column status type review_state
  using (case status::text when 'in_review' then 'curated' when 'deprecated' then 'superseded' else status::text end)::review_state;
alter table rubric_version alter column status set default 'draft';
alter table rubric_version add constraint rubric_published_is_frozen check (status <> 'published' or published_at is not null);
alter table rubric_version alter column criteria drop not null;
alter table rubric_version
  add column pass_threshold      numeric(4,3) check (pass_threshold is null or (pass_threshold > 0 and pass_threshold <= 1)),
  add column proposes_state      evidence_state,
  add column scoring_policy_version text,
  add column golden_set_size     int check (golden_set_size is null or golden_set_size > 0),
  add column agreement_rate      numeric(4,3) check (agreement_rate is null or (agreement_rate >= 0 and agreement_rate <= 1)),
  add column includes_raw_ai_submission boolean,
  add column reviewed_by         uuid,
  add column reviewed_at         timestamptz,
  add column drafting_aid        drafting_aid not null default 'none',
  add column is_demo_fixture     boolean not null default false,
  add constraint rubric_never_proposes_verified check (proposes_state is null or proposes_state <> 'verified');
comment on column rubric_version.criteria is 'Legacy snapshot (nullable). rubric_criterion rows are authoritative; the evaluator reads rows first.';
create trigger rubric_version_no_delete before delete on rubric_version for each row execute function career_data_no_delete();

create table criterion_library (
  id              uuid primary key default gen_random_uuid(),
  key             text not null unique check (key ~ '^core\.[a-z_]+\.[a-z_]+$'),
  name_ar         text not null, name_en text not null,
  dimension       rubric_dimension not null,
  description_ar  text not null, description_en text not null,
  default_evaluator evaluator_type not null default 'human',
  review_status   review_state not null default 'draft',
  reviewed_by uuid, reviewed_at timestamptz, drafting_aid drafting_aid not null default 'none',
  is_demo_fixture boolean not null default false,
  created_at      timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table rubric_criterion (
  id                  uuid primary key default gen_random_uuid(),
  rubric_version_id   uuid not null references rubric_version(id) on delete cascade,
  key                 text not null,
  position            int not null default 0,
  name_ar             text not null, name_en text not null,
  dimension           rubric_dimension not null,
  -- A criterion without a linked skill produces no evidence; this foundation requires one.
  linked_skill_id     uuid not null references skill(id) on delete restrict,
  library_criterion_id uuid references criterion_library(id) on delete restrict,
  source              text not null check (source in ('core','track','activity')),
  weight              numeric(5,3) not null check (weight > 0),
  max_score           int not null check (max_score > 0),
  mandatory           boolean not null default false,
  threshold_for_skill numeric(4,3) check (threshold_for_skill is null or (threshold_for_skill > 0 and threshold_for_skill <= 1)),
  evaluator_type      evaluator_type not null,
  human_review_required boolean not null,
  -- deterministic check, as typed columns (domain: CriterionCheck)
  check_type          criterion_check_type not null default 'none',
  check_artifact_key  text,
  check_min_value     numeric,
  check_min_length    int,
  check_artifact_keys text[],
  description_ar      text not null, description_en text not null,
  expected_evidence_ar text not null, expected_evidence_en text not null,
  excerpt_guidance_en text,
  rationale_when_met_ar text not null,
  rationale_when_unmet_ar text not null,
  created_at          timestamptz not null default now(),
  unique (rubric_version_id, key),
  constraint rubric_criterion_check_shape check (
    (check_type = 'none' and check_artifact_key is null and check_artifact_keys is null)
    or (check_type in ('artifact_present') and check_artifact_key is not null)
    or (check_type = 'artifact_at_least' and check_artifact_key is not null and check_min_value is not null)
    or (check_type = 'artifact_text' and check_artifact_key is not null and check_min_length is not null)
    or (check_type = 'all_of' and check_artifact_keys is not null and array_length(check_artifact_keys, 1) > 0)
  ),
  -- A rule-evaluated criterion has a rule; a human/llm one has none.
  constraint rubric_criterion_rule_has_check check (
    (evaluator_type = 'rule' and check_type <> 'none') or (evaluator_type <> 'rule' and check_type = 'none')
  ),
  constraint rubric_criterion_human_flag check (evaluator_type <> 'human' or human_review_required = true)
);
create table rubric_criterion_level (
  id              uuid primary key default gen_random_uuid(),
  criterion_id    uuid not null references rubric_criterion(id) on delete cascade,
  level_key       text not null,
  score           int not null check (score >= 0),
  descriptor_ar   text not null, descriptor_en text not null,
  observable_evidence_en text not null,
  unique (criterion_id, level_key), unique (criterion_id, score)
);

-- A published rubric is frozen: its criteria and levels cannot change.
create function rubric_criterion_frozen() returns trigger language plpgsql as $$
declare st review_state; rid uuid;
begin
  rid := coalesce(new.rubric_version_id, old.rubric_version_id);
  select status into st from rubric_version where id = rid;
  if st in ('published','superseded') then
    raise exception 'rubric % is % and its criteria are frozen; publish a new version', rid, st;
  end if;
  return coalesce(new, old);
end $$;
create trigger rubric_criterion_frozen_trg before insert or update or delete on rubric_criterion
  for each row execute function rubric_criterion_frozen();

-- ───────────────────────────── learning resources ──────────────────────────

alter table learning_resource
  add column code                text unique,
  add column title_ar            text,
  add column provider            text,
  add column resource_type       resource_type,
  add column level               text,
  add column duration_minutes    int check (duration_minutes is null or duration_minutes > 0),
  add column free_or_paid        free_or_paid,
  add column why_recommended_ar  text,
  add column why_recommended_en  text,
  add column covers_target_level boolean,
  add column quality_status      resource_quality not null default 'unverified',
  add column last_checked        date,
  add column practice_activity_spec_id uuid references activity_spec(id) on delete restrict,
  add column access_notes_en     text,
  add column review_status       review_state not null default 'draft',
  add column reviewed_by         uuid,
  add column reviewed_at         timestamptz,
  add column drafting_aid        drafting_aid not null default 'none',
  add column is_demo_fixture     boolean not null default false,
  add column updated_at          timestamptz not null default now(),
  -- No invented URLs: no URL ⇒ unverified (or retired). Ever.
  add constraint learning_resource_no_url_means_unverified check (
    url is not null or quality_status in ('unverified','retired')
  );
comment on column learning_resource.title is 'title_en';
create trigger learning_resource_touch before update on learning_resource for each row execute function touch_updated_at();

-- ───────────────────────────── presentation rules ──────────────────────────

create table career_presentation_rule (
  id                     uuid primary key default gen_random_uuid(),
  asset_type             presentation_asset_type not null,
  evidence_level         evidence_state not null,
  allowed                boolean not null,
  minimum_source_strength evidence_source_strength,
  minimum_evidence_count int not null default 1 check (minimum_evidence_count > 0),
  requires_verified      boolean not null default false,
  allowed_claim_verbs_ar text[] not null default '{}',
  allowed_claim_verbs_en text[] not null default '{}',
  forbidden_phrases_ar   text[] not null default '{}',
  forbidden_phrases_en   text[] not null default '{}',
  template_pattern_en    text,
  must_cite_evidence     boolean not null default true check (must_cite_evidence = true),
  numeric_claims_policy_en text not null default 'no number unless it appears in the submission itself',
  ai_disclosure_handling_en text,
  recency_handling_en    text,
  language_target        text not null default 'en' check (language_target in ('ar','en')),
  on_user_edit_en        text not null default 'an edit outside the evidence drops the verified tag',
  review_status          review_state not null default 'draft',
  reviewed_by uuid, reviewed_at timestamptz, drafting_aid drafting_aid not null default 'none',
  version                int not null default 1,
  is_demo_fixture        boolean not null default false,
  created_at             timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (asset_type, evidence_level),
  constraint presentation_gap_never_allowed check (evidence_level <> 'gap' or allowed = false),
  constraint presentation_allowed_has_verbs check (allowed = false or array_length(allowed_claim_verbs_en, 1) > 0)
);
comment on table career_presentation_rule is 'No career asset without evidence at the level the rule names. must_cite_evidence is always true by constraint.';

-- ───────────────────────────── provenance & review ─────────────────────────

create table source_ref (
  id           uuid primary key default gen_random_uuid(),
  entity_kind  career_entity_kind not null,
  entity_id    uuid not null,
  source_id    uuid not null references data_source(id) on delete restrict,
  source_version text,
  note_en      text,
  created_at   timestamptz not null default now(),
  unique (entity_kind, entity_id, source_id)
);
create index source_ref_entity_idx on source_ref(entity_kind, entity_id);
comment on table source_ref is 'Every career-data record traces to at least one source. Existence of entity_id is checked by the quality rules (polymorphic by explicit enum).';

create table review_log (
  id               uuid primary key default gen_random_uuid(),
  entity_kind      career_entity_kind not null,
  entity_id        uuid not null,
  from_status      review_state,
  to_status        review_state not null,
  decided_by       uuid,
  decided_by_label text,
  role_performed   reviewer_role not null,
  reason           text not null check (length(btrim(reason)) > 0),
  duration_minutes int check (duration_minutes is null or duration_minutes >= 0),
  conflict_of_interest boolean not null default false,
  decided_at       timestamptz not null default now(),
  -- An SME decision has a person behind it. Always.
  constraint review_log_sme_is_named check (role_performed <> 'sme' or decided_by is not null)
);
create index review_log_entity_idx on review_log(entity_kind, entity_id, decided_at desc);

-- Generic guard for every reviewed table (domain: assertReviewTransition).
create function career_data_review_guard() returns trigger language plpgsql as $$
declare
  allowed boolean;
begin
  if tg_op = 'INSERT' then
    -- A record is born draft or curated. A DEMO fixture may be seeded in any
    -- state except the two that mean a person approved it.
    if new.is_demo_fixture then
      if new.review_status in ('sme_reviewed','approved') then
        raise exception 'a DEMO fixture is never SME reviewed or approved (%: %)', tg_table_name, new.review_status;
      end if;
      return new;
    end if;
    if new.review_status not in ('draft','curated') then
      raise exception 'a new % record is born draft or curated, not %', tg_table_name, new.review_status;
    end if;
    return new;
  end if;

  if new.review_status = old.review_status then return new; end if;

  allowed := case old.review_status
    when 'draft' then new.review_status in ('curated','superseded')
    when 'curated' then new.review_status in ('sme_reviewed','rejected','needs_revision','superseded', 'published')
    when 'sme_reviewed' then new.review_status in ('approved','rejected','needs_revision','superseded')
    when 'approved' then new.review_status in ('published','needs_revision','superseded')
    when 'published' then new.review_status in ('superseded')
    when 'rejected' then new.review_status in ('curated')
    when 'needs_revision' then new.review_status in ('curated')
    else false end;
  -- curated → published is the DEMO-only shortcut; everyone else goes through approval.
  if old.review_status = 'curated' and new.review_status = 'published' and not new.is_demo_fixture then allowed := false; end if;
  if not allowed then
    raise exception 'career data review: % → % is not a permitted transition on %', old.review_status, new.review_status, tg_table_name;
  end if;

  if new.is_demo_fixture then
    if new.review_status in ('sme_reviewed','approved') then
      raise exception 'a DEMO fixture is never SME reviewed or approved';
    end if;
    return new;
  end if;
  if new.review_status in ('sme_reviewed','approved','rejected','needs_revision') and (new.reviewed_by is null or new.reviewed_at is null) then
    raise exception '% requires reviewed_by and reviewed_at: nothing is marked SME-reviewed automatically', new.review_status;
  end if;
  if new.review_status = 'published' and old.review_status <> 'approved' then
    raise exception 'only an approved record can be published';
  end if;
  if new.drafting_aid = 'ai_assisted' and new.review_status in ('approved','published') and new.reviewed_by is null then
    raise exception 'AI-assisted content is never approved or published without a named reviewer (DF-10)';
  end if;
  return new;
end $$;

-- activity_spec and rubric_version name their status column `status`; a thin
-- adapter maps it onto the same rule.
create function career_data_review_guard_status() returns trigger language plpgsql as $$
declare
  n record; o record;
begin
  -- Reuse the generic guard by projecting `status` as `review_status`.
  if tg_op = 'INSERT' then
    if new.is_demo_fixture then
      if new.status in ('sme_reviewed','approved') then raise exception 'a DEMO fixture is never SME reviewed or approved (%)', tg_table_name; end if;
      return new;
    end if;
    if new.status not in ('draft','curated') then raise exception 'a new % record is born draft or curated, not %', tg_table_name, new.status; end if;
    return new;
  end if;
  if new.status = old.status then return new; end if;
  if not (case old.status
    when 'draft' then new.status in ('curated','superseded')
    when 'curated' then new.status in ('sme_reviewed','rejected','needs_revision','superseded','published')
    when 'sme_reviewed' then new.status in ('approved','rejected','needs_revision','superseded')
    when 'approved' then new.status in ('published','needs_revision','superseded')
    when 'published' then new.status in ('superseded')
    when 'rejected' then new.status in ('curated')
    when 'needs_revision' then new.status in ('curated')
    else false end) then
    raise exception 'career data review: % → % is not a permitted transition on %', old.status, new.status, tg_table_name;
  end if;
  if old.status = 'curated' and new.status = 'published' and not new.is_demo_fixture then
    raise exception 'only an approved record can be published';
  end if;
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  if new.is_demo_fixture then
    if new.status in ('sme_reviewed','approved') then raise exception 'a DEMO fixture is never SME reviewed or approved'; end if;
    return new;
  end if;
  if new.status in ('sme_reviewed','approved','rejected','needs_revision') and (new.reviewed_by is null or new.reviewed_at is null) then
    raise exception '% requires reviewed_by and reviewed_at: nothing is marked SME-reviewed automatically', new.status;
  end if;
  if new.status = 'published' and old.status <> 'approved' then raise exception 'only an approved record can be published'; end if;
  if new.drafting_aid = 'ai_assisted' and new.status in ('approved','published') and new.reviewed_by is null then
    raise exception 'AI-assisted content is never approved or published without a named reviewer (DF-10)';
  end if;
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['data_source','skill_family','proficiency_scale','recency_policy','skill','skill_synonym','target_role',
                           'role_requirement','task','criterion_library','learning_resource','career_presentation_rule']
  loop
    execute format('create trigger %1$I_review_guard before insert or update on %1$I for each row execute function career_data_review_guard()', t);
  end loop;
  foreach t in array array['activity_spec','rubric_version'] loop
    execute format('create trigger %1$I_review_guard before insert or update on %1$I for each row execute function career_data_review_guard_status()', t);
  end loop;
end $$;

-- ───────────────────────────── import pipeline (L0 / L1) ───────────────────

create table raw_snapshot (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references data_source(id) on delete restrict,
  pack_id       text not null,
  pack_version  text not null,
  file_name     text not null,
  sha256        text not null,
  captured_at   timestamptz not null default now(),
  capture_method text not null,
  -- JSONB justified: an L0 snapshot is the source file archived verbatim; it is never queried as domain state.
  content       jsonb not null,
  layer         data_layer not null default 'raw' check (layer = 'raw'),
  unique (pack_id, pack_version, file_name, sha256)
);
create trigger raw_snapshot_no_delete before delete on raw_snapshot for each row execute function career_data_no_delete();
create function raw_snapshot_immutable() returns trigger language plpgsql as $$
begin raise exception 'raw snapshots are immutable; capture a new one'; end $$;
create trigger raw_snapshot_immutable_trg before update on raw_snapshot for each row execute function raw_snapshot_immutable();

create table normalized_record (
  id            uuid primary key default gen_random_uuid(),
  snapshot_id   uuid not null references raw_snapshot(id) on delete cascade,
  entity_kind   career_entity_kind not null,
  code          text not null,
  language      text not null check (language in ('ar','en')),
  surface_text  text not null,
  match_key     text not null,
  layer         data_layer not null default 'normalized' check (layer = 'normalized'),
  created_at    timestamptz not null default now()
);
create index normalized_record_key_idx on normalized_record(entity_kind, match_key);
comment on table normalized_record is 'L1: fully regenerable from L0. No semantic decision lives here.';

create table dedup_candidate (
  id            uuid primary key default gen_random_uuid(),
  snapshot_id   uuid references raw_snapshot(id) on delete cascade,
  a_code        text not null,
  b_code        text not null,
  similarity    numeric(4,3) not null,
  on_field      text not null,
  proposed_relation synonym_relation,
  decision      text not null default 'proposed' check (decision in ('proposed','merge','link','keep_separate','rejected')),
  decided_by    text,
  decided_at    timestamptz,
  decision_reason text,
  created_at    timestamptz not null default now(),
  unique (a_code, b_code),
  constraint dedup_decision_is_documented check (decision = 'proposed' or (decided_by is not null and decision_reason is not null))
);
comment on table dedup_candidate is 'Near-Duplicate Report rows. The pipeline PROPOSES; a person DECIDES; nothing merges automatically.';

-- ──────────────────────────────── RLS ──────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['data_source','skill_family','proficiency_scale','proficiency_level','recency_policy','skill_synonym','role_tool',
    'task','task_skill','activity_input','activity_deliverable','activity_skill','activity_task','criterion_library','rubric_criterion',
    'rubric_criterion_level','career_presentation_rule','source_ref','review_log','raw_snapshot','normalized_record','dedup_candidate']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('grant select, insert, update, delete on %I to service_role', t);
  end loop;
  -- Reference data a signed-in user may read, published only where it is content.
  foreach t in array array['skill_family','proficiency_scale','proficiency_level','recency_policy','skill_synonym','career_presentation_rule','criterion_library','role_tool'] loop
    execute format('grant select on %I to authenticated, anon', t);
  end loop;
  foreach t in array array['task','activity_input','activity_deliverable','activity_skill','activity_task'] loop
    execute format('grant select on %I to authenticated, anon', t);
  end loop;
end $$;

create policy skill_family_read on skill_family for select to authenticated, anon using (true);
create policy proficiency_scale_read on proficiency_scale for select to authenticated, anon using (true);
create policy proficiency_level_read on proficiency_level for select to authenticated, anon using (true);
create policy recency_policy_read on recency_policy for select to authenticated, anon using (true);
create policy skill_synonym_read on skill_synonym for select to authenticated, anon using (true);
create policy role_tool_read on role_tool for select to authenticated, anon using (true);
create policy presentation_rule_read_published on career_presentation_rule for select to authenticated, anon using (review_status = 'published');
create policy criterion_library_read_none on criterion_library for select to authenticated using (false);
-- Tasks and activity structure: published only (a draft is not content a user sees).
create policy task_read_published on task for select to authenticated, anon using (review_status = 'published');
create policy activity_input_read_published on activity_input for select to authenticated, anon
  using (exists (select 1 from activity_spec a where a.id = activity_spec_id and a.status = 'published'));
create policy activity_deliverable_read_published on activity_deliverable for select to authenticated, anon
  using (exists (select 1 from activity_spec a where a.id = activity_spec_id and a.status = 'published'));
create policy activity_skill_read_published on activity_skill for select to authenticated, anon
  using (exists (select 1 from activity_spec a where a.id = activity_spec_id and a.status = 'published'));
create policy activity_task_read_published on activity_task for select to authenticated, anon
  using (exists (select 1 from activity_spec a where a.id = activity_spec_id and a.status = 'published'));
-- Rubric criteria are assessment material: never readable by a client (as rubric_version).
create policy rubric_criterion_read_none on rubric_criterion for select to authenticated using (false);
create policy rubric_criterion_level_read_none on rubric_criterion_level for select to authenticated using (false);
-- Provenance, review log and pipeline layers: service only. No client policy at all.
