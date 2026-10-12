-- Rollback of 0027. Restores the pre-0027 privileges and removes the two guards. No data is touched.
-- WARNING: rolling back reopens O-2 (client rewrite of evidence attributes while withdrawing) and AP-1.
drop trigger if exists project_identity_client_immutable_trg on project;
drop function if exists project_identity_client_immutable();
drop trigger if exists evidence_history_immutable_trg on evidence;
drop function if exists evidence_history_immutable();
revoke update (withdrawn_at, withdrawn_reason) on evidence from authenticated;
grant insert, update, delete on evidence to authenticated;
