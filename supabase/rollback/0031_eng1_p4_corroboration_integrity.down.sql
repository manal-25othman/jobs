-- Rollback of 0031. Refuses while any corroborating evidence exists (history is never deleted or re-labelled by a
-- rollback). No data is touched otherwise.
do $$
begin
  if exists (select 1 from evidence where evidence_role = 'corroborating') then
    raise exception '0031 rollback refused: corroborating evidence exists (history is never deleted by a rollback)';
  end if;
end $$;
drop trigger if exists agent_proposal_evidence_role_guard_trg on agent_proposal;
drop function if exists agent_proposal_evidence_role_guard();
drop trigger if exists asset_evidence_role_guard_trg on asset_evidence;
drop function if exists asset_evidence_role_guard();
drop trigger if exists skill_claim_primary_evidence_role_trg on skill_claim;
drop function if exists skill_claim_primary_evidence_role();
drop trigger if exists verification_decision_evidence_role_trg on verification_decision;
drop function if exists verification_decision_evidence_role_consistent();
drop trigger if exists evidence_role_guard_trg on evidence;
drop function if exists evidence_role_guard();
drop function if exists evidence_corroboration_conflict(uuid, uuid, uuid);
drop function if exists evidence_normalized_text_hash(text);
alter table evidence drop constraint if exists evidence_corroborating_needs_assessment, drop constraint if exists evidence_role_check, drop column if exists evidence_role;
