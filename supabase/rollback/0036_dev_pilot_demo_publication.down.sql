-- Rollback of 0036. Refuses while pilot content is published (history is never rewritten by a rollback).
do $$
begin
  if exists (select 1 from activity_spec a join pilot_content_load l on l.target_role_id = a.target_role_id where a.status = 'published') then
    raise exception '0036 rollback refused: pilot content is published (D-136)';
  end if;
end $$;
drop trigger if exists activity_spec_pilot_demo_publication_trg on activity_spec;
drop trigger if exists rubric_version_pilot_demo_publication_trg on rubric_version;
drop function if exists pilot_demo_publication_guard();
drop function if exists pilot_role_of(uuid, uuid);
