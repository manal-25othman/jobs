-- ═══════════════════════════════════════════════════════════════════════════
-- 0028 — ENG-1 P3 gate, Phase A: remaining integrity gaps at the database boundary.
--
-- A1. Submission-based promotion (`practiced_on_submission`, D-118 compatibility switch) can
--     never be part of an approved or published verification policy, nor of a policy that is
--     active for real users (production_active, legacy_baseline). It remains possible only on
--     inactive or development_only drafts (the pre-0023 history row default@1 and the e2e
--     harness's development-only compatibility policy).
--     History is preserved: the constraint is added NOT VALID (no existing row is rewritten or
--     rejected) and validated only when no historical row violates it; any future INSERT or
--     UPDATE of a row — including an activation or an approval — must satisfy it.
--
-- A3. Claimed skills are an attribution input (ENG-1 P0: claimed ∩ activity primary ∩
--     measured). Before 0028 a client could insert `submission_claimed_skill` rows directly
--     (policy `submission_claimed_skill_insert_own`), bypassing the API's activity-mapping check,
--     including on a submission that had already been evaluated (the human-review finalize
--     re-reads the claimed skills). The same was true of `submission` and `submission_artifact`
--     (a direct insert bypassed the D-118 platform-only artifact namespaces).
--       1. Client roles (authenticated, anon) lose every write on submission, submission_artifact
--          and submission_claimed_skill; the dormant insert policies are dropped. The API writes
--          these tables only as the trusted server (verified: no client-role writer exists).
--       2. For EVERY role, a claimed skill must: belong to the submission's owner; be an active
--          (canonical) skill; on a platform activity, be one of the activity's mapped skills;
--          and be recorded before the submission is evaluated. A claimed skill is never updated;
--          it is never removed from an evaluated submission (account/submission deletion still
--          cascades).
--
-- Nothing is rewritten. Historical claimed skills are not re-checked (a notice reports any
-- that would not be accepted today, for audit).
-- Rollback: supabase/rollback/0028_eng1_integrity_hardening.down.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────── A1 ───────────────────────────────
do $$
declare n int; list text;
begin
  select count(*), string_agg(key || '@' || version || ' (' || review_status || ', ' || activation || ')', ', ')
    into n, list
    from verification_policy
   where practiced_on_submission
     and (review_status in ('approved', 'published') or activation not in ('inactive', 'development_only'));
  if n > 0 then
    raise notice '0028: % historical verification policy row(s) enable submission-based promotion while validated or active: %. They are preserved unchanged; the constraint stays NOT VALID and any change to them must disable the switch first.', n, list;
  end if;
end $$;

alter table verification_policy add constraint verification_policy_no_submission_promotion
  check (not practiced_on_submission
         or (review_status not in ('approved', 'published') and activation in ('inactive', 'development_only')))
  not valid;

do $$
begin
  if not exists (select 1 from verification_policy
                  where practiced_on_submission
                    and (review_status in ('approved', 'published') or activation not in ('inactive', 'development_only'))) then
    alter table verification_policy validate constraint verification_policy_no_submission_promotion;
  end if;
end $$;

comment on constraint verification_policy_no_submission_promotion on verification_policy is
  'ENG-1 Phase A (D-118): submission-based promotion is never approved, published or active for real users; only inactive or development_only drafts may carry it.';

-- ─────────────────────────────── A3 ───────────────────────────────
revoke insert, update, delete on submission, submission_artifact, submission_claimed_skill from authenticated, anon;
drop policy if exists submission_insert_own on submission;
drop policy if exists submission_artifact_insert_own on submission_artifact;
drop policy if exists submission_claimed_skill_insert_own on submission_claimed_skill;

do $$
declare n int;
begin
  select count(*) into n
    from submission_claimed_skill cs
    join submission s on s.id = cs.submission_id
    join project p on p.id = s.project_id
   where p.activity_spec_id is not null
     and not exists (select 1 from activity_skill a where a.activity_spec_id = p.activity_spec_id and a.skill_id = cs.skill_id);
  if n > 0 then
    raise notice '0028: % historical claimed skill(s) are outside their activity''s mapping; preserved unchanged (ENG-1 P0 attribution already withholds promotion for them).', n;
  end if;
end $$;

create or replace function submission_claimed_skill_guard() returns trigger
  language plpgsql as $$
  declare v_owner uuid; v_activity uuid; v_status text;
  begin
    if tg_op = 'UPDATE' then
      raise exception 'claimed skill (%, %) is history: a claimed skill is never changed', old.submission_id, old.skill_id
        using errcode = 'check_violation';
    end if;
    if tg_op = 'DELETE' then
      -- pg_trigger_depth() > 1: the delete cascades from the submission or the account; that path is unchanged.
      if pg_trigger_depth() = 1 and exists (select 1 from evaluation where submission_id = old.submission_id) then
        raise exception 'claimed skill (%, %) belongs to an evaluated submission and is history; it cannot be removed', old.submission_id, old.skill_id
          using errcode = 'check_violation';
      end if;
      return old;
    end if;
    select s.user_id, p.activity_spec_id into v_owner, v_activity
      from submission s join project p on p.id = s.project_id where s.id = new.submission_id;
    if not found then
      raise exception 'claimed skill: submission % does not exist', new.submission_id using errcode = 'foreign_key_violation';
    end if;
    if new.user_id is distinct from v_owner then
      raise exception 'claimed skill: a skill is claimed only by the owner of the submission' using errcode = 'check_violation';
    end if;
    select status into v_status from skill where id = new.skill_id;
    if v_status is distinct from 'active' then
      raise exception 'claimed skill %: only an active (canonical) skill can be claimed', new.skill_id using errcode = 'check_violation';
    end if;
    if v_activity is not null
       and not exists (select 1 from activity_skill where activity_spec_id = v_activity and skill_id = new.skill_id) then
      raise exception '[skill_not_mapped_to_activity] skill % is not a skill of this activity', new.skill_id using errcode = 'check_violation';
    end if;
    if exists (select 1 from evaluation where submission_id = new.submission_id) then
      raise exception 'claimed skill: submission % has already been evaluated; its claimed skills are fixed', new.submission_id
        using errcode = 'check_violation';
    end if;
    return new;
  end $$;

comment on function submission_claimed_skill_guard() is
  'ENG-1 Phase A: a claimed skill (an attribution input) is the owner''s, active, mapped to the activity, recorded before evaluation, and never changed afterwards — for every role.';

create trigger submission_claimed_skill_guard_trg before insert or update or delete on submission_claimed_skill
  for each row execute function submission_claimed_skill_guard();
