-- Rollback of 0039. Refuses while materials exist: material rows are content history and are never deleted by a
-- rollback (their objects stay in storage; a projectless rollback would orphan them silently).
do $$
begin
  if exists (select 1 from activity_material) then raise exception '0039 rollback refused: activity materials exist (content is never deleted by a rollback)'; end if;
end $$;
drop trigger if exists project_activity_materials_guard_trg on project;
drop function if exists project_activity_materials_guard();
drop function if exists activity_materials_complete(uuid);
drop table if exists activity_material;
drop function if exists activity_material_guard();
alter table activity_input drop column if exists material_required;
