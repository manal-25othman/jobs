-- ═══════════════════════════════════════════════════════════════════════════
-- DM-7b / P-3 proofs (migration 0034): the professional classification is governed, provenance-explicit,
-- development-only and never touches legacy is_core; pack-constraint schema 2 never disturbs schema 1.
-- Own fixtures (8f…). Run by scripts/db-test.sh.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

create or replace function pc_must_fail(setup text, stmt text, label text, expect_error text) returns void language plpgsql as $$
  begin
    begin
      if setup is not null then execute setup; end if;
      execute stmt;
    exception when others then
      if SQLERRM !~ expect_error then raise exception 'FAIL  %  — refused for the WRONG reason: %', label, SQLERRM; end if;
      raise notice 'PASS  %  (refused: %)', label, replace(SQLERRM, E'\n', ' ');
      return;
    end;
    raise exception 'FAIL  %  — ACCEPTED', label;
  end $$;
create or replace function pc_ok(setup text, stmt text, label text) returns void language plpgsql as $$
  begin
    begin
      if setup is not null then execute setup; end if;
      execute stmt;
      raise notice 'PASS  %  (accepted)', label;
      raise exception 'pc_rollback';
    exception when others then
      if SQLERRM = 'pc_rollback' then return; end if;
      raise exception 'FAIL  %  — refused: %', label, SQLERRM;
    end;
  end $$;
alter function pc_must_fail(text, text, text, text) security invoker;
alter function pc_ok(text, text, text) security invoker;

do $$ begin
  if exists (select 1 from skill_classification_set) then raise exception 'FAIL  0034 created a classification'; end if;
  if exists (select 1 from pack_constraint_set where schema_version <> 1) then raise exception 'FAIL  0034 changed an existing constraint set'; end if;
  raise notice 'PASS  0034: no classification created; every existing pack constraint set is schema 1 (legacy behaviour unchanged)';
end $$;

-- fixtures: a role with three skills
insert into target_role (id, slug, label_ar, label_en, track_id, source_label, provenance_class, provenance_source) values
  ('8f000000-0000-4000-8000-000000000001', 'pc-role', 'دور', 'role', 'pc_track', 'proof', 'curated', 'p3 proof');
insert into skill (id, slug, label_ar, label_en, provenance_class, provenance_source) values
  ('8f000000-0000-4000-8000-000000000011', 'pc-must', 'm', 'm', 'curated', 'p3 proof'),
  ('8f000000-0000-4000-8000-000000000012', 'pc-core', 'c', 'c', 'curated', 'p3 proof'),
  ('8f000000-0000-4000-8000-000000000013', 'pc-supp', 's', 's', 'curated', 'p3 proof'),
  ('8f000000-0000-4000-8000-000000000014', 'pc-other', 'o', 'o', 'curated', 'p3 proof');
insert into role_requirement (target_role_id, skill_id, is_core, importance, target_proficiency, why_required_ar, why_required_en, review_status, weight, minimum_evidence_count) values
  ('8f000000-0000-4000-8000-000000000001', '8f000000-0000-4000-8000-000000000011', false, 'high', 'working', 'x', 'x', 'draft', 0.5, 2),
  ('8f000000-0000-4000-8000-000000000001', '8f000000-0000-4000-8000-000000000012', true, 'high', 'working', 'x', 'x', 'draft', 0.5, 2),
  ('8f000000-0000-4000-8000-000000000001', '8f000000-0000-4000-8000-000000000013', false, 'medium', 'foundation', 'x', 'x', 'draft', 0.5, 1);
create temporary table pc_core_before as select skill_id, is_core from role_requirement where target_role_id = '8f000000-0000-4000-8000-000000000001';

select pc_must_fail(null, $$insert into skill_classification_set (key, version, target_role_id, taxonomy, label_ar, label_en, description_en, created_by, activation) values ('pc_cls', 9, '8f000000-0000-4000-8000-000000000001', 'must_core_supporting@1', 'x', 'x', 'x', 'author', 'development_only')$$,
  '0034: a classification is born draft and inactive (never inserted active)', 'born draft and inactive|active_is_approved');
select pc_must_fail(null, $$insert into skill_classification_set (key, version, target_role_id, taxonomy, label_ar, label_en, description_en, created_by, activation) values ('pc_cls', 9, '8f000000-0000-4000-8000-000000000001', 'must_core_supporting@1', 'x', 'x', 'x', 'author', 'production_active')$$,
  '0034: a production activation state does not exist before P6 (insert)', 'activation_check|born draft');
select pc_must_fail(null, $$insert into skill_classification_set (key, version, target_role_id, taxonomy, label_ar, label_en, description_en, created_by) values ('pc_cls', 9, '8f000000-0000-4000-8000-000000000001', 'tiers@1', 'x', 'x', 'x', 'author')$$,
  '0034: unknown taxonomy refused (a new taxonomy is an EXT-3 extension)', 'taxonomy_check');

insert into skill_classification_set (id, key, version, target_role_id, taxonomy, label_ar, label_en, description_en, created_by) values
  ('8f000000-0000-4000-8000-000000000021', 'pc_cls', 1, '8f000000-0000-4000-8000-000000000001', 'must_core_supporting@1', 'تصنيف', 'classification', 'proof', 'author');
insert into skill_classification (set_id, skill_id, class, source_kind, source_ref) values
  ('8f000000-0000-4000-8000-000000000021', '8f000000-0000-4000-8000-000000000011', 'must', 'sme', 'SME-17'),
  ('8f000000-0000-4000-8000-000000000021', '8f000000-0000-4000-8000-000000000012', 'core', 'sme', 'SME table'),
  ('8f000000-0000-4000-8000-000000000021', '8f000000-0000-4000-8000-000000000013', 'supporting', 'po_default', 'decision pack §B: SME silent; PO default');
select pc_must_fail(null, $$insert into skill_classification (set_id, skill_id, class, source_kind, source_ref) values ('8f000000-0000-4000-8000-000000000021', '8f000000-0000-4000-8000-000000000014', 'core', 'sme', 'x')$$,
  '0034: only a skill the role requires can be classified for it', 'role requires');
select pc_must_fail(null, $$update skill_classification set source_ref = ' ' where skill_id = '8f000000-0000-4000-8000-000000000011'$$, '0034: provenance is mandatory', 'source_ref_check');
select pc_must_fail(null, $$update skill_classification set source_kind = 'guess' where skill_id = '8f000000-0000-4000-8000-000000000011'$$, '0034: provenance is sme or po_default only', 'source_kind_check');
select pc_must_fail(null, $$update skill_classification set class = 'mandatory' where skill_id = '8f000000-0000-4000-8000-000000000011'$$, '0034: closed class vocabulary', 'class_check');

select pc_must_fail(null, $$update skill_classification_set set review_status = 'approved', sme_approved_by = 'author', sme_approved_at = now(), po_approved_by = 'po', po_approved_at = now() where id = '8f000000-0000-4000-8000-000000000021'$$,
  '0034: four eyes — the drafter never approves', 'four_eyes');
select pc_must_fail(null, $$update skill_classification_set set review_status = 'approved', sme_approved_by = 'Named SME', sme_approved_at = now() where id = '8f000000-0000-4000-8000-000000000021'$$,
  'D-4: PO defaults need the Product Owner''s named approval in addition to the SME''s', 'Product Owner defaults');
select pc_must_fail(null, $$update skill_classification_set set activation = 'development_only' where id = '8f000000-0000-4000-8000-000000000021'$$,
  '0034: a draft is never in effect', 'active_is_approved|opt-in');
update skill_classification_set set review_status = 'approved', sme_approved_by = 'Named SME', sme_approved_at = now(), po_approved_by = 'Product Owner', po_approved_at = now()
  where id = '8f000000-0000-4000-8000-000000000021';
select pc_must_fail(null, $$update skill_classification set class = 'core' where skill_id = '8f000000-0000-4000-8000-000000000013'$$, '0034: entries are fixed once approved', 'fixed');
select pc_must_fail(null, $$update skill_classification_set set activation = 'production_active' where id = '8f000000-0000-4000-8000-000000000021'$$,
  '0034: even an approved classification has no production state before P6', 'activation_check');
select pc_must_fail(null, $$update skill_classification_set set po_approved_by = null, po_approved_at = null where id = '8f000000-0000-4000-8000-000000000021'$$, '0034: an approval is final', 'final');
select pc_must_fail(null, $$update skill_classification_set set activation = 'development_only' where id = '8f000000-0000-4000-8000-000000000021'$$,
  '0034: development_only only with the explicit opt-in', 'classification_dev_activation');
select pc_must_fail($$select set_config('naqla.classification_dev_activation', 'on', true), set_config('naqla.production', 'on', true)$$,
  $$update skill_classification_set set activation = 'development_only' where id = '8f000000-0000-4000-8000-000000000021'$$,
  '0034: never in production, even with the opt-in', 'never be activated in production');
select set_config('naqla.classification_dev_activation', 'on', false);
update skill_classification_set set activation = 'development_only' where id = '8f000000-0000-4000-8000-000000000021';
select set_config('naqla.classification_dev_activation', '', false);
do $$ begin
  if role_professional_class('8f000000-0000-4000-8000-000000000001', '8f000000-0000-4000-8000-000000000011') is distinct from 'must' then raise exception 'FAIL  class in effect'; end if;
  if role_professional_class('8f000000-0000-4000-8000-000000000001', '8f000000-0000-4000-8000-000000000014') is not null then raise exception 'FAIL  unclassified skill'; end if;
  perform set_config('naqla.production', 'on', true);
  if role_professional_class('8f000000-0000-4000-8000-000000000001', '8f000000-0000-4000-8000-000000000011') is not null then raise exception 'FAIL  class in production'; end if;
  perform set_config('naqla.production', '', true);
  if exists (select 1 from role_requirement rr join pc_core_before b using (skill_id) where rr.target_role_id = '8f000000-0000-4000-8000-000000000001' and rr.is_core is distinct from b.is_core) then
    raise exception 'FAIL  is_core changed';
  end if;
  raise notice 'PASS  0034: the class is in effect in development only (never in production); legacy is_core is untouched (no mirror, D-2)';
end $$;
select pc_must_fail(null, $$insert into skill_classification_set (id, key, version, target_role_id, taxonomy, label_ar, label_en, description_en, created_by) values ('8f000000-0000-4000-8000-000000000022', 'pc_cls', 2, '8f000000-0000-4000-8000-000000000001', 'must_core_supporting@1', 'x', 'x', 'x', 'author');
  insert into skill_classification (set_id, skill_id, class, source_kind, source_ref) values ('8f000000-0000-4000-8000-000000000022', '8f000000-0000-4000-8000-000000000011', 'core', 'sme', 'x');
  update skill_classification_set set review_status = 'approved', sme_approved_by = 'Named SME', sme_approved_at = now() where id = '8f000000-0000-4000-8000-000000000022';
  select set_config('naqla.classification_dev_activation', 'on', true);
  update skill_classification_set set activation = 'development_only' where id = '8f000000-0000-4000-8000-000000000022'$$,
  '0034: one classification in effect per role', 'one_active_per_role');
select pc_must_fail(null, $$delete from skill_classification_set where id = '8f000000-0000-4000-8000-000000000021'$$, '0034: a classification is never deleted', 'never deleted');
select pc_must_fail(null, $$update skill_classification_set set target_role_id = gen_random_uuid() where id = '8f000000-0000-4000-8000-000000000021'$$, '0034: identity immutable', 'immutable|foreign key');
select pc_ok(null, $$update skill_classification_set set activation = 'inactive' where id = '8f000000-0000-4000-8000-000000000021'$$, '0034: a classification can be deactivated (history kept)');

set role authenticated; set request.jwt.claim.sub = '8f000000-0000-4000-8000-0000000000aa';
select pc_must_fail(null, $$insert into skill_classification_set (key, version, target_role_id, taxonomy, label_ar, label_en, description_en, created_by) values ('pc_x', 1, '8f000000-0000-4000-8000-000000000001', 'must_core_supporting@1', 'x', 'x', 'x', 'client')$$,
  '0034: a client can never write a classification', 'permission denied');
do $$ begin
  if (select count(*) from skill_classification_set) <> 1 then raise exception 'FAIL  client sees % sets', (select count(*) from skill_classification_set); end if;
  raise notice 'PASS  0034: a learner reads only the classification in effect (approved, development_only), nothing else';
end $$;
reset role;

-- ─────────────────────────────── pack-constraint schema 2 ───────────────────────────────
set naqla.config_actor = 'p3 proof'; set naqla.config_reason = 'prove schema 2';
insert into pack_constraint_set (id, key, version, track_id, label_ar, label_en, description_en, created_by, schema_version) values
  ('8f000000-0000-4000-8000-000000000031', 'pc_v2', 1, 'pc_track', 'x', 'x', 'schema-2 proof set', 'proof', 2);
select pc_must_fail(null, $$insert into pack_constraint (set_id, constraint_type, min_value, max_value) values ('8f000000-0000-4000-8000-000000000031', 'core_skill_count', 4, 5)$$,
  '0034: a schema-2 set never takes the legacy is_core constraints', 'schema-2 constraints');
select pc_must_fail(null, $$insert into pack_constraint_v2 (set_id, constraint_type, min_value, max_value) select id, 'must_skill_count', 6, 6 from pack_constraint_set where key = 'legacy_pack_constraints'$$,
  '0034: the legacy baseline never takes schema-2 constraints (and stays frozen)', 'legacy constraints|immutable');
select pc_must_fail(null, $$insert into pack_constraint_v2 (set_id, constraint_type, min_value, max_value) values ('8f000000-0000-4000-8000-000000000031', 'core_skill_count', 4, 5)$$,
  '0034: closed schema-2 vocabulary', 'constraint_type_check');
insert into pack_constraint_v2 (set_id, constraint_type, min_value, max_value) values ('8f000000-0000-4000-8000-000000000031', 'must_skill_count', 6, 6);
select pc_must_fail(null, $$update pack_constraint_set set activation = 'production_active', review_status = 'approved', approved_by = 'po', approved_at = now() where id = '8f000000-0000-4000-8000-000000000031'$$,
  '0034: a schema-2 set is at most development_only before P6', 'schema2_development_only');
select pc_must_fail(null, $$update pack_constraint_set set schema_version = 1 where id = '8f000000-0000-4000-8000-000000000031'$$, '0034: schema_version is immutable', 'immutable|check');
select pc_ok(null, $$update pack_constraint_set set activation = 'development_only' where id = '8f000000-0000-4000-8000-000000000031'$$,
  '0034: a schema-2 track set and the v1 baseline can both be in effect (the index separates schemas)');
reset naqla.config_actor; reset naqla.config_reason;
do $$ begin
  if (select count(*) from pack_constraint where set_id = (select id from pack_constraint_set where key = 'legacy_pack_constraints')) <> 7 then raise exception 'FAIL  legacy baseline changed'; end if;
  raise notice 'PASS  0034: the frozen legacy baseline still states exactly its 7 constraints';
end $$;
