-- Rollback of 0032. Restores the 0031 duplicate check (SQL text normalization) and drops the fingerprint table.
-- Fingerprints are derived data (recomputable by the writer from the immutable artifacts); no history is lost, and no
-- evidence, decision or corroborating row is touched. The whole rollback runs in one transaction (psql -1).
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
drop function if exists current_text_fingerprint_version();
drop trigger if exists artifact_text_fingerprint_guard_trg on artifact_text_fingerprint;
drop function if exists artifact_text_fingerprint_guard();
drop table if exists artifact_text_fingerprint;
