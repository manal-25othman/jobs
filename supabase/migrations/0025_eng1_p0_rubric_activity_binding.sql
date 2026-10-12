-- ═══════════════════════════════════════════════════════════════════════════
-- 0025 — ENG-1 P0: bind each published rubric version to the activity version
--        it was published for (F-8), so an evaluation can be pinned to it.
--
-- Additive only:
--   * one nullable column on rubric_version;
--   * one BEFORE trigger that sets it at the moment a version BECOMES published
--     (insert as published, or a status transition into published) and refuses
--     to change it afterwards.
-- Existing rows are NOT modified: a version published before this migration
-- keeps `activity_spec_version = null` and is handled by the explicit legacy
-- rule in the domain (`resolveRubricVersion`): accepted only when the activity
-- has exactly one published version and the submission is on the activity's
-- current version; otherwise the evaluation is refused, never guessed.
--
-- Rollback: supabase/rollback/0025_eng1_p0_rubric_activity_binding.down.sql
-- ═══════════════════════════════════════════════════════════════════════════

alter table rubric_version add column activity_spec_version text;

comment on column rubric_version.activity_spec_version is
  'ENG-1 P0: the activity_spec.version this rubric version was published for. Set by trigger on publication; immutable once set. Null only for versions published before migration 0025 (legacy).';

create or replace function rubric_version_bind_activity_version() returns trigger
  language plpgsql as $$
  begin
    if tg_op = 'UPDATE' and old.activity_spec_version is not null
       and new.activity_spec_version is distinct from old.activity_spec_version then
      raise exception 'rubric_version % is bound to activity version %; the binding is immutable', old.id, old.activity_spec_version;
    end if;
    -- Bind exactly when the version becomes published; a legacy row that is merely updated is never re-bound.
    if new.status = 'published' and new.activity_spec_version is null
       and (tg_op = 'INSERT' or old.status is distinct from 'published') then
      select a.version into new.activity_spec_version from activity_spec a where a.id = new.activity_spec_id;
      if new.activity_spec_version is null then
        raise exception 'rubric_version % cannot be published: its activity has no version', new.id;
      end if;
    end if;
    return new;
  end;
  $$;

create trigger rubric_version_bind_activity_version_trg
  before insert or update on rubric_version
  for each row execute function rubric_version_bind_activity_version();

-- Lookup used by the evaluation resolver (activity → its published versions).
create index if not exists rubric_version_activity_published_idx
  on rubric_version (activity_spec_id, activity_spec_version) where status = 'published';
