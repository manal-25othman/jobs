-- ═══════════════════════════════════════════════════════════════════════════
-- D-135 proofs (migration 0035): an undecided criterion weight stays undecided, only on a DEMO rubric, only inside the
-- development pilot loader's opt-in, never in production; the pilot-load ledger is append-only, opt-in, demo-only and
-- invisible to clients. Own fixtures (a1…). Run by scripts/db-test.sh.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

create or replace function dp_must_fail(setup text, stmt text, label text, expect_error text) returns void language plpgsql as $$
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
create or replace function dp_ok(setup text, stmt text, label text) returns void language plpgsql as $$
  begin
    begin
      if setup is not null then execute setup; end if;
      execute stmt;
      raise notice 'PASS  %  (accepted)', label;
      raise exception 'dp_rollback';
    exception when others then
      if SQLERRM = 'dp_rollback' then return; end if;
      raise exception 'FAIL  %  — refused: %', label, SQLERRM;
    end;
  end $$;

do $$ begin
  if exists (select 1 from rubric_criterion where weight is null) then raise exception 'FAIL  0035 left an existing weight empty'; end if;
  if exists (select 1 from pilot_content_load) then raise exception 'FAIL  0035 created a pilot load'; end if;
  raise notice 'PASS  0035: no existing weight changed; no pilot content created';
end $$;

insert into skill (id, slug, label_ar, label_en, provenance_class, provenance_source) values ('a1000000-0000-4000-8000-000000000011', 'dp-html', 'h', 'h', 'curated', 'D-135 proof');
insert into activity_spec (id, slug, version, status, title_ar, ai_usage_mode, spec, is_demo_fixture) values
  ('a1000000-0000-4000-8000-000000000021', 'dp-demo', '1.0.0', 'draft', 'نشاط', 'ai_assisted', '{}'::jsonb, true),
  ('a1000000-0000-4000-8000-000000000022', 'dp-real', '1.0.0', 'draft', 'نشاط', 'ai_assisted', '{}'::jsonb, false);
insert into rubric_version (id, activity_spec_id, version, status, criteria, is_demo_fixture) values
  ('a1000000-0000-4000-8000-000000000031', 'a1000000-0000-4000-8000-000000000021', 'dp-demo@1', 'draft', '[]'::jsonb, true),
  ('a1000000-0000-4000-8000-000000000032', 'a1000000-0000-4000-8000-000000000022', 'dp-real@1', 'draft', '[]'::jsonb, false);

create or replace function dp_crit(rubric text, weight text, status text) returns text language sql as $$
  select format($f$insert into rubric_criterion (rubric_version_id, key, name_ar, name_en, dimension, linked_skill_id, source, weight, weight_status, max_score,
                    evaluator_type, human_review_required, description_ar, description_en, expected_evidence_ar, expected_evidence_en, rationale_when_met_ar, rationale_when_unmet_ar)
                  values (%L, 'k', 'n', 'n', (select enum_range(null::rubric_dimension))[1], 'a1000000-0000-4000-8000-000000000011', 'activity', %s, %L, 2,
                          'human', true, 'd', 'd', 'e', 'e', 'm', 'u')$f$, rubric, weight, status)
$$;

select dp_must_fail(null, dp_crit('a1000000-0000-4000-8000-000000000031', 'null', 'TBD'),
  '0035: an empty weight is refused outside the pilot loader (no opt-in)', 'only by the development pilot loader');
select dp_must_fail($$select set_config('naqla.pilot_content_load', 'on', true), set_config('naqla.production', 'on', true)$$, dp_crit('a1000000-0000-4000-8000-000000000031', 'null', 'TBD'),
  '0035: an empty weight is refused in production, even with the opt-in', 'never written in production');
select dp_must_fail($$select set_config('naqla.pilot_content_load', 'on', true)$$, dp_crit('a1000000-0000-4000-8000-000000000032', 'null', 'TBD'),
  '0035: an empty weight is refused on a NON-demo rubric', 'only on a DEMO-fixture rubric');
select dp_must_fail($$select set_config('naqla.pilot_content_load', 'on', true)$$, dp_crit('a1000000-0000-4000-8000-000000000031', 'null', 'proposed'),
  '0035: an empty weight must say TBD (never a disguised proposal)', 'rubric_criterion_weight_undecided_is_tbd');
select dp_ok($$select set_config('naqla.pilot_content_load', 'on', true)$$, dp_crit('a1000000-0000-4000-8000-000000000031', 'null', 'TBD'),
  '0035: an empty, TBD weight on a DEMO rubric inside the pilot opt-in is accepted');
select dp_ok(null, dp_crit('a1000000-0000-4000-8000-000000000032', '0.5', 'proposed'),
  '0035: a stated weight is written exactly as before (no opt-in needed)');
select dp_must_fail(dp_crit('a1000000-0000-4000-8000-000000000032', '0.5', 'TBD'), $$update rubric_criterion set weight = null where rubric_version_id = 'a1000000-0000-4000-8000-000000000032'$$,
  '0035: an existing weight is never emptied outside the pilot loader', 'only by the development pilot loader');
select dp_must_fail(null, $$update rubric_version set values_approved_by = gen_random_uuid(), values_approved_by_label = 'proof SME', values_approved_at = now(), values_approval_reason = 'D-135 proof',
      pass_threshold = null, pass_threshold_status = 'approved' where id = 'a1000000-0000-4000-8000-000000000032'$$,
  '0035: an approved pass threshold always has a value (even with a recorded SME approval)', 'rubric_version_approved_threshold_has_value');

insert into target_role (id, slug, label_ar, label_en, track_id, source_label, provenance_class, provenance_source, is_demo_fixture) values
  ('a1000000-0000-4000-8000-000000000041', 'dp-pilot-role', 'r', 'r', 'dp', 'D-135 proof', 'curated', 'D-135 proof', true),
  ('a1000000-0000-4000-8000-000000000042', 'dp-real-role', 'r', 'r', 'dp', 'D-135 proof', 'curated', 'D-135 proof', false);
create or replace function dp_load(role text) returns text language sql as $$
  select format($f$insert into pilot_content_load (pack_id, pack_version, target_role_id, loaded_by_label, reason, files, written)
                  values ('dp', '1', %L, 'proof', 'D-135 proof', '[]', '{}')$f$, role)
$$;
select dp_must_fail(null, dp_load('a1000000-0000-4000-8000-000000000041'), '0035: a pilot load needs the explicit opt-in', 'explicit, transaction-local opt-in');
select dp_must_fail($$select set_config('naqla.pilot_content_load', 'on', true), set_config('naqla.production', 'on', true)$$, dp_load('a1000000-0000-4000-8000-000000000041'),
  '0035: a pilot load is refused in production', 'never loaded in production');
select dp_must_fail($$select set_config('naqla.pilot_content_load', 'on', true)$$, dp_load('a1000000-0000-4000-8000-000000000042'),
  '0035: a pilot role is always a DEMO fixture', 'always a DEMO fixture');
select dp_ok($$select set_config('naqla.pilot_content_load', 'on', true)$$, dp_load('a1000000-0000-4000-8000-000000000041'), '0035: a pilot load with the opt-in on a demo role is accepted');
select dp_must_fail($$select set_config('naqla.pilot_content_load', 'on', true); $$ || dp_load('a1000000-0000-4000-8000-000000000041'),
  $$update pilot_content_load set reason = 'changed'$$, '0035: the pilot-load ledger is append-only (no update)', 'append-only');
select dp_must_fail($$select set_config('naqla.pilot_content_load', 'on', true); $$ || dp_load('a1000000-0000-4000-8000-000000000041'),
  $$delete from pilot_content_load$$, '0035: the pilot-load ledger is append-only (no delete)', 'append-only');

do $$ begin
  if has_table_privilege('authenticated', 'pilot_content_load', 'SELECT') or has_table_privilege('anon', 'pilot_content_load', 'SELECT')
     or has_table_privilege('authenticated', 'pilot_content_load', 'INSERT') then
    raise exception 'FAIL  0035: a client role can read or write the pilot-load ledger';
  end if;
  raise notice 'PASS  0035: the pilot-load ledger is service-only (no anon or authenticated read or write)';
end $$;

-- ─────────────────────── 0036 (D-136): development-only DEMO publication of PILOT content ───────────────────────
begin;
select set_config('naqla.pilot_content_load', 'on', true);
insert into pilot_content_load (pack_id, pack_version, target_role_id, loaded_by_label, reason, files, written)
  values ('dp', '1', 'a1000000-0000-4000-8000-000000000041', 'proof', 'D-136 proof', '[]', '{}');
commit;
insert into app_user (id, display_name) values ('a1000000-0000-4000-8000-000000000061', 'proof PO (fixture)'), ('a1000000-0000-4000-8000-000000000062', 'no grant (fixture)');
insert into reviewer_grant (user_id, role_performed, granted_by) values ('a1000000-0000-4000-8000-000000000061', 'product_owner', 'D-136 proof fixture');
insert into activity_spec (id, slug, version, status, title_ar, ai_usage_mode, spec, is_demo_fixture, target_role_id) values
  ('a1000000-0000-4000-8000-000000000051', 'dp-pilot-act', '1.0.0', 'curated', 'نشاط', 'ai_assisted', '{}'::jsonb, true, 'a1000000-0000-4000-8000-000000000041'),
  ('a1000000-0000-4000-8000-000000000052', 'dp-other-demo', '1.0.0', 'curated', 'نشاط', 'ai_assisted', '{}'::jsonb, true, null),
  ('a1000000-0000-4000-8000-000000000053', 'dp-real-curated', '1.0.0', 'curated', 'نشاط', 'ai_assisted', '{}'::jsonb, false, null);
\set PUB 'update activity_spec set status = ''published'' where id = ''a1000000-0000-4000-8000-000000000051'''
create or replace function dp_opt(production text, operator text) returns text language sql as $$
  select format($f$select set_config('naqla.pilot_demo_publication', 'on', true), set_config('naqla.pilot_publication_operator', %L, true), set_config('naqla.production', %L, true)$f$, operator, production)
$$;

select dp_must_fail(null, :'PUB', '0036: pilot content is not published without the explicit opt-in (the generic demo shortcut is closed for pilot rows)', 'only by the authorized Product Owner pilot operation');
select dp_must_fail(dp_opt('on', 'a1000000-0000-4000-8000-000000000061'), :'PUB', '0036: pilot content is never published in production, even with the opt-in and a grant', 'never published in production');
select dp_must_fail(dp_opt('', 'a1000000-0000-4000-8000-000000000062'), :'PUB', '0036: the operator must hold an active product_owner grant', 'active product_owner grant');
select dp_must_fail(dp_opt('', ''), :'PUB', '0036: an operator must be named', 'active product_owner grant');
select dp_must_fail($$update platform_deployment set demo_content_visible = false$$ || '; ' || dp_opt('', 'a1000000-0000-4000-8000-000000000061'), :'PUB',
  '0036: refused where the deployment does not show demo content', 'does not show demo content');
select dp_ok($$select set_config('naqla.config_actor', 'proof', true), set_config('naqla.config_reason', 'D-136 proof: a development deployment that shows demo content', true); update platform_deployment set demo_content_visible = true$$ || '; ' || dp_opt('', 'a1000000-0000-4000-8000-000000000061'), :'PUB', '0036: the authorized Product Owner operation (opt-in, grant, not production) publishes curated DEMO pilot content');
select dp_must_fail(null, $$update activity_spec set sme_approved_by = gen_random_uuid(), sme_approved_at = now() where id = 'a1000000-0000-4000-8000-000000000051'$$,
  '0036: a pilot row never carries an SME approval', 'never carries an SME approval');
select dp_ok(null, $$update activity_spec set status = 'published' where id = 'a1000000-0000-4000-8000-000000000052'$$,
  '0036: non-pilot content keeps the 0007 rules exactly (unchanged; the review command still never takes this shortcut)');
select dp_must_fail(dp_opt('', 'a1000000-0000-4000-8000-000000000061'), $$update activity_spec set status = 'published' where id = 'a1000000-0000-4000-8000-000000000053'$$,
  '0036: real (non-demo) content still publishes only after SME approval, even with the pilot opt-in and a PO grant (0007, unchanged)', 'only an approved record');
drop function dp_opt(text, text);

-- ─────────────────────── 0037 (Phase B, PO decision 1): the pilot is the role OFFERED; legacy roles stay visible ───────────────────────
insert into target_role (id, slug, label_ar, label_en, track_id, source_label, provenance_class, provenance_source, is_demo_fixture) values
  ('a1000000-0000-4000-8000-000000000043', 'dp-legacy-demo', 'r', 'r', 'dp', '0037 proof', 'curated', '0037 proof', true),
  ('a1000000-0000-4000-8000-000000000044', 'dp-other-track-demo', 'r', 'r', 'dp-other', '0037 proof', 'curated', '0037 proof', true);
do $$ begin
  if not graduate_role_superseded_by_pilot('a1000000-0000-4000-8000-000000000043') then raise exception 'FAIL  0037: a legacy DEMO role of the pilot track is still offered'; end if;
  if graduate_role_superseded_by_pilot('a1000000-0000-4000-8000-000000000041') then raise exception 'FAIL  0037: the pilot role itself is hidden'; end if;
  if graduate_role_superseded_by_pilot('a1000000-0000-4000-8000-000000000042') then raise exception 'FAIL  0037: a real (non-demo) role is hidden by a pilot'; end if;
  if graduate_role_superseded_by_pilot('a1000000-0000-4000-8000-000000000044') then raise exception 'FAIL  0037: a DEMO role of another track is hidden'; end if;
  if graduate_role_listed('a1000000-0000-4000-8000-000000000043') then raise exception 'FAIL  0037: graduate_role_listed still offers the superseded legacy role'; end if;
  if exists (select 1 from target_role where id = 'a1000000-0000-4000-8000-000000000043' and review_status in ('superseded', 'rejected')) then
    raise exception 'FAIL  0037: the legacy role was re-statused'; end if;
  raise notice 'PASS  0037: a legacy DEMO role of the pilot track is not offered; the pilot, real roles and other tracks are unaffected; no row re-statused';
end $$;
select dp_ok($$select set_config('naqla.config_actor', 'proof', true), set_config('naqla.config_reason', '0037 proof: demo content shown', true); update platform_deployment set demo_content_visible = true$$,
  $q$do $x$ begin if not graduate_role_visible('a1000000-0000-4000-8000-000000000043') then raise exception 'legacy role no longer visible'; end if; end $x$$q$,
  '0037: a superseded legacy role stays VISIBLE (existing goals, projects and evidence keep reading it)');

-- Fixtures stay (content rows are never deleted); they are demo/draft and named dp-*.
drop function dp_must_fail(text, text, text, text); drop function dp_ok(text, text, text); drop function dp_crit(text, text, text); drop function dp_load(text);
