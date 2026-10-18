-- ═══════════════════════════════════════════════════════════════════════════
-- ENG-1 P4 corroborating-evidence integrity proofs (migration 0031). Own fixtures (9f…). Run by scripts/db-test.sh.
-- The guards that need a real corroborating row (written by the per-skill writer from a met, verified assessment)
-- are proven end to end in apps/api/test/eng1-p4-evidence.e2e.ts, against the rows the writer produced.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

create or replace function ci_must_fail(setup text, stmt text, label text, expect_error text) returns void language plpgsql as $$
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
alter function ci_must_fail(text, text, text, text) security invoker;

do $$ begin
  if exists (select 1 from evidence where evidence_role <> 'primary') then raise exception 'FAIL  0031 relabelled existing evidence'; end if;
  raise notice 'PASS  0031: every existing evidence row is primary (the column default; no row rewritten)';
end $$;

insert into app_user (id, display_name) values ('9f000000-0000-4000-8000-000000000001', 'CI user');
insert into skill (id, slug, label_ar, label_en, provenance_class, provenance_source) values ('9f000000-0000-4000-8000-000000000011', 'ci-html', 'h', 'h', 'curated', 'p4 proof');
insert into evidence (id, user_id, skill_id, source_strength, provenance_class, provenance_source)
  values ('9f000000-0000-4000-8000-000000000021', '9f000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000011', 'self_reported', 'user_generated', 'p4 proof');

select ci_must_fail(null, $$update evidence set evidence_role = 'corroborating' where id = '9f000000-0000-4000-8000-000000000021'$$,
  '0031: a primary row can never be relabelled corroborating (role immutable, every role)', 'immutable');
select ci_must_fail(null, $$insert into evidence (user_id, skill_id, source_strength, provenance_class, provenance_source, evidence_role) values ('9f000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000011', 'self_reported', 'user_generated', 'x', 'corroborating')$$,
  '0031: a self-declaration can never be corroborating evidence (a skill assessment is required)', 'corroborating_needs_assessment');
select ci_must_fail(null, $$insert into evidence (user_id, skill_id, source_strength, provenance_class, provenance_source, evidence_role) values ('9f000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000011', 'self_reported', 'user_generated', 'x', 'supporting')$$,
  '0031: unknown evidence role refused', 'evidence_role_check|corroborating_needs_assessment');
select ci_must_fail($$select set_config('naqla.production', 'on', true)$$,
  $$insert into evidence (user_id, skill_id, source_strength, provenance_class, provenance_source, evidence_role, skill_assessment_id) values ('9f000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000011', 'self_reported', 'user_generated', 'x', 'corroborating', gen_random_uuid())$$,
  '0031: corroborating evidence is never written in production', 'production');
select ci_must_fail(null, $$insert into evidence (user_id, skill_id, source_strength, provenance_class, provenance_source, evidence_role, skill_assessment_id) values ('9f000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000011', 'self_reported', 'user_generated', 'x', 'corroborating', gen_random_uuid())$$,
  '0031: corroborating evidence must rest on a real skill assessment', 'needs_assessment');

do $$ begin
  if evidence_corroboration_conflict('9f000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000011', gen_random_uuid()) is distinct from 'unresolvable_task' then
    raise exception 'FAIL  0031 conflict on an unknown result';
  end if;
  raise notice 'PASS  0031: an evaluation result that cannot be traced to a task is a conflict (fail closed), never independent';
  if exists (select 1 from pg_trigger where tgname in ('evidence_role_guard_trg', 'verification_decision_evidence_role_trg', 'skill_claim_primary_evidence_role_trg',
                                                     'asset_evidence_role_guard_trg', 'agent_proposal_evidence_role_guard_trg') and not tgenabled = 'O') then
    raise exception 'FAIL  0031 guard disabled';
  end if;
  if (select count(*) from pg_trigger where tgname in ('evidence_role_guard_trg', 'verification_decision_evidence_role_trg', 'skill_claim_primary_evidence_role_trg',
                                                     'asset_evidence_role_guard_trg', 'agent_proposal_evidence_role_guard_trg')) <> 5 then
    raise exception 'FAIL  0031 guard missing';
  end if;
  raise notice 'PASS  0031: the five role guards (evidence, decision, claim primary, asset, agent proposal) are installed and enabled';
  if exists (select 1 from evidence where evidence_role = 'corroborating') then raise exception 'FAIL  corroborating evidence at rest'; end if;
  raise notice 'PASS  at rest: no corroborating evidence exists (no policy enables it)';
end $$;

-- ─────────────────────────────── 0032: versioned text fingerprints ───────────────────────────────
do $$ begin
  if exists (select 1 from pg_proc where proname = 'evidence_normalized_text_hash') then raise exception 'FAIL  0032 left the SQL normalizer'; end if;
  if current_text_fingerprint_version() <> 'naqla-text-fp-v1' then raise exception 'FAIL  0032 version'; end if;
  raise notice 'PASS  0032: the database no longer normalizes text (one definition, version naqla-text-fp-v1, in TypeScript)';
end $$;
insert into project (id, user_id, title, kind) values ('9f000000-0000-4000-8000-000000000041', '9f000000-0000-4000-8000-000000000001', 'fp', 'personal_project');
insert into submission (id, project_id, user_id) values ('9f000000-0000-4000-8000-000000000051', '9f000000-0000-4000-8000-000000000041', '9f000000-0000-4000-8000-000000000001');
insert into submission_artifact (id, submission_id, user_id, key, kind, value_text) values
  ('9f000000-0000-4000-8000-000000000061', '9f000000-0000-4000-8000-000000000051', '9f000000-0000-4000-8000-000000000001', 'note.a', 'text', 'a text deliverable long enough to be an artifact here'),
  ('9f000000-0000-4000-8000-000000000062', '9f000000-0000-4000-8000-000000000051', '9f000000-0000-4000-8000-000000000001', 'link.b', 'link', 'https://example.org/repo');
insert into artifact_text_fingerprint (submission_artifact_id, fingerprint_version, user_id, submission_id, fingerprint, normalized_length, runtime_unicode)
  values ('9f000000-0000-4000-8000-000000000061', 'naqla-text-fp-v1', '9f000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000051', repeat('c', 64), 52, '15.1');
select ci_must_fail(null, $$update artifact_text_fingerprint set fingerprint = repeat('d', 64)$$, '0032: a fingerprint is never rewritten', 'never changed or deleted');
select ci_must_fail(null, $$delete from artifact_text_fingerprint$$, '0032: … nor deleted', 'never changed or deleted');
select ci_must_fail(null, $$insert into artifact_text_fingerprint (submission_artifact_id, fingerprint_version, user_id, submission_id, fingerprint, normalized_length, runtime_unicode)
  values ('9f000000-0000-4000-8000-000000000062', 'naqla-text-fp-v1', '9f000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000051', repeat('e', 64), 52, '15.1')$$,
  '0032: only a text deliverable has a text fingerprint', 'belongs to a text deliverable');
select ci_must_fail(null, $$insert into artifact_text_fingerprint (submission_artifact_id, fingerprint_version, user_id, submission_id, fingerprint, normalized_length, runtime_unicode)
  values ('9f000000-0000-4000-8000-000000000061', 'naqla-text-fp-v2', gen_random_uuid(), '9f000000-0000-4000-8000-000000000051', repeat('e', 64), 52, '15.1')$$,
  '0032: a fingerprint carries its artifact''s own learner (no cross-tenant row)', 'own learner|foreign key');
select ci_must_fail(null, $$insert into artifact_text_fingerprint (submission_artifact_id, fingerprint_version, user_id, submission_id, fingerprint, normalized_length, runtime_unicode)
  values ('9f000000-0000-4000-8000-000000000061', 'naqla-text-fp-v1', '9f000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000051', null, 52, '15.1')$$,
  '0032: a v1 artifact (>= 40 code points) always has a fingerprint', 'v1_threshold|duplicate key');
set role authenticated; set request.jwt.claim.sub = '9f000000-0000-4000-8000-000000000001';
select ci_must_fail(null, $$select 1 from artifact_text_fingerprint$$, '0032: a learner cannot read fingerprints, not even their own', 'permission denied');
reset role; set role anon;
select ci_must_fail(null, $$select 1 from artifact_text_fingerprint$$, '0032: anon cannot read fingerprints', 'permission denied');
reset role;
do $$ begin
  if exists (select 1 from artifact_text_fingerprint where submission_artifact_id not in ('9f000000-0000-4000-8000-000000000061')) then raise exception 'FAIL  0032 populated fingerprints'; end if;
  raise notice 'PASS  0032: the migration computes no fingerprint (the writer does, with the one TypeScript definition)';
end $$;

