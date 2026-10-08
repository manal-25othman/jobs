-- 0018 — Claim-to-Fact Grounding (G1+G2) and current standing of approved assets (Phase 7b, D-115 · CHG-016).
--
-- 1. GROUNDING VOCABULARY AS DATA. grounding_lexicon is a governed table
--    (Phase 4 activation model): the coverage allow-list and extra detector
--    phrases, bilingual, owned by an SME. default@1 is DRAFT / NOT VALIDATED and
--    INACTIVE — it is new behaviour, not a legacy baseline. With no active
--    lexicon, grounding fails closed (needs_revision, never grounded). The code
--    guards stay a floor the data cannot remove; data can only add detectors.
-- 2. CLAIM DRAFTS carry the full grounding result (assertions, issues,
--    unmapped clauses, suggested trim, original wording) and its version.
-- 3. APPROVAL ≠ CURRENT STANDING (BR-026 · DR-019). An approved asset's
--    approval facts are immutable (trigger). Whether it may be presented NOW is
--    standing: lifecycle_state/evidence_backed (D-077) + standing_policy_id, the
--    claim policy it was last verified against. Every standing change is an
--    append-only asset_standing_event. Nothing here rewrites history.

-- ───────────────────────────── grounding lexicon (governed) ─────────────────────────────
create table grounding_lexicon (
  id                 uuid primary key default gen_random_uuid(),
  key                text not null check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  version            int not null check (version >= 1),
  description_en     text not null,
  owner_role         text not null default 'sme',
  review_status      review_state not null default 'draft',
  approved_by        text,
  approved_at        timestamptz,
  validation_note_en text not null default 'DRAFT / NOT VALIDATED — pending expert validation',
  activation         text not null default 'inactive',
  baseline_of        text,
  activated_at       timestamptz,
  deactivated_at     timestamptz,
  created_by         text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (key, version),
  constraint grounding_lexicon_baseline_shape check (activation <> 'legacy_baseline' or baseline_of is not null)
);
comment on table grounding_lexicon is 'Phase 7b: versioned bilingual grounding vocabulary (coverage allow-list + extra detector phrases). Governed; DRAFT until an SME approves it. No active row ⇒ grounding fails closed.';
create unique index grounding_lexicon_one_active_per_key on grounding_lexicon(key) where activation <> 'inactive';
create trigger grounding_lexicon_touch before update on grounding_lexicon for each row execute function touch_updated_at();
create trigger grounding_lexicon_activation before insert or update on grounding_lexicon for each row execute function config_activation_guard();

create table grounding_lexicon_entry (
  id          uuid primary key default gen_random_uuid(),
  lexicon_id  uuid not null references grounding_lexicon(id) on delete cascade,
  language    text not null check (language in ('ar','en')),
  cls         text not null check (cls in ('framing','action','skill_verb','evaluation_term','technology_term','context_term',
                                           'detect_outcome','detect_professional','detect_credential','detect_quality')),
  form        text not null check (length(btrim(form)) > 0),
  note_en     text,
  unique (lexicon_id, language, cls, form)
);
create or replace function grounding_lexicon_entry_frozen_guard() returns trigger language plpgsql as $$
declare active_at timestamptz;
begin
  select activated_at into active_at from grounding_lexicon where id = coalesce(new.lexicon_id, old.lexicon_id);
  if active_at is not null then raise exception 'grounding_lexicon has been active; its entries are immutable — create a new version'; end if;
  return coalesce(new, old);
end $$;
create trigger grounding_lexicon_entry_frozen before insert or update or delete on grounding_lexicon_entry for each row execute function grounding_lexicon_entry_frozen_guard();

insert into grounding_lexicon (key, version, description_en, created_by) values
  ('default', 1, 'DRAFT seed vocabulary for Claim-to-Fact Grounding (Phase 7b): framing, action, skill, evaluation, technology and track terms; extra outcome / professional / credential / quality detector phrases. Mirrors SEED_GROUNDING_LEXICON.', 'migration 0018');
insert into grounding_lexicon_entry (lexicon_id, language, cls, form)
select l.id, v.language, v.cls, v.form from grounding_lexicon l, (values
  ('en', 'framing', 'a'),
  ('en', 'framing', 'an'),
  ('en', 'framing', 'the'),
  ('en', 'framing', 'and'),
  ('en', 'framing', 'or'),
  ('en', 'framing', 'of'),
  ('en', 'framing', 'in'),
  ('en', 'framing', 'on'),
  ('en', 'framing', 'at'),
  ('en', 'framing', 'to'),
  ('en', 'framing', 'for'),
  ('en', 'framing', 'with'),
  ('en', 'framing', 'across'),
  ('en', 'framing', 'using'),
  ('en', 'framing', 'by'),
  ('en', 'framing', 'as'),
  ('en', 'framing', 'from'),
  ('en', 'framing', 'its'),
  ('en', 'framing', 'their'),
  ('en', 'framing', 'my'),
  ('en', 'framing', 'i'),
  ('en', 'framing', 'this'),
  ('en', 'framing', 'these'),
  ('en', 'framing', 'is'),
  ('en', 'framing', 'was'),
  ('en', 'framing', 'were'),
  ('en', 'framing', 'are'),
  ('en', 'framing', 'it'),
  ('en', 'framing', 'each'),
  ('en', 'framing', 'every'),
  ('en', 'framing', 'all'),
  ('en', 'framing', 'both'),
  ('en', 'framing', 'part'),
  ('en', 'framing', 'within'),
  ('en', 'framing', 'through'),
  ('en', 'framing', 'via'),
  ('en', 'framing', 'into'),
  ('en', 'framing', 'per'),
  ('en', 'framing', 's'),
  ('en', 'framing', 'also'),
  ('en', 'framing', 'against'),
  ('en', 'framing', 'one'),
  ('en', 'framing', 'here'),
  ('en', 'framing', 'project'),
  ('en', 'framing', 'projects'),
  ('en', 'framing', 'work'),
  ('en', 'framing', 'case'),
  ('en', 'framing', 'study'),
  ('en', 'framing', 'skill'),
  ('en', 'framing', 'skills'),
  ('en', 'framing', 'evidence'),
  ('en', 'framing', 'links'),
  ('en', 'framing', 'linked'),
  ('ar', 'framing', 'في'),
  ('ar', 'framing', 'من'),
  ('ar', 'framing', 'على'),
  ('ar', 'framing', 'الى'),
  ('ar', 'framing', 'عن'),
  ('ar', 'framing', 'مع'),
  ('ar', 'framing', 'و'),
  ('ar', 'framing', 'او'),
  ('ar', 'framing', 'ثم'),
  ('ar', 'framing', 'عبر'),
  ('ar', 'framing', 'ضمن'),
  ('ar', 'framing', 'خلال'),
  ('ar', 'framing', 'ل'),
  ('ar', 'framing', 'ب'),
  ('ar', 'framing', 'ك'),
  ('ar', 'framing', 'كل'),
  ('ar', 'framing', 'هذا'),
  ('ar', 'framing', 'هذه'),
  ('ar', 'framing', 'ذلك'),
  ('ar', 'framing', 'التي'),
  ('ar', 'framing', 'الذي'),
  ('ar', 'framing', 'ان'),
  ('ar', 'framing', 'قد'),
  ('ar', 'framing', 'تم'),
  ('ar', 'framing', 'بين'),
  ('ar', 'framing', 'حول'),
  ('ar', 'framing', 'كما'),
  ('ar', 'framing', 'مثل'),
  ('ar', 'framing', 'داخل'),
  ('ar', 'framing', 'هو'),
  ('ar', 'framing', 'هي'),
  ('ar', 'framing', 'انا'),
  ('ar', 'framing', 'ايضا'),
  ('ar', 'framing', 'عند'),
  ('ar', 'framing', 'وفق'),
  ('ar', 'framing', 'مشروع'),
  ('ar', 'framing', 'مشاريع'),
  ('ar', 'framing', 'دراسه'),
  ('ar', 'framing', 'حاله'),
  ('ar', 'framing', 'مهارات'),
  ('ar', 'framing', 'مهاره'),
  ('ar', 'framing', 'عمل'),
  ('ar', 'framing', 'اعمال'),
  ('ar', 'framing', 'دليل'),
  ('ar', 'framing', 'مرتبطه'),
  ('ar', 'framing', 'يمكن'),
  ('ar', 'framing', 'الرجوع'),
  ('ar', 'framing', 'اليه'),
  ('ar', 'framing', 'هنا'),
  ('en', 'action', 'built'),
  ('en', 'action', 'build'),
  ('en', 'action', 'building'),
  ('en', 'action', 'wrote'),
  ('en', 'action', 'write'),
  ('en', 'action', 'writing'),
  ('en', 'action', 'written'),
  ('en', 'action', 'implemented'),
  ('en', 'action', 'implementing'),
  ('en', 'action', 'developed'),
  ('en', 'action', 'developing'),
  ('en', 'action', 'created'),
  ('en', 'action', 'creating'),
  ('en', 'action', 'designed'),
  ('en', 'action', 'designing'),
  ('en', 'action', 'tested'),
  ('en', 'action', 'testing'),
  ('en', 'action', 'test'),
  ('en', 'action', 'tests'),
  ('en', 'action', 'covered'),
  ('en', 'action', 'covering'),
  ('en', 'action', 'worked'),
  ('en', 'action', 'working'),
  ('en', 'action', 'fixed'),
  ('en', 'action', 'fixing'),
  ('en', 'action', 'refactored'),
  ('en', 'action', 'refactoring'),
  ('en', 'action', 'added'),
  ('en', 'action', 'adding'),
  ('en', 'action', 'completed'),
  ('en', 'action', 'submitted'),
  ('en', 'action', 'handled'),
  ('en', 'action', 'handling'),
  ('en', 'action', 'structured'),
  ('en', 'action', 'styled'),
  ('en', 'action', 'documented'),
  ('en', 'action', 'debugged'),
  ('en', 'action', 'reviewed'),
  ('en', 'action', 'organised'),
  ('en', 'action', 'organized'),
  ('en', 'action', 'maintained'),
  ('ar', 'action', 'بنيت'),
  ('ar', 'action', 'بناء'),
  ('ar', 'action', 'بني'),
  ('ar', 'action', 'كتبت'),
  ('ar', 'action', 'كتابه'),
  ('ar', 'action', 'نفذت'),
  ('ar', 'action', 'تنفيذ'),
  ('ar', 'action', 'طورت'),
  ('ar', 'action', 'تطوير'),
  ('ar', 'action', 'انشات'),
  ('ar', 'action', 'انشاء'),
  ('ar', 'action', 'صممت'),
  ('ar', 'action', 'تصميم'),
  ('ar', 'action', 'اختبرت'),
  ('ar', 'action', 'اختبار'),
  ('ar', 'action', 'اختبارات'),
  ('ar', 'action', 'غطيت'),
  ('ar', 'action', 'تغطيه'),
  ('ar', 'action', 'عملت'),
  ('ar', 'action', 'اصلحت'),
  ('ar', 'action', 'اصلاح'),
  ('ar', 'action', 'اضفت'),
  ('ar', 'action', 'اضافه'),
  ('ar', 'action', 'اكملت'),
  ('ar', 'action', 'اكمال'),
  ('ar', 'action', 'قدمت'),
  ('ar', 'action', 'تقديم'),
  ('ar', 'action', 'عالجت'),
  ('ar', 'action', 'معالجه'),
  ('ar', 'action', 'وثقت'),
  ('ar', 'action', 'توثيق'),
  ('ar', 'action', 'توليت'),
  ('en', 'skill_verb', 'demonstrated'),
  ('en', 'skill_verb', 'demonstrating'),
  ('en', 'skill_verb', 'demonstrates'),
  ('en', 'skill_verb', 'demonstrate'),
  ('ar', 'skill_verb', 'اثبت'),
  ('ar', 'skill_verb', 'اثبتت'),
  ('ar', 'skill_verb', 'اثبات'),
  ('ar', 'skill_verb', 'مثبته'),
  ('ar', 'skill_verb', 'المثبته'),
  ('en', 'evaluation_term', 'evaluated'),
  ('en', 'evaluation_term', 'evaluation'),
  ('en', 'evaluation_term', 'criteria'),
  ('en', 'evaluation_term', 'criterion'),
  ('en', 'evaluation_term', 'rubric'),
  ('en', 'evaluation_term', 'published'),
  ('en', 'evaluation_term', 'scoring'),
  ('en', 'evaluation_term', 'scored'),
  ('en', 'evaluation_term', 'score'),
  ('en', 'evaluation_term', 'met'),
  ('en', 'evaluation_term', 'assessed'),
  ('ar', 'evaluation_term', 'قيم'),
  ('ar', 'evaluation_term', 'مقيم'),
  ('ar', 'evaluation_term', 'مقيمه'),
  ('ar', 'evaluation_term', 'تقييم'),
  ('ar', 'evaluation_term', 'معيار'),
  ('ar', 'evaluation_term', 'معايير'),
  ('ar', 'evaluation_term', 'منشور'),
  ('ar', 'evaluation_term', 'نتيجه'),
  ('ar', 'evaluation_term', 'مستوفاه'),
  ('ar', 'evaluation_term', 'مستوفي'),
  ('ar', 'evaluation_term', 'استوفيت'),
  ('en', 'technology_term', 'declared technologies'),
  ('en', 'technology_term', 'declared technology'),
  ('en', 'technology_term', 'technologies'),
  ('en', 'technology_term', 'technology'),
  ('ar', 'technology_term', 'التقنيات المعلنه'),
  ('ar', 'technology_term', 'تقنيات'),
  ('ar', 'technology_term', 'تقنيه'),
  ('ar', 'technology_term', 'المعلنه'),
  ('en', 'context_term', 'track'),
  ('en', 'context_term', 'learning'),
  ('ar', 'context_term', 'مسار'),
  ('ar', 'context_term', 'اتعلم'),
  ('ar', 'context_term', 'تعلم'),
  ('en', 'detect_outcome', 'user satisfaction'),
  ('en', 'detect_outcome', 'customer satisfaction'),
  ('en', 'detect_outcome', 'conversion rate'),
  ('en', 'detect_outcome', 'retention'),
  ('en', 'detect_outcome', 'engagement'),
  ('en', 'detect_outcome', 'time savings'),
  ('en', 'detect_outcome', 'saved time'),
  ('en', 'detect_outcome', 'cost savings'),
  ('en', 'detect_outcome', 'business value'),
  ('en', 'detect_outcome', 'positive feedback'),
  ('en', 'detect_outcome', 'well received'),
  ('en', 'detect_outcome', 'seamless'),
  ('en', 'detect_outcome', 'smoothly'),
  ('ar', 'detect_outcome', 'رضا المستخدمين'),
  ('ar', 'detect_outcome', 'رضا العملاء'),
  ('ar', 'detect_outcome', 'تجربه افضل'),
  ('ar', 'detect_outcome', 'توفير الوقت'),
  ('ar', 'detect_outcome', 'توفير التكلفه'),
  ('ar', 'detect_outcome', 'قيمه تجاريه'),
  ('ar', 'detect_outcome', 'ردود فعل ايجابيه'),
  ('ar', 'detect_outcome', 'بسلاسه'),
  ('en', 'detect_professional', 'stakeholders'),
  ('en', 'detect_professional', 'client'),
  ('en', 'detect_professional', 'clients'),
  ('en', 'detect_professional', 'end users'),
  ('en', 'detect_professional', 'real world users'),
  ('en', 'detect_professional', 'at work'),
  ('en', 'detect_professional', 'my employer'),
  ('en', 'detect_professional', 'company project'),
  ('en', 'detect_professional', 'team lead'),
  ('ar', 'detect_professional', 'اصحاب المصلحه'),
  ('ar', 'detect_professional', 'عميل'),
  ('ar', 'detect_professional', 'العملاء'),
  ('ar', 'detect_professional', 'المستخدمين النهائيين'),
  ('ar', 'detect_professional', 'شركتي'),
  ('ar', 'detect_professional', 'جهه عملي'),
  ('en', 'detect_credential', 'certified'),
  ('en', 'detect_credential', 'certificate'),
  ('en', 'detect_credential', 'licensed'),
  ('en', 'detect_credential', 'accredited'),
  ('ar', 'detect_credential', 'شهاده'),
  ('ar', 'detect_credential', 'مرخص'),
  ('en', 'detect_quality', 'robust'),
  ('en', 'detect_quality', 'scalable'),
  ('en', 'detect_quality', 'production ready'),
  ('en', 'detect_quality', 'enterprise grade'),
  ('en', 'detect_quality', 'best practices'),
  ('en', 'detect_quality', 'expert'),
  ('en', 'detect_quality', 'advanced'),
  ('en', 'detect_quality', 'high performance'),
  ('en', 'detect_quality', 'optimized'),
  ('en', 'detect_quality', 'optimised'),
  ('en', 'detect_quality', 'cutting edge'),
  ('ar', 'detect_quality', 'احترافي'),
  ('ar', 'detect_quality', 'احترافيه'),
  ('ar', 'detect_quality', 'قابل للتوسع'),
  ('ar', 'detect_quality', 'متقدم'),
  ('ar', 'detect_quality', 'خبير'),
  ('ar', 'detect_quality', 'افضل الممارسات'),
  ('ar', 'detect_quality', 'عالي الاداء')
) as v(language, cls, form) where l.key = 'default' and l.version = 1;

-- ───────────────────────────── claim drafts ─────────────────────────────
alter table agent_proposal drop constraint agent_proposal_grounding_status_check;
alter table agent_proposal add constraint agent_proposal_grounding_status_check check (grounding_status is null or grounding_status in
  ('grounded','needs_revision','refused','evidence_withdrawn','not_eligible'));
alter table agent_proposal
  add column grounding_result  jsonb,
  add column grounding_version text,
  add constraint proposal_grounding_result_shape check (grounding_result is null or (jsonb_typeof(grounding_result) = 'object' and grounding_version is not null));
comment on column agent_proposal.grounding_result is 'Phase 7b: JSONB justified — the Claim-to-Fact grounding result as computed (decision, assertions → fact ids, issues with Arabic/English explanations, unmapped clauses, suggested trim, ORIGINAL wording). Null on drafts made before 0018.';

alter table claim_draft_event drop constraint claim_draft_event_event_check;
alter table claim_draft_event add constraint claim_draft_event_event_check check (event in
  ('drafted','previewed','approved','rejected','flagged_evidence_withdrawn','refused_not_eligible','grounding_refused','edit_refused'));
alter table claim_draft_event add column grounding_result jsonb;

-- ───────────────────────────── approved assets: approval vs standing ─────────────────────────────
alter table professional_asset
  add column standing_policy_id  uuid references claim_policy(id) on delete restrict,
  add column standing_checked_at timestamptz;
comment on column professional_asset.standing_policy_id is 'Phase 7b: the claim policy this asset was last verified eligible under. Presentation requires it to equal the policy in effect now (fail closed). Null = never re-checked: presentable only while the legacy baseline is in effect and the asset was approved under it (or before the policy layer).';

-- The approval is history (DR-019): once a user approved an asset, what they approved never changes.
create or replace function professional_asset_approval_immutable() returns trigger language plpgsql as $$
begin
  if old.user_approved_at is not null and (
       new.body is distinct from old.body or new.body_en is distinct from old.body_en or new.user_approved_at is distinct from old.user_approved_at
    or new.kind is distinct from old.kind or new.claim_policy_id is distinct from old.claim_policy_id or new.claim_policy_ref is distinct from old.claim_policy_ref
    or new.provenance_class is distinct from old.provenance_class or new.provenance_source is distinct from old.provenance_source or new.user_id is distinct from old.user_id) then
    raise exception 'professional_asset % was approved by its owner; the approval is history and cannot be rewritten (DR-019)', old.id;
  end if;
  return new;
end $$;
create trigger professional_asset_approval_immutable_trg before update on professional_asset for each row execute function professional_asset_approval_immutable();

create table asset_standing_event (
  id                uuid primary key default gen_random_uuid(),
  asset_id          uuid not null references professional_asset(id) on delete cascade,
  user_id           uuid not null references app_user(id) on delete cascade,
  cause             text not null check (cause in ('policy_activation','revalidation_run','evidence_withdrawn','relinked')),
  claim_policy_id   uuid references claim_policy(id) on delete restrict,
  claim_policy_ref  text,
  previous_state    text not null,
  new_state         text not null,
  eligible          boolean not null,
  reason            text not null check (length(btrim(reason)) > 0),
  actor             text not null check (length(btrim(actor)) > 0),
  created_at        timestamptz not null default now()
);
create index asset_standing_event_asset_idx on asset_standing_event(asset_id, created_at);
comment on table asset_standing_event is 'Phase 7b (DR-019): every change in whether an approved asset may be presented as evidence-backed — cause, the policy version, eligibility, the reason. Append-only; the approval itself never changes.';
create or replace function asset_standing_event_append_only() returns trigger language plpgsql as $$
begin raise exception 'asset_standing_event is append-only'; end $$;
create trigger asset_standing_event_append_only_trg before update or delete on asset_standing_event for each row execute function asset_standing_event_append_only();

-- ───────────────────────────────── RLS ─────────────────────────────────
alter table grounding_lexicon       enable row level security; alter table grounding_lexicon       force row level security;
alter table grounding_lexicon_entry enable row level security; alter table grounding_lexicon_entry force row level security;
alter table asset_standing_event    enable row level security; alter table asset_standing_event    force row level security;
grant select on grounding_lexicon, grounding_lexicon_entry to anon, authenticated;
grant select, insert, update, delete on grounding_lexicon, grounding_lexicon_entry, asset_standing_event to service_role;
grant select on asset_standing_event to authenticated;
create policy grounding_lexicon_read on grounding_lexicon for select to anon, authenticated using (true);
create policy grounding_lexicon_entry_read on grounding_lexicon_entry for select to anon, authenticated using (true);
create policy asset_standing_event_select_own on asset_standing_event for select to authenticated using (user_id = auth.uid());
