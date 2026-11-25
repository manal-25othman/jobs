-- ═══════════════════════════════════════════════════════════════════════════
-- Phase B package 2 proofs (migration 0040): a learning resource reaches a graduate only once verified.
-- Own fixtures (b2…). RLS proofs run as `authenticated`, never as postgres or service_role. Run by scripts/db-test.sh.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

create or replace function lr_must_fail(stmt text, label text, expect_error text) returns void language plpgsql as $$
  begin
    begin execute stmt;
    exception when others then
      if SQLERRM !~ expect_error then raise exception 'FAIL  %  — refused for the WRONG reason: %', label, SQLERRM; end if;
      raise notice 'PASS  %  (refused: %)', label, replace(SQLERRM, E'\n', ' '); return;
    end;
    raise exception 'FAIL  %  — ACCEPTED', label;
  end $$;

do $$ begin
  if exists (select 1 from learning_resource where duration_minutes is not null and duration_basis is null and review_status in ('draft','curated','needs_revision','rejected')) then
    raise exception 'FAIL  0040: a draft resource still carries a duration with no stated basis'; end if;
  raise notice 'PASS  0040: draft resources carry no unsupported duration';
end $$;

insert into skill (id, slug, label_ar, label_en, provenance_class, provenance_source) values ('b2000000-0000-4000-8000-000000000011', 'lr-proof-skill', 'م', 'm', 'curated', '0040 proof');

select lr_must_fail($$insert into learning_resource (skill_id, title, url, provenance_class, provenance_source, quality_status, link_check, last_checked)
  values ('b2000000-0000-4000-8000-000000000011', 'x', 'https://example.org/a', 'curated', '0040 proof', 'approved', 'search_index', '2026-11-25')$$,
  '0040: a resource seen only in a search index cannot be approved', 'verified_needs_direct_check');
select lr_must_fail($$insert into learning_resource (skill_id, title, url, provenance_class, provenance_source, quality_status, link_check, last_checked)
  values ('b2000000-0000-4000-8000-000000000011', 'x', 'https://example.org/a', 'curated', '0040 proof', 'sme_reviewed', 'direct', '2026-11-25')$$,
  '0040: a resource whose usage terms were not checked cannot be reviewed', 'verified_needs_direct_check');
select lr_must_fail($$insert into learning_resource (skill_id, title, provenance_class, provenance_source, duration_minutes)
  values ('b2000000-0000-4000-8000-000000000011', 'x', 'curated', '0040 proof', 60)$$,
  '0040: a duration needs a stated basis', 'duration_has_basis');

insert into learning_resource (id, code, skill_id, title, url, provenance_class, provenance_source, quality_status, review_status, link_check, last_checked, usage_terms_checked, usage_terms_note, is_demo_fixture) values
  ('b2000000-0000-4000-8000-000000000021', 'lr_proof_verified', 'b2000000-0000-4000-8000-000000000011', 'verified', 'https://example.org/v', 'curated', '0040 proof', 'approved', 'curated', 'direct', '2026-11-25', '2026-11-25', 'CC BY 4.0 (proof)', true),
  ('b2000000-0000-4000-8000-000000000022', 'lr_proof_candidate', 'b2000000-0000-4000-8000-000000000011', 'candidate', 'https://example.org/c', 'curated', '0040 proof', 'unverified', 'draft', 'search_index', null, null, null, true),
  ('b2000000-0000-4000-8000-000000000023', 'lr_proof_published_unverified', 'b2000000-0000-4000-8000-000000000011', 'published but unverified', 'https://example.org/p', 'curated', '0040 proof', 'unverified', 'curated', 'search_index', null, null, null, true);
update learning_resource set review_status = 'published' where id in ('b2000000-0000-4000-8000-000000000021', 'b2000000-0000-4000-8000-000000000023');  -- the DEMO shortcut (0007)

begin;
select set_config('naqla.config_actor', 'proof', true), set_config('naqla.config_reason', '0040 proof: demo content shown', true);
update platform_deployment set demo_content_visible = true;
commit;

set role authenticated;
set request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000001';
do $$ begin
  if not exists (select 1 from learning_resource where id = 'b2000000-0000-4000-8000-000000000021') then raise exception 'FAIL  0040 RLS: a graduate cannot read a verified published resource'; end if;
  if exists (select 1 from learning_resource where id = 'b2000000-0000-4000-8000-000000000022') then raise exception 'FAIL  0040 RLS: a graduate reads an unverified DEMO candidate although demo content is shown'; end if;
  if exists (select 1 from learning_resource where id = 'b2000000-0000-4000-8000-000000000023') then raise exception 'FAIL  0040 RLS: a graduate reads a published but unverified resource'; end if;
  if exists (select 1 from learning_resource where quality_status = 'unverified') then raise exception 'FAIL  0040 RLS: a graduate reads some unverified resource'; end if;
  raise notice 'PASS  0040 RLS: a graduate reads a verified published resource, and no unverified one (candidate, demo or published)';
end $$;
reset role;

do $$ begin
  if not learning_resource_verified('approved', 'published', 'https://x', 'direct', '2026-11-25', '2026-11-25') then raise exception 'FAIL  0040: the verified rule refuses a fully verified row'; end if;
  if learning_resource_verified('approved', 'approved', 'https://x', 'direct', '2026-11-25', '2026-11-25') then raise exception 'FAIL  0040: an unpublished row counted as verified'; end if;
  raise notice 'PASS  0040: learning_resource_verified needs publication, a direct link check and checked usage terms';
end $$;

-- Fixtures stay (content rows are never deleted); they are named lr_proof_*.
drop function lr_must_fail(text, text, text);
