-- Rollback of 0034. Refuses while any professional classification or any schema-2 pack constraint set exists (history is
-- never deleted by a rollback). Restores the 0022 one-set-per-scope-level index. Run in one transaction (psql -1).
do $$
begin
  if exists (select 1 from skill_classification_set) then
    raise exception '0034 rollback refused: professional skill classifications exist (history is never deleted by a rollback)';
  end if;
  if exists (select 1 from pack_constraint_set where schema_version <> 1) then
    raise exception '0034 rollback refused: schema-2 pack constraint sets exist';
  end if;
end $$;
drop trigger if exists pack_constraint_schema_guard_trg on pack_constraint;
drop table if exists pack_constraint_v2;
drop function if exists pack_constraint_schema_guard();
drop trigger if exists pack_constraint_set_schema_frozen_trg on pack_constraint_set;
drop function if exists pack_constraint_set_schema_frozen();
drop index if exists pack_constraint_set_one_per_scope_level;
create unique index pack_constraint_set_one_per_scope_level on pack_constraint_set(coalesce(track_id, ''), activation) where activation <> 'inactive';
alter table pack_constraint_set drop constraint if exists pack_constraint_set_schema2_development_only, drop column if exists schema_version;
drop function if exists role_professional_class(uuid, uuid);
drop table if exists skill_classification;
drop table if exists skill_classification_set;
drop function if exists skill_classification_guard();
drop function if exists skill_classification_set_guard();
drop function if exists skill_classification_set_no_delete();
