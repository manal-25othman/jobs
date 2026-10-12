-- ═══════════════════════════════════════════════════════════════════════════
-- ENG-1 P3 proofs (migration 0029): the per-skill pathway is a development-only pathway that no
-- production setting, approval or baseline can activate; approved thresholds are representable.
-- Own fixtures (9b…). Run by scripts/db-test.sh after the other proofs.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

create or replace function pd_must_fail(setup text, stmt text, label text, expect_error text) returns void language plpgsql as $$
  begin
    begin
      if setup is not null then execute setup; end if;
      execute stmt;
      set constraints all immediate;
    exception when others then
      if SQLERRM !~ expect_error then raise exception 'FAIL  %  — refused for the WRONG reason: %', label, SQLERRM; end if;
      raise notice 'PASS  %  (refused: %)', label, replace(SQLERRM, E'\n', ' ');
      return;
    end;
    raise exception 'FAIL  %  — ACCEPTED', label;
  end $$;
create or replace function pd_ok(setup text, stmt text, label text) returns void language plpgsql as $$
  begin
    begin
      if setup is not null then execute setup; end if;
      execute stmt;
      set constraints all immediate;
      raise notice 'PASS  %  (accepted)', label;
      raise exception 'pd_rollback';
    exception when others then
      if SQLERRM = 'pd_rollback' then return; end if;
      raise exception 'FAIL  %  — refused: %', label, SQLERRM;
    end;
  end $$;
alter function pd_must_fail(text, text, text, text) security invoker;
alter function pd_ok(text, text, text) security invoker;

-- ─────────────────────────────── the development seal ───────────────────────────────
insert into verification_policy (id, key, version, description_en, assessment_scope)
  values ('9b000000-0000-4000-8000-0000000000f1', 'pd_proof', 1, 'ENG-1 P3 proof: a per_skill draft', 'per_skill');
select pd_ok($$select set_config('naqla.config_actor', 'p3 proof', true), set_config('naqla.config_reason', 'opt-in proof', true), set_config('naqla.per_skill_dev_activation', 'on', true)$$,
  $$update verification_policy set activation = 'development_only' where id = '9b000000-0000-4000-8000-0000000000f1'$$,
  'P3: WITH the explicit opt-in, outside production, a per_skill draft may become development_only (controlled testing)');
select pd_must_fail($$select set_config('naqla.config_actor', 'p3 proof', true), set_config('naqla.config_reason', 'no opt-in', true)$$,
  $$update verification_policy set activation = 'development_only' where id = '9b000000-0000-4000-8000-0000000000f1'$$,
  'P3: without the opt-in it cannot', 'per_skill_dev_activation');
select pd_must_fail($$select set_config('naqla.config_actor', 'p3 proof', true), set_config('naqla.config_reason', 'prod', true), set_config('naqla.per_skill_dev_activation', 'on', true), set_config('naqla.production', 'on', true)$$,
  $$update verification_policy set activation = 'development_only' where id = '9b000000-0000-4000-8000-0000000000f1'$$,
  'P3: in production it cannot, even with the opt-in', 'production');
select pd_must_fail($$select set_config('naqla.config_actor', 'p3 proof', true), set_config('naqla.config_reason', 'prod', true), set_config('naqla.per_skill_dev_activation', 'on', true)$$,
  $$update verification_policy set review_status = 'approved', approved_by = gen_random_uuid(), approved_at = now() where id = '9b000000-0000-4000-8000-0000000000f1'$$,
  'P3: a per_skill policy can never be APPROVED (opt-in irrelevant)', 'per_skill_development_only');
select pd_must_fail($$select set_config('naqla.config_actor', 'p3 proof', true), set_config('naqla.config_reason', 'prod', true), set_config('naqla.per_skill_dev_activation', 'on', true)$$,
  $$update verification_policy set review_status = 'published', approved_by = gen_random_uuid(), approved_at = now() where id = '9b000000-0000-4000-8000-0000000000f1'$$,
  'P3: … nor PUBLISHED', 'per_skill_development_only');
select pd_must_fail($$select set_config('naqla.config_actor', 'p3 proof', true), set_config('naqla.config_reason', 'prod', true), set_config('naqla.per_skill_dev_activation', 'on', true)$$,
  $$insert into verification_policy (key, version, description_en, assessment_scope, activation, review_status, approved_by, approved_at) values ('pd_proof', 2, 'x', 'per_skill', 'production_active', 'approved', gen_random_uuid(), now())$$,
  'P3: … nor PRODUCTION_ACTIVE', 'per_skill_development_only');
select pd_must_fail($$select set_config('naqla.config_actor', 'p3 proof', true), set_config('naqla.config_reason', 'prod', true), set_config('naqla.per_skill_dev_activation', 'on', true)$$,
  $$insert into verification_policy (key, version, description_en, assessment_scope, activation, baseline_of) values ('pd_proof', 3, 'x', 'per_skill', 'legacy_baseline', 'x')$$,
  'P3: … nor a LEGACY BASELINE', 'per_skill_development_only|baseline');
select pd_must_fail($$select set_config('naqla.config_actor', 'p3 proof', true), set_config('naqla.config_reason', 'x', true), set_config('naqla.per_skill_dev_activation', 'on', true)$$,
  $$insert into verification_policy (key, version, description_en, assessment_scope, promotion_basis) values ('pd_proof', 4, 'x', 'per_skill', 'legacy_any_pass')$$,
  'P3: a per_skill policy never uses the legacy basis (declarations never earn a level)', 'per_skill_development_only');
select pd_must_fail(null, $$insert into verification_policy (key, version, description_en, assessment_scope, practiced_on_submission) values ('pd_proof', 5, 'x', 'per_skill', true)$$,
  'P3: a per_skill policy never promotes on submission', 'per_skill_development_only');
select pd_must_fail(null, $$insert into verification_policy (key, version, description_en, assessment_scope, per_skill_evidence_derivation) values ('pd_proof', 6, 'x', 'per_skill', true)$$,
  'P3: H6 stays excluded', 'excludes_h6');
do $$ begin
  if exists (select 1 from verification_policy where assessment_scope = 'per_skill' and activation <> 'inactive') then
    raise exception 'FAIL  P3: no per_skill policy is active on a fresh database';
  end if;
  raise notice 'PASS  P3: no per_skill policy is active on a fresh database (the migration activates nothing)';
end $$;

-- ─────────────────────────────── threshold representability (O-3) ───────────────────────────────
insert into skill (id, slug, label_ar, label_en, provenance_class, provenance_source) values
  ('9b000000-0000-4000-8000-000000000011', 'pd-html', 'h', 'h', 'curated', 'p3 proof');
insert into activity_spec (id, slug, version, status, title_ar, ai_usage_mode, spec)
  values ('9b000000-0000-4000-8000-000000000021', 'pd-act', '1.0.0', 'draft', 'نشاط', 'ai_assisted', '{}'::jsonb);
-- A non-demo draft rubric whose values a (fixture) SME approved: the precondition of any approved threshold (OPEN-043).
insert into rubric_version (id, activity_spec_id, version, status, criteria, is_demo_fixture, values_approved_by, values_approved_by_label, values_approved_at, values_approval_reason)
  values ('9b000000-0000-4000-8000-000000000031', '9b000000-0000-4000-8000-000000000021', 'pd@1', 'draft', '[]'::jsonb, false,
          gen_random_uuid(), 'proof SME', now(), 'P3 representability proof (fixture, not a professional value)');
create or replace function pd_crit(id_suffix text, threshold numeric, status text, max int) returns text language sql as $$
  select format($f$insert into rubric_criterion (id, rubric_version_id, key, name_ar, name_en, dimension, linked_skill_id, source, weight, max_score, threshold_for_skill, threshold_status,
                    evaluator_type, human_review_required, description_ar, description_en, expected_evidence_ar, expected_evidence_en, rationale_when_met_ar, rationale_when_unmet_ar)
                  values ('9b000000-0000-4000-8000-0000000001%s', '9b000000-0000-4000-8000-000000000031', 'k%s', 'n', 'n', (select enum_range(null::rubric_dimension))[1],
                          '9b000000-0000-4000-8000-000000000011', 'activity', 1, %s, %s, %L, 'human', true, 'd', 'd', 'e', 'e', 'm', 'u')$f$,
                id_suffix, id_suffix, max, coalesce(threshold::text, 'null'), status)
$$;
create or replace function pd_levels(id_suffix text, scores int[]) returns text language sql as $$
  select string_agg(format($f$insert into rubric_criterion_level (criterion_id, level_key, score, descriptor_ar, descriptor_en, observable_evidence_en) values ('9b000000-0000-4000-8000-0000000001%s', 'l%s', %s, 'd', 'd', 'o')$f$, id_suffix, s, s), '; ')
    from unnest(scores) s
$$;
select pd_ok(null, pd_crit('01', 0.5, 'approved', 2) || '; ' || pd_levels('01', array[0,1,2]), 'O-3: an approved 0.5 of max 2 (score 1, a level) is accepted');
select pd_ok(null, pd_crit('02', 1.0, 'approved', 1) || '; ' || pd_levels('02', array[0,1]), 'O-3: an approved 1.0 of max 1 is accepted');
select pd_must_fail(null, pd_crit('03', 0.75, 'approved', 2) || '; ' || pd_levels('03', array[0,1,2]), 'O-3: an approved 0.75 of max 2 (score 1.5) is refused', 'cannot represent');
select pd_must_fail(null, pd_crit('04', 0.5, 'approved', 4) || '; ' || pd_levels('04', array[0,1,4]), 'O-3: an approved 0.5 of max 4 whose levels lack a 2 is refused', 'not one of its scoring levels');
select pd_ok(null, pd_crit('05', 0.75, 'proposed', 2), 'O-3: a PROPOSED value is stored as written (nothing is approved, invented or rewritten)');
select pd_must_fail(pd_crit('06', 0.75, 'proposed', 2), $$update rubric_criterion set threshold_status = 'approved' where id = '9b000000-0000-4000-8000-000000000106'$$,
  'O-3: approving an unrepresentable proposed value is refused', 'cannot represent');
