-- ═══════════════════════════════════════════════════════════════════════════
-- Access model proof.
--
-- Runs real queries as `authenticated` (two different users) and as `anon`,
-- and asserts what each can and cannot see. A policy nobody tested is a policy
-- nobody can trust.
--
--   psql -d naqla_test -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
-- ═══════════════════════════════════════════════════════════════════════════

--
-- NOT IDEMPOTENT: this script inserts its own fixtures (a published profile, a
-- case study, a share link). Run it once against a freshly created database —
-- scripts/db-test.sh drops and recreates one each time. Running it twice makes
-- "anon sees no unpublished profile" fail on the row the first run published,
-- which is the harness repeating itself, not a policy regression.

\set ON_ERROR_STOP on

create or replace function expect_rows(stmt text, expected int, label text) returns void
  language plpgsql as $$
  declare actual int;
  begin
    execute 'select count(*) from (' || stmt || ') q' into actual;
    if actual <> expected then
      raise exception 'FAIL  %  — expected % row(s), got %', label, expected, actual;
    end if;
    raise notice 'PASS  %  (% row(s))', label, actual;
  end;
  $$;

create or replace function expect_denied(stmt text, label text) returns void
  language plpgsql as $$
  begin
    begin
      execute stmt;
    exception when others then
      raise notice 'PASS  %  (denied: %)', label, replace(SQLERRM, E'\n', ' ');
      return;
    end;
    raise exception 'FAIL  %  — the operation was ALLOWED', label;
  end;
  $$;

-- The helpers run as owner; reset the role inside each block instead.
alter function expect_rows(text, int, text) security invoker;
-- assert_effective_role is created below, after the helpers.
alter function expect_denied(text, text) security invoker;

-- ─────────────────── user A: owner of the fixture data ─────────────────────

-- Guard: prove the role switch took effect. Without this, a silent failure to
-- switch would run everything as superuser, which BYPASSES RLS and would make
-- every assertion below pass for the wrong reason.
create or replace function assert_effective_role(expected text) returns void
  language plpgsql as $$
  begin
    if current_user <> expected then
      raise exception 'FAIL  role switch did not take effect: current_user is %, expected %',
        current_user, expected;
    end if;
    if (select rolbypassrls from pg_roles where rolname = current_user) then
      raise exception 'FAIL  % bypasses RLS; this test would prove nothing', current_user;
    end if;
    raise notice 'ROLE  now running as % (RLS applies)', current_user;
  end;
  $$;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select assert_effective_role('authenticated');

select expect_rows($$select 1 from project$$, 1, 'user A sees their own project');
select expect_rows($$select 1 from skill_claim$$, 1, 'user A sees their own claim');
select expect_rows($$select 1 from evidence$$, 1, 'user A sees their own evidence');
select expect_rows($$select 1 from evidence_transition$$, 1, 'user A sees their own transitions');
select expect_rows($$select 1 from activity_spec$$, 1, 'user A sees published activity specs');
select expect_rows($$select 1 from rubric_version$$, 0,
  'user A cannot read rubric criteria: seeing the rubric changes what is measured');
select expect_rows($$select 1 from human_review$$, 0, 'user A cannot read the blind review queue');
select expect_rows($$select 1 from integrity_check$$, 0, 'user A cannot read integrity checks');
select expect_rows($$select 1 from model_call$$, 0, 'user A cannot read model call metering');
select expect_rows($$select 1 from job$$, 0, 'user A cannot read queue internals');
select expect_rows($$select 1 from audit_event$$, 0, 'user A cannot query the audit trail directly');

-- A user may not promote themselves. This is the whole product in one test.
select expect_denied($$
  insert into skill_claim (user_id, skill_id, state, state_reason)
  values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333',
          'verified', 'I say so')
$$, 'user A cannot write their own skill claim');

select expect_denied($$
  insert into evidence (user_id, skill_id, source_strength, provenance_class, provenance_source)
  values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333',
          'platform_controlled', 'user_generated', 'me')
$$, 'user A cannot write their own evidence');

select expect_denied($$
  insert into evidence_transition (skill_claim_id, user_id, from_state, to_state,
                                   transition_rule_id, actor_kind, reason)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111',
          'demonstrated', 'verified', 'T-SELF-PROMOTE', 'user', 'promoting myself')
$$, 'user A cannot promote their own evidence state');

select expect_denied($$
  update evaluation_result set outcome = 'passed'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
$$, 'user A cannot rewrite an evaluation result');

select expect_denied($$
  delete from evidence_transition
$$, 'user A cannot delete ladder history');

select expect_denied($$
  insert into readiness_score (user_id, kind, value, weights_version, triggered_by_event)
  values ('11111111-1111-4111-8111-111111111111', 'cv', 99, 'v1', 'evidence.created')
$$, 'user A cannot set their own readiness score');

-- ─────────────────── user B: sees nothing of user A ────────────────────────

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select assert_effective_role('authenticated');

select expect_rows($$select 1 from project$$, 0, 'user B sees none of user A''s projects');
select expect_rows($$select 1 from skill_claim$$, 0, 'user B sees none of user A''s claims');
select expect_rows($$select 1 from evidence$$, 0, 'user B sees none of user A''s evidence');
select expect_rows($$select 1 from submission_file$$, 0, 'user B sees none of user A''s files');
select expect_rows($$select 1 from recruiter_report$$, 0, 'user B sees none of user A''s reports');
select expect_rows($$select 1 from ai_disclosure$$, 0, 'user B sees none of user A''s disclosures');
select expect_rows($$select 1 from cv_version$$, 0, 'user B sees none of user A''s CV versions');

-- ─────────────────── anonymous visitor: default deny ───────────────────────

set role anon;
set request.jwt.claim.sub = '';
select assert_effective_role('anon');

select expect_rows($$select 1 from project$$, 0, 'anon sees no projects');
select expect_rows($$select 1 from evidence$$, 0, 'anon sees no evidence');
select expect_rows($$select 1 from evaluation_result$$, 0, 'anon sees no evaluation results');
select expect_rows($$select 1 from submission_file$$, 0, 'anon sees no uploaded files');
select expect_rows($$select 1 from recruiter_report$$, 0, 'anon sees no recruiter reports');
select expect_rows($$select 1 from ai_disclosure$$, 0, 'anon sees no AI disclosures');
select expect_rows($$select 1 from audit_event$$, 0, 'anon sees no audit events');
select expect_rows($$select 1 from notification$$, 0, 'anon sees no notifications');
select expect_rows($$select 1 from public_profile$$, 0, 'anon sees no unpublished profile');
select expect_rows($$select 1 from case_study$$, 0, 'anon sees no case study without a share link');
select expect_rows($$select 1 from skill$$, 1, 'anon may read the skill catalogue (non-personal content)');

reset role;

-- ───────────── publishing makes exactly one thing visible ──────────────────

insert into public_profile (user_id, slug, visibility, published_at)
  values ('11111111-1111-4111-8111-111111111111', 'sara', 'public', now());

set role anon;
select expect_rows($$select 1 from public_profile$$, 1, 'anon sees a published profile');
select expect_rows($$select 1 from evidence$$, 0,
  'publishing a profile does NOT expose the evidence behind it');
select expect_rows($$select 1 from submission_file$$, 0,
  'publishing a profile does NOT expose raw uploads');
reset role;

-- ──────────── a share link opens one door, and revoking shuts it ───────────

-- Phase 9: a case study opens only for an asset presentable NOW: approved, active,
-- evidence-backed and grounded under the version the last completed re-grounding declared.
insert into professional_asset (id, user_id, kind, title, body, provenance_class,
                                provenance_source, user_approved_at, lifecycle_state, grounding_version)
  values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111',
          'case_study', 'Task board', 'body', 'system_derived', 'evaluation aaaaaaaa', now(), 'active', 'rls-test@1');
insert into grounding_public_state (version, set_by, reason) values ('rls-test@1', 'rls proof', 'fixture');

insert into case_study (id, user_id, asset_id, context, problem, what_i_built, result,
                        source_evaluation_result_id)
  values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111',
          'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'c', 'p', 'w', 'r',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

set role anon;
select expect_rows($$select 1 from case_study$$, 0, 'no link yet: the case study stays private');
reset role;

insert into share_link (id, user_id, resource_kind, resource_id, token_hash, expires_at)
  values ('ffffffff-ffff-4fff-8fff-ffffffffffff', '11111111-1111-4111-8111-111111111111',
          'case_study', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'hash-abc', now() + interval '7 days');

set role anon;
select expect_rows($$select 1 from case_study$$, 1, 'a live share link opens the case study');
reset role;

update professional_asset set lifecycle_state = 'needs_review', evidence_backed = false, review_reason = 'rls proof', review_at = now() where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
set role anon;
select expect_rows($$select 1 from case_study$$, 0, 'an asset moved to needs_review closes its live link (Phase 9)');
reset role;
update professional_asset set lifecycle_state = 'active', evidence_backed = true, review_reason = null, review_at = null where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

insert into asset_evidence (asset_id, evidence_id) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
update evidence set withdrawn_at = now(), withdrawn_reason = 'rls proof' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set role anon;
select expect_rows($$select 1 from case_study$$, 0, 'an asset citing withdrawn evidence closes its live link (Phase 9)');
reset role;
update evidence set withdrawn_at = null, withdrawn_reason = null where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set role anon;
select expect_rows($$select 1 from case_study$$, 1, 'restoring the evidence reopens it (the check is live, not a stored flag)');
reset role;

update grounding_public_state set version = 'rls-test@2', set_by = 'rls proof', reason = 'new engine' where singleton;
set role anon;
select expect_rows($$select 1 from case_study$$, 0, 'an asset not re-grounded under the declared version stays closed (Phase 9)');
reset role;
update grounding_public_state set version = null, set_by = 'rls proof', reason = 'freeze' where singleton;
set role anon;
select expect_rows($$select 1 from case_study$$, 0, 'a frozen public grounding state opens nothing (Phase 9)');
select expect_denied($$select 1 from grounding_public_state$$, 'anon cannot read or set the public grounding state');
reset role;
update grounding_public_state set version = 'rls-test@1', set_by = 'rls proof', reason = 'restore' where singleton;

update share_link set revoked_at = now() where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

set role anon;
select expect_rows($$select 1 from case_study$$, 0, 'revoking the link shuts the door immediately');
reset role;

update share_link set revoked_at = null, expires_at = now() - interval '1 day'
  where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

set role anon;
select expect_rows($$select 1 from case_study$$, 0, 'an expired link is closed too');
reset role;

-- ─────────────── Phase 8: Track Builder governance is not user-reachable ───────────────
-- Roles come from operator grants; nobody grants themself a Track Builder role,
-- and track-skill change drafts are reachable only through the API (service).
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select assert_effective_role('authenticated');
select expect_denied($$
  insert into reviewer_grant (user_id, role_performed, granted_by)
  values ('11111111-1111-4111-8111-111111111111', 'track_admin', 'myself')
$$, 'a user cannot grant themself the track administrator role');
select expect_denied($$
  insert into reviewer_grant (user_id, role_performed, granted_by)
  values ('11111111-1111-4111-8111-111111111111', 'product_owner', 'myself')
$$, 'a user cannot grant themself the product owner role');
select expect_denied($$select 1 from reviewer_grant$$, 'a user cannot read reviewer grants');
select expect_denied($$select 1 from track_skill_change$$, 'a user cannot read track-skill change drafts');
select expect_denied($$
  insert into track_skill_change (target_role_id, role_requirement_id, proposed, base, professional, reason, drafted_by)
  values (gen_random_uuid(), gen_random_uuid(), '{"is_core": true}', '{}', true, 'self', '11111111-1111-4111-8111-111111111111')
$$, 'a user cannot write a track-skill change');
select expect_denied($$
  update claim_policy set min_evidence_count = 1
$$, 'a user cannot edit a claim policy');
reset role;

-- ─────────────── Phase 9: pack constraints and validation runs are not user-reachable ───────────────
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select assert_effective_role('authenticated');
select expect_denied($$select 1 from pack_constraint_set$$, 'a user cannot read pack constraint sets');
select expect_denied($$update pack_constraint set max_value = 99$$, 'a user cannot change a pack constraint');
select expect_denied($$insert into pack_validation_run (pack_id, pack_version, track_id, passed) values ('x', '1', 'x', true)$$, 'a user cannot forge a pack validation record');
reset role;
insert into pack_validation_run (pack_id, pack_version, track_id, passed) values ('rls_proof', '1', 'rls_proof', false);
select expect_denied($$update pack_validation_run set passed = true$$, 'pack validation runs are append-only, even for the owner');
select expect_denied($$delete from pack_validation_run$$, 'pack validation runs cannot be deleted');
select expect_denied($$insert into pack_constraint (set_id, constraint_type, min_value) select id, 'task_count', 1 from pack_constraint_set where key = 'legacy_pack_constraints'$$,
  'the baseline constraint set is frozen (it has been active)');

\echo ''
\echo 'All access-model checks passed.'
