-- 0011 — Evidence System (Configurable Track Architecture, Phase 1).
--
-- What this adds: a flexible, typed EVIDENCE LEDGER beside the existing
-- evaluated-fact table `evidence`. The two are deliberately different things:
--
--   evidence          an evaluated FACT: written only by an evaluation (INV-1),
--                     moves a claim, feeds readiness and professional claims.
--                     UNCHANGED by this migration (no column, no row rewritten).
--
--   evidence_item     a typed RECORD of material the user (or the system)
--                     put forward: repository link, file, text, submission,
--                     automated check result, disclosure, previous attempt…
--                     It never moves a claim by itself (INV-1 stays intact).
--                     An item can be linked to several skills.
--
--   evidence_derivation  the explicit bridge: which items an evaluated fact
--                     was derived from. The fact keeps pointing at its
--                     evaluation result; the bridge is additive.
--
-- Why a separate ledger and not columns on `evidence`: today every reader of
-- `evidence` (skill counts, agents, the report, D-077 withdrawal) treats a row
-- as "proven by an evaluation". Writing user-submitted material into that
-- table would change evidence counts and agent facts before any evaluation —
-- a production behaviour change Phase 1 is not allowed to make.
--
-- Every expert-dependent value seeded here (the type registry) is
-- DRAFT / NOT VALIDATED: review_status = 'draft', approved_by = null.

-- ───────────────────────── evidence type registry (data, not enum) ─────────────────────────
-- A new evidence type is a ROW, not a migration. `channel` is the shape the
-- item must satisfy (checked by trigger below); `required_fields` names metadata
-- keys the type needs; `match_rule` lets the system classify a URL or an
-- activity deliverable without a hard-coded mapping in code.
create table evidence_item_type (
  code              text primary key check (code ~ '^[a-z][a-z0-9_]{2,63}$'),
  label_ar          text not null,
  label_en          text not null,
  description_en    text not null,
  channel           text not null check (channel in ('url','file','text','activity','system')),
  required_fields   jsonb not null default '[]'::jsonb,
  match_rule        jsonb not null default '{}'::jsonb,
  enabled           boolean not null default true,
  display_order     int not null default 0,
  -- Expert validation state. Nothing here is approved until a named SME approves it.
  review_status     review_state not null default 'draft',
  approved_by       text,
  approved_at       timestamptz,
  validation_note_en text not null default 'DRAFT / NOT VALIDATED — pending expert validation',
  version           int not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint evidence_item_type_required_fields_is_array check (jsonb_typeof(required_fields) = 'array'),
  constraint evidence_item_type_match_rule_is_object check (jsonb_typeof(match_rule) = 'object'),
  constraint evidence_item_type_approved_is_recorded check (
    review_status not in ('approved','published') or (approved_by is not null and approved_at is not null)
  )
);
comment on table evidence_item_type is
  'Registry of evidence types (Phase 1). A type is a data row, never a code enum. Seeded rows are DRAFT / NOT VALIDATED.';
comment on column evidence_item_type.match_rule is
  'Classification hints for system-created items: {"url_host_suffixes":[…],"url_path_pattern":"…","url_fallback":true,"deliverable_format":"…","activity_kind":"…"}.';
create trigger evidence_type_touch before update on evidence_item_type for each row execute function touch_updated_at();

insert into evidence_item_type (code, label_ar, label_en, description_en, channel, required_fields, match_rule, display_order) values
  ('github_repository',      'مستودع GitHub',          'GitHub Repository',      'A public repository the user owns or contributed to.',                       'url',      '[]', '{"url_host_suffixes":["github.com"],"url_path_pattern":"^/[^/]+/[^/]+/?$"}', 10),
  ('github_commit_diff',     'إيداع / فرق GitHub',     'GitHub commit / diff',   'A specific commit, compare view or pull request.',                            'url',      '[]', '{"url_host_suffixes":["github.com"],"url_path_pattern":"/(commit|compare|pull)/"}', 20),
  ('live_demo_url',          'رابط عرض حي',            'Live Demo URL',          'A deployed page or app the reviewer can open.',                               'url',      '[]', '{}', 30),
  ('external_url',           'رابط خارجي',             'External link',          'Any other http(s) link; used when no more specific URL type matches.',        'url',      '[]', '{"url_fallback":true}', 35),
  ('screenshot',             'لقطة شاشة',              'Screenshot',             'An image of the running work.',                                               'file',     '[]', '{"content_type_prefix":"image/"}', 40),
  ('file_upload',            'ملف مرفوع',              'File Upload',            'A file the user uploaded through a signed upload.',                           'file',     '[]', '{"deliverable_format":"source file","file_fallback":true}', 50),
  ('code_submission',        'تسليم كود',              'Code submission',        'A locked submission of work on a platform activity.',                         'activity', '["submission_id"]', '{"activity_fallback":true}', 60),
  ('text_explanation',       'شرح نصي',                'Text explanation',       'A written explanation, note or answer the user provided.',                    'text',     '[]', '{"deliverable_format":"text"}', 70),
  ('bug_fix',                'إصلاح خطأ',              'Bug Fix',                'Work on a debugging / fix activity.',                                         'activity', '["submission_id"]', '{"activity_kind":"debug_improve"}', 80),
  ('short_task',             'مهمة قصيرة',             'Short Task',             'A small bounded task.',                                                       'activity', '["submission_id"]', '{"activity_kind":"short_task"}', 90),
  ('project',                'مشروع',                  'Project',                'A larger piece of work spanning several deliverables.',                       'activity', '["submission_id"]', '{"activity_kind":"project"}', 100),
  ('code_review',            'مراجعة كود',             'Code Review',            'The user reviewed code and recorded findings.',                               'activity', '["submission_id"]', '{"activity_kind":"code_review"}', 110),
  ('code_reading',           'قراءة كود',              'Code Reading',           'The user read code and explained it.',                                        'activity', '["submission_id"]', '{"activity_kind":"code_reading"}', 120),
  ('automated_check_result', 'نتيجة فحص آلي',          'Automated Check Result', 'The recorded outcome of a deterministic evaluation run.',                     'system',   '["evaluation_result_id"]', '{}', 130),
  ('user_reflection',        'تأمّل المستخدم',         'User Reflection',        'What the user says they learned or would do differently.',                    'text',     '[]', '{}', 140),
  ('ai_usage_disclosure',    'إفصاح استخدام AI',       'AI Usage Disclosure',    'The user''s declaration of how AI was used for a submission.',                'system',   '["submission_id"]', '{}', 150),
  ('previous_attempt',       'محاولة سابقة',           'Previous Attempt',       'A link to an earlier attempt at the same activity.',                          'system',   '["previous_item_id"]', '{}', 160);

-- ───────────────────────────────── evidence items ─────────────────────────────────
create table evidence_item (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references app_user(id) on delete cascade,
  item_type_code    text not null references evidence_item_type(code) on delete restrict,
  -- Context (all optional: a user may add evidence outside any activity).
  target_role_id        uuid references target_role(id) on delete restrict,
  activity_spec_id      uuid references activity_spec(id) on delete restrict,
  project_id            uuid references project(id) on delete restrict,
  submission_id         uuid references submission(id) on delete restrict,
  evaluation_result_id  uuid references evaluation_result(id) on delete restrict,
  parent_item_id        uuid references evidence_item(id) on delete restrict,
  -- Who put it forward.
  source                text not null check (source in ('user_direct','user_submission','system')),
  -- Content.
  title                 text not null check (length(btrim(title)) > 0),
  description           text,
  url                   text,
  upload_id             uuid references upload(id) on delete restrict,
  artifact_key          text,
  metadata              jsonb not null default '{}'::jsonb,
  -- Lifecycle.
  status                text not null default 'submitted' check (status in ('draft','submitted','withdrawn','superseded')),
  submitted_at          timestamptz,
  attempt_number        int not null default 1 check (attempt_number >= 1),
  supersedes_item_id    uuid references evidence_item(id) on delete restrict,
  withdrawn_at          timestamptz,
  withdrawn_reason      text,
  version               int not null default 1,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint evidence_item_metadata_is_object check (jsonb_typeof(metadata) = 'object'),
  constraint evidence_item_submitted_has_time check (status <> 'submitted' or submitted_at is not null),
  constraint evidence_item_withdrawn_has_reason check (
    withdrawn_at is null or length(btrim(coalesce(withdrawn_reason,''))) > 0
  ),
  constraint evidence_item_withdrawn_status check ((status = 'withdrawn') = (withdrawn_at is not null)),
  constraint evidence_item_not_self_parent check (parent_item_id is null or parent_item_id <> id),
  constraint evidence_item_not_self_supersede check (supersedes_item_id is null or supersedes_item_id <> id)
);
comment on table evidence_item is
  'Typed ledger of evidence material (Phase 1). An item NEVER moves a skill claim: only an evaluation does (INV-1). Immutable after submission except withdraw/supersede.';
comment on column evidence_item.artifact_key is
  'For submission-created items: the submission_artifact key this item mirrors (resolved from activity_deliverable, legacy fallback otherwise).';
create index evidence_item_user_idx on evidence_item(user_id, created_at desc);
create index evidence_item_submission_idx on evidence_item(submission_id) where submission_id is not null;
create index evidence_item_project_idx on evidence_item(project_id) where project_id is not null;
create trigger evidence_item_touch before update on evidence_item for each row execute function touch_updated_at();

-- Shape by channel: the registry decides what an item of a type must carry.
create or replace function evidence_item_shape_guard() returns trigger language plpgsql as $$
declare t record; f text;
begin
  select * into t from evidence_item_type where code = new.item_type_code;
  if t is null then raise exception 'unknown evidence type %', new.item_type_code; end if;
  if not t.enabled and tg_op = 'INSERT' then raise exception 'evidence type % is disabled', new.item_type_code; end if;
  if t.channel = 'url' and new.url is null then raise exception 'evidence type % needs a url', new.item_type_code; end if;
  if t.channel = 'file' and new.upload_id is null then raise exception 'evidence type % needs an upload', new.item_type_code; end if;
  if t.channel = 'text' and length(btrim(coalesce(new.description,''))) = 0 then raise exception 'evidence type % needs a description', new.item_type_code; end if;
  if t.channel = 'activity' and new.submission_id is null then raise exception 'evidence type % needs a submission', new.item_type_code; end if;
  if t.channel = 'system' and new.source <> 'system' then raise exception 'evidence type % is system-created only', new.item_type_code; end if;
  for f in select jsonb_array_elements_text(t.required_fields) loop
    if not (new.metadata ? f)
       and not (f = 'submission_id' and new.submission_id is not null)
       and not (f = 'evaluation_result_id' and new.evaluation_result_id is not null)
       and not (f = 'previous_item_id' and new.supersedes_item_id is not null) then
      raise exception 'evidence type % requires field %', new.item_type_code, f;
    end if;
  end loop;
  return new;
end $$;
create trigger evidence_item_shape before insert or update on evidence_item for each row execute function evidence_item_shape_guard();

-- Immutable after submission: only the lifecycle columns may change.
create or replace function evidence_item_immutable_guard() returns trigger language plpgsql as $$
begin
  if old.status = 'draft' then return new; end if;
  if new.user_id <> old.user_id or new.item_type_code <> old.item_type_code
     or new.title is distinct from old.title or new.description is distinct from old.description
     or new.url is distinct from old.url or new.upload_id is distinct from old.upload_id
     or new.metadata is distinct from old.metadata or new.submission_id is distinct from old.submission_id
     or new.project_id is distinct from old.project_id or new.activity_spec_id is distinct from old.activity_spec_id
     or new.evaluation_result_id is distinct from old.evaluation_result_id
     or new.attempt_number <> old.attempt_number or new.submitted_at is distinct from old.submitted_at then
    raise exception 'evidence_item is immutable after submission: a changed item is a new item that supersedes this one';
  end if;
  if old.status in ('withdrawn','superseded') and new.status <> old.status then
    raise exception 'evidence_item status % is terminal', old.status;
  end if;
  return new;
end $$;
create trigger evidence_item_immutable before update on evidence_item for each row execute function evidence_item_immutable_guard();
create or replace function evidence_item_no_delete() returns trigger language plpgsql as $$
begin raise exception 'evidence_item rows are never deleted; withdraw instead'; end $$;
create trigger evidence_item_no_delete_trg before delete on evidence_item for each row execute function evidence_item_no_delete();

-- ─────────────────────────── item ↔ skill (many-to-many) ───────────────────────────
-- Mapping lives apart from the item so one item can speak to several skills
-- and the link itself can carry who made it. `weight` is reserved and stays
-- NULL: no number is invented before expert validation.
create table evidence_item_skill (
  evidence_item_id  uuid not null references evidence_item(id) on delete cascade,
  skill_id          uuid not null references skill(id) on delete restrict,
  user_id           uuid not null references app_user(id) on delete cascade,
  link_role         text not null default 'primary' check (link_role in ('primary','secondary')),
  linked_by         text not null check (linked_by in ('user','system')),
  weight            numeric(5,4) check (weight is null),
  created_at        timestamptz not null default now(),
  primary key (evidence_item_id, skill_id)
);
comment on column evidence_item_skill.weight is 'Reserved. Always NULL in Phase 1: no evidence weight exists before expert validation.';
create index evidence_item_skill_user_skill_idx on evidence_item_skill(user_id, skill_id);

-- ──────────────────── evaluated fact ← derived from items (bridge) ────────────────────
create table evidence_derivation (
  evidence_id       uuid not null references evidence(id) on delete cascade,
  evidence_item_id  uuid not null references evidence_item(id) on delete restrict,
  user_id           uuid not null references app_user(id) on delete cascade,
  derivation_kind   text not null check (derivation_kind in ('evaluated_from','recorded_as')),
  created_at        timestamptz not null default now(),
  primary key (evidence_id, evidence_item_id)
);
comment on table evidence_derivation is
  'Which ledger items an evaluated fact (evidence) was derived from. evaluated_from = material the evaluation read; recorded_as = the automated_check_result item of that run.';

-- ───────────────────────────────── RLS ─────────────────────────────────
alter table evidence_item_type       enable row level security;
alter table evidence_item_type       force  row level security;
alter table evidence_item       enable row level security;
alter table evidence_item       force  row level security;
alter table evidence_item_skill enable row level security;
alter table evidence_item_skill force  row level security;
alter table evidence_derivation enable row level security;
alter table evidence_derivation force  row level security;

grant select on evidence_item_type to anon, authenticated;
grant select, insert, update, delete on evidence_item_type to service_role;
grant select, insert, update, delete on evidence_item, evidence_item_skill, evidence_derivation to authenticated, service_role;
grant select on evidence_item, evidence_item_skill, evidence_derivation to anon;

-- The registry is readable by everyone (it is content, not personal data).
create policy evidence_type_read_enabled on evidence_item_type
  for select to anon, authenticated using (enabled);

-- The owner reads and adds their own items and links. They never update an
-- item (immutability), never write a derivation (that is an evaluation
-- outcome), and never see another user's items.
create policy evidence_item_select_own on evidence_item
  for select to authenticated using (user_id = auth.uid());
create policy evidence_item_insert_own on evidence_item
  for insert to authenticated with check (user_id = auth.uid() and source <> 'system');
create policy evidence_item_skill_select_own on evidence_item_skill
  for select to authenticated using (user_id = auth.uid());
create policy evidence_item_skill_insert_own on evidence_item_skill
  for insert to authenticated with check (user_id = auth.uid() and linked_by = 'user');
create policy evidence_derivation_select_own on evidence_derivation
  for select to authenticated using (user_id = auth.uid());

-- ───────────────────────────── backfill (additive) ─────────────────────────────
-- Existing submissions and evaluations become ledger items so history reads
-- the same way as new data. Nothing in `evidence`, `skill_claim` or
-- `evidence_transition` is touched.

-- 1. one activity item per submission (attempt_number per project, by creation order)
with numbered as (
  select s.id, s.user_id, s.project_id, s.created_at, p.activity_spec_id, p.title,
         row_number() over (partition by s.project_id order by s.created_at, s.id) as attempt
    from submission s join project p on p.id = s.project_id
)
insert into evidence_item (user_id, item_type_code, target_role_id, activity_spec_id, project_id, submission_id,
                           source, title, status, submitted_at, attempt_number, metadata, created_at)
select n.user_id, 'code_submission',
       (select g.target_role_id from career_goal g where g.user_id = n.user_id and g.is_current limit 1),
       n.activity_spec_id, n.project_id, n.id, 'user_submission', n.title, 'submitted', n.created_at, n.attempt,
       jsonb_build_object('backfilled', true), n.created_at
  from numbered n;

-- supersede chain inside a project
update evidence_item cur set supersedes_item_id = prev.id
  from evidence_item prev
 where cur.item_type_code = 'code_submission' and prev.item_type_code = 'code_submission'
   and cur.project_id = prev.project_id and prev.attempt_number = cur.attempt_number - 1;
update evidence_item prev set status = 'superseded'
 where prev.item_type_code = 'code_submission'
   and exists (select 1 from evidence_item cur where cur.supersedes_item_id = prev.id);

-- 2. claimed skills → links
insert into evidence_item_skill (evidence_item_id, skill_id, user_id, link_role, linked_by)
select i.id, scs.skill_id, i.user_id, 'primary', 'user'
  from evidence_item i join submission_claimed_skill scs on scs.submission_id = i.submission_id
 where i.item_type_code = 'code_submission'
on conflict do nothing;

-- 3. files / links / texts of each submission → child items
insert into evidence_item (user_id, item_type_code, target_role_id, activity_spec_id, project_id, submission_id, parent_item_id,
                           source, title, description, url, upload_id, artifact_key, status, submitted_at, attempt_number, metadata, created_at)
select i.user_id,
       case a.kind when 'file' then 'file_upload' when 'link' then
         case when a.value_text ~* '^https?://([^/]+\.)?github\.com/[^/]+/[^/]+/?$' then 'github_repository'
              when a.value_text ~* '^https?://([^/]+\.)?github\.com/.*/(commit|compare|pull)/' then 'github_commit_diff'
              else 'external_url' end
         else 'text_explanation' end,
       i.target_role_id, i.activity_spec_id, i.project_id, i.submission_id, i.id,
       'user_submission',
       coalesce(a.locator, a.key),
       case when a.kind = 'text' then a.value_text else null end,
       case when a.kind = 'link' then a.value_text else null end,
       a.upload_id, a.key, i.status, i.submitted_at, i.attempt_number,
       jsonb_build_object('backfilled', true), i.created_at
  from evidence_item i join submission_artifact a on a.submission_id = i.submission_id
 where i.item_type_code = 'code_submission' and a.kind in ('file','link','text')
   and (a.kind <> 'text' or length(btrim(coalesce(a.value_text,''))) > 0);

-- 4. AI disclosures
insert into evidence_item (user_id, item_type_code, target_role_id, activity_spec_id, project_id, submission_id, parent_item_id,
                           source, title, status, submitted_at, attempt_number, metadata, created_at)
select i.user_id, 'ai_usage_disclosure', i.target_role_id, i.activity_spec_id, i.project_id, i.submission_id, i.id,
       'system', 'AI usage disclosure', i.status, i.submitted_at, i.attempt_number,
       jsonb_build_object('backfilled', true, 'mode', d.mode, 'declared_use', to_jsonb(d.declared_use)), i.created_at
  from evidence_item i join ai_disclosure d on d.submission_id = i.submission_id
 where i.item_type_code = 'code_submission';

-- 5. evaluation results → automated_check_result items, derivation to evaluated facts
insert into evidence_item (user_id, item_type_code, target_role_id, activity_spec_id, project_id, submission_id, evaluation_result_id, parent_item_id,
                           source, title, status, submitted_at, attempt_number, metadata, created_at)
select r.user_id, 'automated_check_result', i.target_role_id, i.activity_spec_id, i.project_id, r.submission_id, r.id, i.id,
       'system', 'Automated evaluation ' || r.outcome::text, 'submitted', r.evaluated_at, i.attempt_number,
       jsonb_build_object('backfilled', true, 'outcome', r.outcome), r.evaluated_at
  from evaluation_result r join evidence_item i on i.submission_id = r.submission_id and i.item_type_code = 'code_submission';

insert into evidence_derivation (evidence_id, evidence_item_id, user_id, derivation_kind)
select e.id, i.id, e.user_id, 'recorded_as'
  from evidence e join evidence_item i on i.evaluation_result_id = e.evaluation_result_id and i.item_type_code = 'automated_check_result'
 where e.evaluation_result_id is not null
on conflict do nothing;
insert into evidence_derivation (evidence_id, evidence_item_id, user_id, derivation_kind)
select e.id, i.parent_item_id, e.user_id, 'evaluated_from'
  from evidence e join evidence_item i on i.evaluation_result_id = e.evaluation_result_id and i.item_type_code = 'automated_check_result'
 where e.evaluation_result_id is not null and i.parent_item_id is not null
on conflict do nothing;
insert into evidence_item_skill (evidence_item_id, skill_id, user_id, link_role, linked_by)
select i.id, e.skill_id, e.user_id, 'primary', 'system'
  from evidence e join evidence_item i on i.evaluation_result_id = e.evaluation_result_id and i.item_type_code = 'automated_check_result'
 where e.evaluation_result_id is not null
on conflict do nothing;
