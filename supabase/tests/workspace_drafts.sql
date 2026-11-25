-- ═══════════════════════════════════════════════════════════════════════════
-- Phase B package 4 proofs (migration 0038, FR-U-025): a workspace draft is private, owned, references only the
-- owner's confirmed uploads, and is never evidence. Own fixtures (b4…). RLS proofs run as `authenticated`, never as
-- postgres or service_role. Run by scripts/db-test.sh.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

create or replace function wd_must_fail(stmt text, label text, expect_error text) returns void language plpgsql as $$
  begin
    begin execute stmt;
    exception when others then
      if SQLERRM !~ expect_error then raise exception 'FAIL  %  — refused for the WRONG reason: %', label, SQLERRM; end if;
      raise notice 'PASS  %  (refused: %)', label, replace(SQLERRM, E'\n', ' '); return;
    end;
    raise exception 'FAIL  %  — ACCEPTED', label;
  end $$;
grant execute on function wd_must_fail(text, text, text) to authenticated;

insert into app_user (id, display_name) values ('b4000000-0000-4000-8000-000000000001', 'draft owner (fixture)'), ('b4000000-0000-4000-8000-000000000002', 'other (fixture)');
insert into project (id, user_id, title, kind) values
  ('b4000000-0000-4000-8000-000000000011', 'b4000000-0000-4000-8000-000000000001', 'p', 'personal_project'),
  ('b4000000-0000-4000-8000-000000000012', 'b4000000-0000-4000-8000-000000000002', 'p', 'personal_project');
insert into upload (id, user_id, bucket, object_path, declared_name, content_type, declared_size, state, purpose, provenance_class, provenance_source, privacy_class, size_bytes, checksum_sha256, confirmed_at) values
  ('b4000000-0000-4000-8000-000000000021', 'b4000000-0000-4000-8000-000000000001', 'evidence', 'b4000000-0000-4000-8000-000000000001/a', 'a.js', 'text/javascript', 10, 'confirmed', 'submission_file', 'user_generated', 'fixture', 'private_never_shareable', 10, repeat('a', 64), now()),
  ('b4000000-0000-4000-8000-000000000022', 'b4000000-0000-4000-8000-000000000001', 'evidence', 'b4000000-0000-4000-8000-000000000001/b', 'b.js', 'text/javascript', 10, 'pending', 'submission_file', 'user_generated', 'fixture', 'private_never_shareable', 10, repeat('a', 64), now()),
  ('b4000000-0000-4000-8000-000000000023', 'b4000000-0000-4000-8000-000000000002', 'evidence', 'b4000000-0000-4000-8000-000000000002/c', 'c.js', 'text/javascript', 10, 'confirmed', 'submission_file', 'user_generated', 'fixture', 'private_never_shareable', 10, repeat('a', 64), now());

select wd_must_fail($$insert into project_draft (project_id, user_id) values ('b4000000-0000-4000-8000-000000000012', 'b4000000-0000-4000-8000-000000000001')$$,
  '0038: a draft belongs to the owner of its project', 'own project');
select wd_must_fail($$insert into project_draft (project_id, user_id, files) values ('b4000000-0000-4000-8000-000000000011', 'b4000000-0000-4000-8000-000000000001', '{"file.app_js": "b4000000-0000-4000-8000-000000000022"}')$$,
  '0038: a draft never references an unconfirmed upload', 'confirmed submission upload');
select wd_must_fail($$insert into project_draft (project_id, user_id, files) values ('b4000000-0000-4000-8000-000000000011', 'b4000000-0000-4000-8000-000000000001', '{"file.app_js": "b4000000-0000-4000-8000-000000000023"}')$$,
  '0038: a draft never references another user''s upload', 'confirmed submission upload');
select wd_must_fail($$insert into project_draft (project_id, user_id, texts) values ('b4000000-0000-4000-8000-000000000011', 'b4000000-0000-4000-8000-000000000001', '{"note": 5}')$$,
  '0038: draft texts are strings', 'must be a string');

do $$
declare ev_before bigint; items_before bigint; subs_before bigint;
begin
  select count(*) into ev_before from evidence; select count(*) into items_before from evidence_item; select count(*) into subs_before from submission;
  insert into project_draft (project_id, user_id, texts, files, skill_ids) values ('b4000000-0000-4000-8000-000000000011', 'b4000000-0000-4000-8000-000000000001',
    '{"note.decision": "مسودة"}', '{"file.app_js": "b4000000-0000-4000-8000-000000000021"}', '[]');
  update project_draft set texts = '{"note.decision": "مسودة ٢"}' where project_id = 'b4000000-0000-4000-8000-000000000011';
  if (select revision from project_draft where project_id = 'b4000000-0000-4000-8000-000000000011') <> 2 then raise exception 'FAIL  0038: revision is not advanced by the database'; end if;
  if (select count(*) from evidence) <> ev_before or (select count(*) from evidence_item) <> items_before or (select count(*) from submission) <> subs_before then
    raise exception 'FAIL  0038: saving a draft created evidence, an evidence item or a submission'; end if;
  raise notice 'PASS  0038: an owner''s draft with a confirmed upload is saved, its revision advances, and it creates no submission, evidence item or evidence';
end $$;
select wd_must_fail($$update project_draft set user_id = 'b4000000-0000-4000-8000-000000000002' where project_id = 'b4000000-0000-4000-8000-000000000011'$$,
  '0038: a draft never changes owner', 'own project|never changes owner');

-- RLS, as `authenticated`.
set role authenticated;
set request.jwt.claim.sub = 'b4000000-0000-4000-8000-000000000002';
do $$ begin
  if (select count(*) from project_draft) <> 0 then raise exception 'FAIL  0038 RLS: another user reads a draft'; end if;
  update project_draft set texts = '{}' where project_id = 'b4000000-0000-4000-8000-000000000011';
  if found then raise exception 'FAIL  0038 RLS: another user changed a draft'; end if;
  delete from project_draft where project_id = 'b4000000-0000-4000-8000-000000000011';
  if found then raise exception 'FAIL  0038 RLS: another user deleted a draft'; end if;
  raise notice 'PASS  0038 RLS: another user can neither read, change nor delete a draft';
end $$;
select wd_must_fail($$insert into project_draft (project_id, user_id) values ('b4000000-0000-4000-8000-000000000011', 'b4000000-0000-4000-8000-000000000001')$$,
  '0038 RLS: nobody writes a draft in another user''s name', 'row-level security|own project');
set request.jwt.claim.sub = 'b4000000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from project_draft) <> 1 then raise exception 'FAIL  0038 RLS: the owner cannot read their draft'; end if;
  raise notice 'PASS  0038 RLS: the owner reads their own draft';
end $$;
set role anon; set request.jwt.claim.sub = '';
do $$ begin
  begin perform 1 from project_draft; raise exception 'FAIL  0038: anon reads drafts';
  exception when insufficient_privilege then raise notice 'PASS  0038: anon has no access to drafts'; end;
end $$;
reset role;

delete from project_draft where project_id = 'b4000000-0000-4000-8000-000000000011';
drop function wd_must_fail(text, text, text);
