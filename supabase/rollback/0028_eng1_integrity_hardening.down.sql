-- Rollback of 0028. Restores the pre-0028 privileges and policies and removes the two guards. No data is touched.
-- WARNING: rolling back reopens direct client writes of claimed skills/artifacts/submissions (bypassing the
-- activity mapping and the D-118 platform-only namespaces) and lets an approved/active policy enable
-- submission-based promotion again.
drop trigger if exists submission_claimed_skill_guard_trg on submission_claimed_skill;
drop function if exists submission_claimed_skill_guard();
grant insert, update, delete on submission, submission_artifact, submission_claimed_skill to authenticated;
drop policy if exists submission_insert_own on submission;
create policy submission_insert_own on submission for insert to authenticated with check (user_id = auth.uid());
drop policy if exists submission_artifact_insert_own on submission_artifact;
create policy submission_artifact_insert_own on submission_artifact for insert to authenticated with check (user_id = auth.uid());
drop policy if exists submission_claimed_skill_insert_own on submission_claimed_skill;
create policy submission_claimed_skill_insert_own on submission_claimed_skill for insert to authenticated with check (user_id = auth.uid());
alter table verification_policy drop constraint if exists verification_policy_no_submission_promotion;
