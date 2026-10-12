-- Rollback of 0025 (ENG-1 P0). Removes the binding trigger, its function, the lookup index and the column.
-- The column holds only a value derived at publication (activity_spec.version at that moment); no other
-- record is touched. After rollback the evaluation service must also be rolled back (it reads the column).
-- 0026 must be rolled back first if it is applied.
drop trigger if exists rubric_version_bind_activity_version_trg on rubric_version;
drop function if exists rubric_version_bind_activity_version();
drop index if exists rubric_version_activity_published_idx;
alter table rubric_version drop column if exists activity_spec_version;
