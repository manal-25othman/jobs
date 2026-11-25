-- Rollback of 0038. Drafts are unsent work in progress, never evidence or history; removing the table removes only
-- that. Refuses while drafts exist so no graduate's unsent work is dropped silently.
do $$
begin
  if exists (select 1 from project_draft) then raise exception '0038 rollback refused: graduates have unsent drafts (FR-U-025)'; end if;
end $$;
drop table if exists project_draft;
drop function if exists project_draft_guard();
