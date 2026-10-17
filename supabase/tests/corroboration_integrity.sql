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
  if evidence_normalized_text_hash('short answer') is not null then raise exception 'FAIL  0031 short text hashed'; end if;
  if evidence_normalized_text_hash(E'The  Form validates   every field before\tsubmitting it to the server')
     is distinct from evidence_normalized_text_hash('the form validates every field before submitting it to the server  ') then
    raise exception 'FAIL  0031 normalization';
  end if;
  raise notice 'PASS  0031: text reuse is normalized (case, whitespace) and short answers (< 40 chars) are never treated as artifacts';
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
