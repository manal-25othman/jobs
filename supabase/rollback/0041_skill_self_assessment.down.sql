-- Rollback of 0041. Refuses while self-assessments exist: they are the graduate's own history and are never deleted
-- by a rollback.
do $$
begin
  if exists (select 1 from skill_self_assessment) then raise exception '0041 rollback refused: self-assessments exist (user history is never deleted by a rollback)'; end if;
end $$;
drop table if exists skill_self_assessment;
drop function if exists skill_self_assessment_guard();
