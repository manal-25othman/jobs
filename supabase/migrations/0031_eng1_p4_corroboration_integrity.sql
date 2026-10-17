-- ═══════════════════════════════════════════════════════════════════════════
-- 0031 — ENG-1 P4: corroborating-evidence integrity safeguards (PO decision "Proceed with Corroborating Evidence,
-- subject to integrity safeguards"). Development-only pathway; nothing here activates anything.
--
-- 1. evidence.evidence_role ('primary' | 'corroborating', default 'primary'). Every existing row is primary (the
--    column default; no row is rewritten). Set at insert, immutable for every role. A corroborating row:
--      - rests on a claimed, met, independently verified skill assessment with no proposal (condition 2/3);
--      - is written only while the skill's claim stands at that assessment's own level on STANDING primary evidence
--        (otherwise the path is D-077 re-establishment, not corroboration);
--      - is never written when naqla.production = 'on' (condition 9);
--      - is refused when it would duplicate any earlier evidence of the same user and skill, standing or withdrawn
--        (condition 5): the same assessment event (evaluation result), the same submission (re-evaluation), the same
--        activity (repeat / resubmission), the same non-null variant family, a shared learner upload (platform
--        starter files excluded) or a shared normalized text deliverable (>= 40 characters).
--        evidence_corroboration_conflict() names the conflict; the writer calls the same function first.
-- 2. Corroborating evidence never carries a level or a claim (conditions 1, 7, 8):
--      - only an `evidence_corroborated` decision may cite it, and that decision must cite corroborating evidence;
--      - it can never be a claim's primary evidence;
--      - it can never back a professional asset (asset_evidence) or be cited by an agent proposal (CV / LinkedIn).
-- 3. Withdrawal is unchanged (condition 6): the row stays, `withdrawn_at` ends its standing.
--
-- Historical decisions, the SRS, SME content and production policies are untouched (condition 10).
-- Rollback: supabase/rollback/0031_eng1_p4_corroboration_integrity.down.sql (refuses while corroborating evidence exists).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────── 1. evidence role ───────────────────────────────
alter table evidence
  add column evidence_role text not null default 'primary',
  add constraint evidence_role_check check (evidence_role in ('primary', 'corroborating')),
  add constraint evidence_corroborating_needs_assessment check (evidence_role = 'primary' or skill_assessment_id is not null);
comment on column evidence.evidence_role is
  'ENG-1 P4 (0031): primary = evidence a level rests on (every legacy row); corroborating = an additional, independent, '
  'non-promotional record at an existing level. Corroborating evidence never sets a level, a claim''s primary evidence, '
  'a professional asset or a CV/LinkedIn claim; only the EXT-2 readiness rule may count it. Set at insert; immutable.';

-- Mirrors normalizedTextHash in apps/api/src/readiness/evidence-facts.ts (NFKC, lower case, collapsed whitespace, >= 40 chars).
create or replace function evidence_normalized_text_hash(t text) returns text
  language sql immutable as $$
    select case when char_length(n) < 40 then null else encode(sha256(convert_to(n, 'UTF8')), 'hex') end
      from (select btrim(regexp_replace(lower(normalize(t, NFKC)), '\s+', ' ', 'g')) as n) x
  $$;

-- Null = no conflict. Otherwise a short code naming why the new result's evidence would duplicate earlier evidence of
-- the same user and canonical skill (standing OR withdrawn: a withdrawal never makes a repeat independent).
create or replace function evidence_corroboration_conflict(p_user uuid, p_skill uuid, p_result uuid) returns text
  language plpgsql stable as $$
  declare cand record; hit text;
  begin
    select r.id, r.submission_id, p.activity_spec_id, a.variant_family into cand
      from evaluation_result r join submission s on s.id = r.submission_id join project p on p.id = s.project_id
      left join activity_spec a on a.id = p.activity_spec_id
     where r.id = p_result and s.user_id = p_user;
    if cand.id is null or cand.activity_spec_id is null then return 'unresolvable_task'; end if;

    with prior as (
      select e.id, e.evaluation_result_id as result_id, r.submission_id, p.activity_spec_id, a.variant_family
        from evidence e
        left join evaluation_result r on r.id = e.evaluation_result_id
        left join submission s on s.id = r.submission_id
        left join project p on p.id = coalesce(s.project_id, e.project_id)
        left join activity_spec a on a.id = p.activity_spec_id
       where e.user_id = p_user and canonical_skill_id(e.skill_id) = canonical_skill_id(p_skill))
    select case
             when bool_or(result_id = cand.id) then 'same_assessment_event'
             when bool_or(submission_id = cand.submission_id) then 'same_submission'
             when bool_or(activity_spec_id = cand.activity_spec_id) then 'same_activity'
             when bool_or(cand.variant_family is not null and variant_family = cand.variant_family) then 'same_variant_family'
           end into hit
      from prior;
    if hit is not null then return hit; end if;

    -- Learner artifacts shared with any earlier evidence's submission. Platform starter files are never a conflict.
    if exists (
      select 1
        from submission_artifact na join upload nu on nu.id = na.upload_id and nu.user_id = na.user_id
        join submission_artifact pa on pa.user_id = na.user_id and pa.submission_id <> na.submission_id
        join upload pu on pu.id = pa.upload_id and pu.user_id = pa.user_id and pu.checksum_sha256 = nu.checksum_sha256
       where na.submission_id = cand.submission_id and na.user_id = p_user and nu.checksum_sha256 is not null
         and pa.submission_id in (select r.submission_id from evidence e join evaluation_result r on r.id = e.evaluation_result_id
                                   where e.user_id = p_user and canonical_skill_id(e.skill_id) = canonical_skill_id(p_skill))
         and not exists (select 1 from activity_starter_checksum st join submission s2 on s2.id in (na.submission_id, pa.submission_id)
                           join project p2 on p2.id = s2.project_id
                          where st.activity_spec_id = p2.activity_spec_id and st.checksum_sha256 = nu.checksum_sha256)) then
      return 'reused_upload';
    end if;
    if exists (
      select 1
        from submission_artifact na
        join submission_artifact pa on pa.user_id = na.user_id and pa.submission_id <> na.submission_id and pa.kind = 'text' and pa.value_text is not null
       where na.submission_id = cand.submission_id and na.user_id = p_user and na.kind = 'text' and na.value_text is not null
         and evidence_normalized_text_hash(na.value_text) is not null
         and evidence_normalized_text_hash(na.value_text) = evidence_normalized_text_hash(pa.value_text)
         and pa.submission_id in (select r.submission_id from evidence e join evaluation_result r on r.id = e.evaluation_result_id
                                   where e.user_id = p_user and canonical_skill_id(e.skill_id) = canonical_skill_id(p_skill))) then
      return 'reused_text';
    end if;
    return null;
  end $$;
comment on function evidence_corroboration_conflict(uuid, uuid, uuid) is
  'ENG-1 P4 (0031, condition 5): why evidence from this evaluation result would duplicate earlier evidence of the same user and skill (null = independent).';

create or replace function evidence_role_guard() returns trigger
  language plpgsql as $$
  declare sa record; claim record; conflict text;
  begin
    if tg_op = 'UPDATE' then
      if new.evidence_role is distinct from old.evidence_role then
        raise exception 'evidence % is history: its role is set at insert and immutable', old.id using errcode = 'check_violation';
      end if;
      return new;
    end if;
    if new.evidence_role <> 'corroborating' then return new; end if;
    if coalesce(current_setting('naqla.production', true), '') = 'on' then
      raise exception 'corroborating evidence is a development-only pathway and is never written in production' using errcode = 'check_violation';
    end if;
    select claimed, outcome, basis_independently_verified, proposed_state, current_state into sa from skill_assessment where id = new.skill_assessment_id;
    if not found then
      raise exception 'evidence_corroborating_needs_assessment: corroborating evidence rests on a recorded skill assessment (never a declaration or an upload)' using errcode = 'check_violation';
    end if;
    if not sa.claimed or sa.outcome <> 'met' or not sa.basis_independently_verified or sa.proposed_state is not null then
      raise exception 'corroborating evidence requires a claimed, met, independently verified skill assessment with no proposal' using errcode = 'check_violation';
    end if;
    select sc.state, (e.id is not null and e.withdrawn_at is null and e.evidence_role = 'primary') as primary_standing into claim
      from skill_claim sc left join evidence e on e.id = sc.primary_evidence_id
     where sc.user_id = new.user_id and sc.skill_id = new.skill_id;
    if claim.state is null or claim.state <> sa.current_state or not claim.primary_standing then
      raise exception 'corroborating evidence is recorded only while the claim stands at the assessment''s level on standing primary evidence' using errcode = 'check_violation';
    end if;
    conflict := evidence_corroboration_conflict(new.user_id, new.skill_id, new.evaluation_result_id);
    if conflict is not null then
      raise exception 'corroborating evidence refused: it would duplicate earlier evidence of this skill (%)', conflict using errcode = 'check_violation';
    end if;
    return new;
  end $$;
create trigger evidence_role_guard_trg before insert or update on evidence
  for each row execute function evidence_role_guard();

-- ─────────────────────────────── 2. no level, no claim ───────────────────────────────
create or replace function verification_decision_evidence_role_consistent() returns trigger
  language plpgsql as $$
  declare role text;
  begin
    if new.evidence_id is null then return new; end if;
    select evidence_role into role from evidence where id = new.evidence_id;
    if new.decision = 'evidence_corroborated' and role is distinct from 'corroborating' then
      raise exception 'evidence_corroborated cites corroborating evidence only' using errcode = 'check_violation';
    end if;
    if new.decision <> 'evidence_corroborated' and role = 'corroborating' then
      raise exception 'corroborating evidence is cited only by an evidence_corroborated decision (it never supports a level)' using errcode = 'check_violation';
    end if;
    return new;
  end $$;
create trigger verification_decision_evidence_role_trg before insert on verification_decision
  for each row execute function verification_decision_evidence_role_consistent();

create or replace function skill_claim_primary_evidence_role() returns trigger
  language plpgsql as $$
  begin
    if new.primary_evidence_id is not null and (tg_op = 'INSERT' or new.primary_evidence_id is distinct from old.primary_evidence_id)
       and exists (select 1 from evidence where id = new.primary_evidence_id and evidence_role = 'corroborating') then
      raise exception 'corroborating evidence can never be a claim''s primary evidence' using errcode = 'check_violation';
    end if;
    return new;
  end $$;
create trigger skill_claim_primary_evidence_role_trg before insert or update on skill_claim
  for each row execute function skill_claim_primary_evidence_role();

create or replace function asset_evidence_role_guard() returns trigger
  language plpgsql as $$
  begin
    if exists (select 1 from evidence where id = new.evidence_id and evidence_role = 'corroborating') then
      raise exception 'corroborating evidence never backs a professional asset (no CV / LinkedIn claim policy covers it)' using errcode = 'check_violation';
    end if;
    return new;
  end $$;
create trigger asset_evidence_role_guard_trg before insert or update on asset_evidence
  for each row execute function asset_evidence_role_guard();

create or replace function agent_proposal_evidence_role_guard() returns trigger
  language plpgsql as $$
  begin
    if (tg_op = 'INSERT' or new.evidence_refs is distinct from old.evidence_refs)
       and exists (select 1 from evidence e where e.id::text = any(new.evidence_refs) and e.evidence_role = 'corroborating') then
      raise exception 'corroborating evidence is never cited by an agent proposal (no CV / LinkedIn claim policy covers it)' using errcode = 'check_violation';
    end if;
    return new;
  end $$;
create trigger agent_proposal_evidence_role_guard_trg before insert or update on agent_proposal
  for each row execute function agent_proposal_evidence_role_guard();
