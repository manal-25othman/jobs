-- 0016 — AI Usage & Integrity Flow (Configurable Track Architecture, Phase 6).
--
-- Principle: AI use is not cheating. The integrity layer establishes whether
-- the user understands, verifies, modifies and can reason about the work.
-- Disclosure is CONTEXT for assessment — never evidence of competence, never
-- a reason to fail, never a trigger for mandatory human review.
--
-- NO AI-DETECTION THEATRE. Nothing here infers that work was AI-generated from
-- style, formatting, token patterns or probabilistic detection. Signals come
-- only from observable sources (disclosure, submitted material, revisions,
-- challenge responses, deterministic checks, explanations, a named reviewer).
-- The source list is a CHECK constraint: a detection source is unrepresentable.
--
-- Extends, does not replace: ai_disclosure (0001), integrity_check (0003),
-- verification_challenge_type + challenge_policy (0014).
-- Every expert-dependent value is DRAFT / NOT VALIDATED. No challenge type and
-- no trigger rule is active.

-- ───────────────────────────── disclosure questionnaire (governed) ─────────────────────────────
create table disclosure_questionnaire (
  id                 uuid primary key default gen_random_uuid(),
  key                text not null check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  version            int not null check (version >= 1),
  label_ar           text not null,
  label_en           text not null,
  intro_ar           text not null,
  description_en     text not null,
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
  constraint disclosure_questionnaire_baseline_shape check (activation <> 'legacy_baseline' or baseline_of is not null)
);
comment on table disclosure_questionnaire is 'Versioned AI-usage disclosure questionnaire (Phase 6). Questions, order, required/optional and answer types are configuration. Every submission keeps the version it was answered with.';
create unique index disclosure_questionnaire_one_active_per_key on disclosure_questionnaire(key) where activation <> 'inactive';
create trigger disclosure_questionnaire_touch before update on disclosure_questionnaire for each row execute function touch_updated_at();

create table disclosure_question (
  id               uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references disclosure_questionnaire(id) on delete cascade,
  key              text not null check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  position         int not null,
  prompt_ar        text not null,
  prompt_en        text not null,
  help_ar          text,
  answer_type      text not null check (answer_type in ('yes_no','single_choice','multi_choice','free_text','text_list')),
  options          jsonb not null default '[]'::jsonb,
  required         boolean not null default false,
  show_if          jsonb not null default '{}'::jsonb,
  -- Optional mapping onto the legacy disclosure columns, so existing consumers keep reading the same facts.
  maps_to          text check (maps_to is null or maps_to in ('declared_use','explanation','ai_use_declared')),
  created_at       timestamptz not null default now(),
  unique (questionnaire_id, key),
  unique (questionnaire_id, position),
  constraint disclosure_question_options_is_array check (jsonb_typeof(options) = 'array'),
  constraint disclosure_question_show_if_is_object check (jsonb_typeof(show_if) = 'object'),
  constraint disclosure_question_choice_has_options check (answer_type not in ('single_choice','multi_choice') or jsonb_array_length(options) > 0)
);
create or replace function disclosure_question_frozen_guard() returns trigger language plpgsql as $$
declare active_at timestamptz;
begin
  select activated_at into active_at from disclosure_questionnaire where id = coalesce(new.questionnaire_id, old.questionnaire_id);
  if active_at is not null then raise exception 'disclosure_questionnaire has been active; its questions are immutable — create a new version'; end if;
  return coalesce(new, old);
end $$;

-- LEGACY BASELINE ai_usage@1: exactly the two fields the submission form captured before Phase 6.
insert into disclosure_questionnaire (key, version, label_ar, label_en, intro_ar, description_en, activation, baseline_of, activated_at, created_by, validation_note_en) values
  ('ai_usage', 1, 'إقرار استخدام الذكاء الاصطناعي', 'AI usage disclosure',
   'الإفصاح لا يخفض درجتك. المهم ما فعلتِه، وبماذا ساعدك، وهل تستطيعين شرح عملك والدفاع عنه.',
   'LEGACY BASELINE — the two fields captured before Phase 6 (what AI helped with; an optional explanation).',
   'legacy_baseline', 'pre_0016_disclosure_fields', now(), 'migration 0016',
   'LEGACY BASELINE — NOT EXPERT-VALIDATED. The pre-Phase-6 disclosure fields; a validated questionnaire is a separate, audited act.');
insert into disclosure_question (questionnaire_id, key, position, prompt_ar, prompt_en, answer_type, required, maps_to)
select id, 'ai_help', 1, 'بماذا ساعدك الذكاء الاصطناعي؟ (اتركيه فارغًا إن لم تستعيني به)', 'What did AI help you with? (leave empty if you did not use it)', 'text_list', false, 'declared_use' from disclosure_questionnaire where key = 'ai_usage' and version = 1;
insert into disclosure_question (questionnaire_id, key, position, prompt_ar, prompt_en, answer_type, required, maps_to)
select id, 'explanation', 2, 'شرح اختياري لطريقة عملك', 'Optional explanation of how you worked', 'free_text', false, 'explanation' from disclosure_questionnaire where key = 'ai_usage' and version = 1;

create trigger disclosure_question_frozen before insert or update or delete on disclosure_question for each row execute function disclosure_question_frozen_guard();
create trigger disclosure_questionnaire_activation before insert or update on disclosure_questionnaire for each row execute function config_activation_guard();

-- DRAFT ai_usage@2 (inactive): the owner's example questions. Wording, count, order, required flags and
-- answer types are configuration and DRAFT / NOT VALIDATED.
insert into disclosure_questionnaire (key, version, label_ar, label_en, intro_ar, description_en, created_by) values
  ('ai_usage', 2, 'كيف عملتِ على هذا التسليم', 'How you worked on this submission',
   'استخدام أدوات الذكاء الاصطناعي مسموح. تساعدنا هذه الأسئلة على فهم طريقة عملك وما الذي أنجزته وراجعته بنفسك.',
   'DRAFT / NOT VALIDATED — owner example questions: whether AI was used, for what, which parts it suggested, what the user changed, rejected, verified and debugged themselves.',
   'migration 0016');
with q as (select id from disclosure_questionnaire where key = 'ai_usage' and version = 2)
insert into disclosure_question (questionnaire_id, key, position, prompt_ar, prompt_en, help_ar, answer_type, options, required, show_if, maps_to)
select q.id, v.key, v.position, v.prompt_ar, v.prompt_en, v.help_ar, v.answer_type, v.options::jsonb, v.required, v.show_if::jsonb, v.maps_to from q, (values
  ('used_ai', 1, 'هل استخدمتِ أدوات ذكاء اصطناعي في هذا العمل؟', 'Did you use AI tools for this work?', 'الإجابة بنعم لا تخفض درجتك.', 'yes_no', '[]', true, '{}', 'ai_use_declared'),
  ('used_for', 2, 'فيمَ استخدمتِها؟', 'What did you use them for?', null, 'multi_choice',
   '[{"value":"explain_concepts","label_ar":"شرح مفاهيم","label_en":"Explaining concepts"},{"value":"suggest_code","label_ar":"اقتراح أجزاء من الكود","label_en":"Suggesting code"},{"value":"generate_code","label_ar":"توليد كود","label_en":"Generating code"},{"value":"debug","label_ar":"تتبّع خطأ","label_en":"Debugging"},{"value":"write_tests","label_ar":"كتابة اختبارات","label_en":"Writing tests"},{"value":"review","label_ar":"مراجعة عملي","label_en":"Reviewing my work"},{"value":"docs","label_ar":"كتابة توثيق أو ملاحظات","label_en":"Docs or notes"},{"value":"other","label_ar":"غير ذلك","label_en":"Other"}]',
   true, '{"used_ai": true}', 'declared_use'),
  ('ai_parts', 3, 'أي أجزاء اقترحها أو ولّدها الذكاء الاصطناعي؟', 'Which parts were suggested or generated by AI?', null, 'free_text', '[]', false, '{"used_ai": true}', null),
  ('changed_myself', 4, 'ما الذي غيّرتِه أو كتبتِه بنفسك؟', 'What did you change or write yourself?', null, 'free_text', '[]', false, '{"used_ai": true}', null),
  ('rejected_or_corrected', 5, 'ما المخرجات التي رفضتِها أو صحّحتِها؟', 'What output did you reject or correct?', null, 'free_text', '[]', false, '{"used_ai": true}', null),
  ('verified_independently', 6, 'ما الذي تحقّقتِ منه بنفسك؟', 'What did you verify independently?', 'مثل تشغيل الحالات أو قراءة التوثيق.', 'free_text', '[]', false, '{}', null),
  ('understood_or_debugged', 7, 'ما الجزء الذي احتجتِ إلى فهمه أو تتبّع خطئه بنفسك؟', 'Which part did you need to understand or debug yourself?', null, 'free_text', '[]', false, '{}', 'explanation')
) as v(key, position, prompt_ar, prompt_en, help_ar, answer_type, options, required, show_if, maps_to);

-- ───────────────────────────── disclosure records (extended) ─────────────────────────────
-- Historical rows keep null in the new columns = captured before Phase 6. Nothing is reinterpreted.
alter table ai_disclosure
  add column questionnaire_id      uuid references disclosure_questionnaire(id) on delete restrict,
  add column questionnaire_key     text,
  add column questionnaire_version int,
  add column capture_mode          text check (capture_mode is null or capture_mode in ('legacy_fields','questionnaire')),
  add column ai_use_declared       boolean;
comment on column ai_disclosure.capture_mode is 'legacy_fields = the pre-Phase-6 API shape (recorded against the ai_usage@1 baseline); questionnaire = answered against a named questionnaire version. NULL = captured before 0016.';
create or replace function ai_disclosure_immutable() returns trigger language plpgsql as $$
begin raise exception 'ai_disclosure is immutable: a disclosure is recorded once, with its submission'; end $$;
create trigger ai_disclosure_immutable_trg before update on ai_disclosure for each row execute function ai_disclosure_immutable();

create table ai_disclosure_answer (
  id                uuid primary key default gen_random_uuid(),
  disclosure_id     uuid not null references ai_disclosure(id) on delete cascade,
  user_id           uuid not null references app_user(id) on delete cascade,
  question_id       uuid not null references disclosure_question(id) on delete restrict,
  question_key      text not null,
  -- What the user actually saw, frozen with the answer.
  question_snapshot jsonb not null,
  answer            jsonb not null,
  created_at        timestamptz not null default now(),
  unique (disclosure_id, question_key),
  constraint ai_disclosure_answer_snapshot_is_object check (jsonb_typeof(question_snapshot) = 'object')
);
create or replace function ai_disclosure_answer_immutable() returns trigger language plpgsql as $$
begin raise exception 'ai_disclosure_answer is immutable'; end $$;
create trigger ai_disclosure_answer_immutable_trg before update on ai_disclosure_answer for each row execute function ai_disclosure_answer_immutable();

-- ───────────────────────────── challenge registry (extended) ─────────────────────────────
alter table verification_challenge_type
  add column response_format text check (response_format is null or response_format in ('free_text','code_change','choice','walkthrough')),
  -- Who judges a response. An llm is not a judge here (INV-3).
  add column evaluation_mode text check (evaluation_mode is null or evaluation_mode in ('human','deterministic')),
  add column difficulty      text,
  add column timing_hint     text,
  add column skill_mapping   jsonb not null default '[]'::jsonb,
  add constraint verification_challenge_type_skill_mapping_is_array check (jsonb_typeof(skill_mapping) = 'array'),
  -- No challenge type can be switched on before a named expert validates it.
  add constraint verification_challenge_type_enabled_needs_validation check (not enabled or (review_status in ('approved','published') and approved_by is not null and approved_at is not null));
update verification_challenge_type set response_format = 'free_text', evaluation_mode = 'human' where code in ('clarification_question','explanation_question');
update verification_challenge_type set response_format = 'code_change', evaluation_mode = 'human' where code = 'followup_modification';
update verification_challenge_type set response_format = 'free_text', evaluation_mode = 'human' where code = 'code_reading_probe';
update verification_challenge_type set response_format = 'walkthrough', evaluation_mode = 'human' where code = 'live_walkthrough';
insert into verification_challenge_type (code, label_ar, label_en, description_en, delivery, response_format, evaluation_mode) values
  ('fix_new_bug',                'إصلاح خطأ جديد',       'Fix a new bug',              'A small, new defect is introduced near the user''s work; the user fixes it.',            'modification', 'code_change', 'human'),
  ('alternative_implementation', 'تنفيذ بديل',           'Alternative implementation', 'The user implements one part a different way and explains the trade-off.',               'modification', 'code_change', 'human'),
  ('predict_output',             'توقّع السلوك أو الناتج', 'Predict behaviour/output',   'The user predicts what a part of their work does for a given input, before running it.', 'probe',        'free_text',   'human'),
  ('identify_error',             'تحديد خطأ',            'Identify an error',          'The user finds the error in a short variation of their own code.',                        'probe',        'free_text',   'human');
comment on table verification_challenge_type is 'Challenge type registry (Phase 4, extended Phase 6). All disabled and DRAFT / NOT VALIDATED; enabling requires validation. Owner concepts: explain a decision = clarification_question/explanation_question · modify a small part = followup_modification · code reading = code_reading_probe.';

alter table challenge_policy
  add column timing     text check (timing is null or timing in ('before_evaluation','after_evaluation','on_escalation')),
  add column difficulty text,
  add column skill_ids  uuid[] not null default '{}';

-- ───────────────────────────── challenge attempts / results ─────────────────────────────
create table challenge_instance (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references app_user(id) on delete cascade,
  submission_id        uuid not null references submission(id) on delete restrict,
  evaluation_result_id uuid references evaluation_result(id) on delete restrict,
  challenge_type_code  text not null references verification_challenge_type(code) on delete restrict,
  challenge_policy_id  uuid references challenge_policy(id) on delete restrict,
  policy_key           text,
  policy_version       int,
  issued_by_kind       text not null check (issued_by_kind in ('policy','human_reviewer')),
  issued_by_ref        text not null,
  skill_id             uuid references skill(id) on delete restrict,
  prompt_ar            text not null check (length(btrim(prompt_ar)) > 0),
  prompt_en            text,
  -- Blind context for the challenge (no identity, no profile).
  context              jsonb not null default '{}'::jsonb,
  status               text not null default 'issued' check (status in ('issued','answered','reviewed','expired','withdrawn')),
  issued_at            timestamptz not null default now(),
  due_at               timestamptz,
  updated_at           timestamptz not null default now(),
  constraint challenge_instance_policy_shape check (issued_by_kind <> 'policy' or challenge_policy_id is not null),
  constraint challenge_instance_context_is_object check (jsonb_typeof(context) = 'object')
);
create index challenge_instance_user_idx on challenge_instance(user_id, issued_at desc);
create trigger challenge_instance_touch before update on challenge_instance for each row execute function touch_updated_at();
-- The database refuses to issue a challenge whose type is not enabled (validated), or under a policy that is not active.
create or replace function challenge_instance_issue_guard() returns trigger language plpgsql as $$
declare t record; p record;
begin
  if tg_op = 'INSERT' then
    select enabled into t from verification_challenge_type where code = new.challenge_type_code;
    if not coalesce(t.enabled, false) then raise exception 'challenge type % is not enabled (DRAFT / NOT VALIDATED); no challenge can be issued', new.challenge_type_code; end if;
    if new.challenge_policy_id is not null then
      select activation, key, version into p from challenge_policy where id = new.challenge_policy_id;
      if p.activation = 'inactive' then raise exception 'challenge policy %@% is inactive; no challenge can be issued under it', p.key, p.version; end if;
    end if;
  else
    if old.status in ('reviewed','expired','withdrawn') and new.status is distinct from old.status then raise exception 'challenge status % is terminal', old.status; end if;
    if new.prompt_ar is distinct from old.prompt_ar or new.challenge_type_code is distinct from old.challenge_type_code or new.context is distinct from old.context then
      raise exception 'a challenge is immutable once issued';
    end if;
  end if;
  return new;
end $$;
create trigger challenge_instance_issue before insert or update on challenge_instance for each row execute function challenge_instance_issue_guard();

create table challenge_response (
  id           uuid primary key default gen_random_uuid(),
  instance_id  uuid not null unique references challenge_instance(id) on delete restrict,
  user_id      uuid not null references app_user(id) on delete cascade,
  response     jsonb not null,
  submitted_at timestamptz not null default now(),
  constraint challenge_response_is_object check (jsonb_typeof(response) = 'object')
);
create table challenge_result (
  id              uuid primary key default gen_random_uuid(),
  instance_id     uuid not null unique references challenge_instance(id) on delete restrict,
  user_id         uuid not null references app_user(id) on delete cascade,
  evaluator_kind  text not null check (evaluator_kind in ('human','deterministic')),
  evaluator_ref   text not null,
  -- An observation about understanding — never a verdict on honesty, never a verification effect.
  outcome         text not null check (outcome in ('understanding_shown','understanding_not_shown','inconclusive')),
  observations    text not null check (length(btrim(observations)) > 0),
  confidence      numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  policy_key      text,
  policy_version  int,
  created_at      timestamptz not null default now()
);
create or replace function challenge_record_immutable() returns trigger language plpgsql as $$
begin raise exception '% is immutable', tg_table_name; end $$;
create trigger challenge_response_immutable_trg before update or delete on challenge_response for each row execute function challenge_record_immutable();
create trigger challenge_result_immutable_trg before update or delete on challenge_result for each row execute function challenge_record_immutable();

-- ───────────────────────────── integrity signals ─────────────────────────────
create table integrity_signal_type (
  code               text primary key check (code ~ '^[a-z][a-z0-9_]{2,63}$'),
  label_ar           text not null,
  label_en           text not null,
  description_en     text not null,
  allowed_sources    text[] not null,
  direction          text not null check (direction in ('neutral_context','consistent_with_understanding','inconsistent_with_understanding')),
  review_status      review_state not null default 'draft',
  validation_note_en text not null default 'DRAFT / NOT VALIDATED — pending expert validation',
  created_at         timestamptz not null default now(),
  -- Observable sources only. A detection source cannot even be registered.
  constraint integrity_signal_type_observable_sources check (cardinality(allowed_sources) >= 1 and allowed_sources <@ array['disclosure','submitted_material','revision_diff','challenge_response','deterministic_check','explanation','human_reviewer']::text[])
);
insert into integrity_signal_type (code, label_ar, label_en, description_en, allowed_sources, direction) values
  ('disclosure_recorded',               'سُجِّل إفصاح',                       'Disclosure recorded',                'The user answered the disclosure questionnaire. Context only; declaring AI use is not a negative signal.', '{disclosure}', 'neutral_context'),
  ('resubmission_recorded',             'سُجِّلت محاولة جديدة',                'Resubmission recorded',              'A new attempt was submitted on the same project; the earlier attempt is kept.',                           '{revision_diff}', 'neutral_context'),
  ('deterministic_check_unmet',         'فحص حتمي غير مستوفى',                'Deterministic check unmet',          'A deterministic integrity check over the submitted artifacts did not pass.',                              '{deterministic_check}', 'neutral_context'),
  ('challenge_understanding_shown',     'أظهرت خطوة التحقق فهمًا للعمل',      'Challenge: understanding shown',     'A challenge response showed understanding of the submitted work.',                                        '{challenge_response}', 'consistent_with_understanding'),
  ('challenge_understanding_not_shown', 'لم تُظهر خطوة التحقق فهمًا كافيًا',   'Challenge: understanding not shown', 'A challenge response did not show understanding of the submitted work. An observation, not a verdict.',   '{challenge_response}', 'inconsistent_with_understanding'),
  ('challenge_inconclusive',            'خطوة التحقق غير حاسمة',              'Challenge: inconclusive',            'A challenge response did not allow a judgement either way.',                                             '{challenge_response}', 'neutral_context'),
  ('explanation_inconsistent_with_work','الشرح لا يتّسق مع العمل المُقدَّم',  'Explanation inconsistent with work', 'A named reviewer observed that the user''s explanation does not match the submitted work. No automatic producer.', '{human_reviewer,explanation}', 'inconsistent_with_understanding');

create table integrity_signal (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references app_user(id) on delete cascade,
  submission_id             uuid not null references submission(id) on delete restrict,
  evaluation_result_id      uuid references evaluation_result(id) on delete restrict,
  signal_type               text not null references integrity_signal_type(code) on delete restrict,
  source                    text not null check (source in ('disclosure','submitted_material','revision_diff','challenge_response','deterministic_check','explanation','human_reviewer')),
  direction                 text not null check (direction in ('neutral_context','consistent_with_understanding','inconsistent_with_understanding')),
  related_evidence_item_ids uuid[] not null default '{}',
  challenge_instance_id     uuid references challenge_instance(id) on delete restrict,
  integrity_check_key       text,
  disclosure_id             uuid references ai_disclosure(id) on delete restrict,
  observation               text not null check (length(btrim(observation)) > 0),
  confidence                numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  visibility                text not null check (visibility in ('user_facing','assessment_only')),
  producer                  text not null,
  producer_version          text not null,
  policy_key                text,
  policy_version            int,
  -- A signal is a fact, not a conclusion. No approved policy maps any signal to an outcome yet.
  outcome_effect            text not null default 'none' check (outcome_effect = 'none'),
  created_at                timestamptz not null default now()
);
comment on table integrity_signal is 'Structured integrity signals (Phase 6): observable facts an assessment MAY consume later. No fraud flag, no cheating score, no verification effect (outcome_effect is constrained to none).';
create index integrity_signal_submission_idx on integrity_signal(submission_id, created_at);
create or replace function integrity_signal_guard() returns trigger language plpgsql as $$
declare t record;
begin
  if tg_op <> 'INSERT' then raise exception 'integrity_signal is append-only'; end if;
  select allowed_sources, direction into t from integrity_signal_type where code = new.signal_type;
  if not (new.source = any(t.allowed_sources)) then raise exception 'signal type % does not accept source %', new.signal_type, new.source; end if;
  if new.direction <> t.direction then raise exception 'signal direction must match its type (%)', t.direction; end if;
  return new;
end $$;
create trigger integrity_signal_guard_trg before insert or update or delete on integrity_signal for each row execute function integrity_signal_guard();

-- ───────────────────────────────── RLS ─────────────────────────────────
alter table disclosure_questionnaire    enable row level security; alter table disclosure_questionnaire    force row level security;
alter table disclosure_question         enable row level security; alter table disclosure_question         force row level security;
alter table ai_disclosure_answer        enable row level security; alter table ai_disclosure_answer        force row level security;
alter table challenge_instance          enable row level security; alter table challenge_instance          force row level security;
alter table challenge_response          enable row level security; alter table challenge_response          force row level security;
alter table challenge_result            enable row level security; alter table challenge_result            force row level security;
alter table integrity_signal_type       enable row level security; alter table integrity_signal_type       force row level security;
alter table integrity_signal            enable row level security; alter table integrity_signal            force row level security;
grant select on disclosure_questionnaire, disclosure_question, integrity_signal_type to anon, authenticated;
grant select, insert, update, delete on disclosure_questionnaire, disclosure_question, integrity_signal_type to service_role;
grant select, insert, update, delete on ai_disclosure_answer, challenge_instance, challenge_response, challenge_result, integrity_signal to authenticated, service_role;
create policy disclosure_questionnaire_read on disclosure_questionnaire for select to anon, authenticated using (true);
create policy disclosure_question_read on disclosure_question for select to anon, authenticated using (true);
create policy integrity_signal_type_read on integrity_signal_type for select to anon, authenticated using (true);
-- The owner reads their own answers, challenges, responses and results; only the service writes them.
create policy ai_disclosure_answer_select_own on ai_disclosure_answer for select to authenticated using (user_id = auth.uid());
create policy challenge_instance_select_own on challenge_instance for select to authenticated using (user_id = auth.uid());
create policy challenge_response_select_own on challenge_response for select to authenticated using (user_id = auth.uid());
create policy challenge_result_select_own on challenge_result for select to authenticated using (user_id = auth.uid());
-- The owner sees user-facing signals only; assessment-only signals stay with the assessment (showing them teaches how to pass).
create policy integrity_signal_select_own_user_facing on integrity_signal for select to authenticated using (user_id = auth.uid() and visibility = 'user_facing');
