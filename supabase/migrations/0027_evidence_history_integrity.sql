-- ═══════════════════════════════════════════════════════════════════════════
-- 0027 — Evidence history integrity (O-2) and the project re-pointing path (AP-1).
--
-- O-2 (found during ENG-1 P0–P2, present since 0002): the owner's withdraw policy
-- `evidence_withdraw_own` checks only the owner and the withdrawal fields, so a client
-- could rewrite skill_id / confidence / provenance_source / … of their own evidence row
-- in the same UPDATE that withdraws it.
--
-- Fix, enforced at the database boundary (not in the API or the frontend):
--   1. Evidence history is immutable for EVERY role. The only change any role may make
--      is the withdrawal itself: withdrawn_at null → set, with a reason, once. A withdrawn
--      row cannot be un-withdrawn or have its reason rewritten. (The one trusted server
--      write, withdrawal.service, does exactly this; ENG-1's skill_assessment_id keeps its
--      own guard.) Deletion paths are unchanged (no client delete policy; account
--      deletion still cascades).
--   2. Column privileges: a client role may UPDATE only (withdrawn_at, withdrawn_reason)
--      and may not INSERT or DELETE evidence at all (no RLS policy ever allowed either;
--      this removes the latent table-level grant).
--
-- AP-1 (same review): `project_write_own` (ALL) let a client re-point their own project
-- to another activity, activity version or kind — the inputs that select the rubric
-- (ENG-1 P0 pinning) and the evidence it produces. For client roles these columns are now
-- immutable; titles, descriptions and status stay editable; trusted server code is unaffected.
--
-- Nothing is rewritten: existing rows are untouched; the triggers act only on future UPDATEs.
-- Rollback: supabase/rollback/0027_evidence_history_integrity.down.sql
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function evidence_history_immutable() returns trigger
  language plpgsql as $$
  begin
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.skill_id is distinct from old.skill_id
       or new.source_strength is distinct from old.source_strength
       or new.evaluation_result_id is distinct from old.evaluation_result_id
       or new.project_id is distinct from old.project_id
       or new.provenance_class is distinct from old.provenance_class
       or new.provenance_source is distinct from old.provenance_source
       or new.confidence is distinct from old.confidence
       or new.created_at is distinct from old.created_at then
      raise exception 'evidence % is history: only its withdrawal may be recorded (no other attribute changes)', old.id
        using errcode = 'check_violation';
    end if;
    if old.withdrawn_at is not null and (new.withdrawn_at is distinct from old.withdrawn_at or new.withdrawn_reason is distinct from old.withdrawn_reason) then
      raise exception 'evidence % is already withdrawn; a withdrawal is final and its reason is not rewritten', old.id
        using errcode = 'check_violation';
    end if;
    return new;
  end $$;

comment on function evidence_history_immutable() is
  'O-2: evidence rows are history. Any role may only record the withdrawal (null → set, once); every other attribute is immutable.';

create trigger evidence_history_immutable_trg before update on evidence
  for each row execute function evidence_history_immutable();

-- Column privileges: the client may touch only the withdrawal fields, and never insert or delete.
revoke insert, update, delete on evidence from authenticated;
grant update (withdrawn_at, withdrawn_reason) on evidence to authenticated;

-- AP-1: a client cannot re-point their own project to another activity, version or kind.
create or replace function project_identity_client_immutable() returns trigger
  language plpgsql as $$
  begin
    if current_user in ('authenticated', 'anon')
       and (new.user_id is distinct from old.user_id
            or new.kind is distinct from old.kind
            or new.activity_spec_id is distinct from old.activity_spec_id
            or new.activity_spec_version is distinct from old.activity_spec_version) then
      raise exception 'project %: its owner, kind, activity and activity version are set when it is created and cannot be changed by a client', old.id
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end $$;

comment on function project_identity_client_immutable() is
  'AP-1: the inputs that select a rubric (activity, activity version, kind) and the owner are immutable for client roles.';

create trigger project_identity_client_immutable_trg before update on project
  for each row execute function project_identity_client_immutable();
