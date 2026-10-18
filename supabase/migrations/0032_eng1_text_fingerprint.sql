-- ═══════════════════════════════════════════════════════════════════════════
-- 0032 — ENG-1: one versioned text fingerprint for artifact reuse (PO "Post-P4 gate", Task A).
--
-- The 0031 duplicate check normalized text in SQL (lower / normalize / '\s'), while the EXT-2 reader normalized it in
-- JavaScript. PostgreSQL's lower() and regex classes follow the database collation and ctype; JavaScript follows Unicode.
-- So the two could disagree on unusual whitespace or casing, and one side could see a duplicate the other missed.
--
-- Fix: the database no longer normalizes text. One TypeScript definition (packages/domain/src/text-fingerprint.ts,
-- version `naqla-text-fp-v1`) computes the fingerprint. The per-skill writer stores it here before any duplicate check.
-- The database compares stored fingerprints of the CURRENT version only. EXT-2 uses the same stored fingerprints, or
-- the same function read-only when none is stored.
--
-- Fail closed: when an artifact cannot be compared, the check returns a conflict instead of "independent". That
-- covers a text deliverable without a current-version fingerprint, and a learner upload without a server-measured
-- checksum (`text_fingerprint_missing` / `upload_checksum_missing`). No corroborating evidence is then written.
-- Fingerprints are compared only within one learner (tenant isolation). They are never readable by a client.
--
-- No existing row is changed. Fingerprints are derived data, and the writer recomputes them on demand.
-- Rollback: supabase/rollback/0032_eng1_text_fingerprint.down.sql (restores the 0031 check).
-- ═══════════════════════════════════════════════════════════════════════════

create table artifact_text_fingerprint (
  submission_artifact_id uuid not null references submission_artifact(id) on delete restrict,
  fingerprint_version    text not null check (fingerprint_version ~ '^naqla-text-fp-v[0-9]+$'),
  user_id                uuid not null references app_user(id) on delete cascade,
  submission_id          uuid not null references submission(id) on delete cascade,
  -- Null when the normalized text is too short to be an artifact (an answer); never null for an artifact.
  fingerprint            text check (fingerprint ~ '^[0-9a-f]{64}$'),
  normalized_length      int not null check (normalized_length >= 0),
  -- The runtime's Unicode version when computed (audit only; the version above defines the semantics).
  runtime_unicode        text not null check (length(btrim(runtime_unicode)) > 0),
  created_at             timestamptz not null default now(),
  primary key (submission_artifact_id, fingerprint_version),
  constraint artifact_text_fingerprint_v1_threshold check (
    fingerprint_version <> 'naqla-text-fp-v1' or ((fingerprint is null) = (normalized_length < 40)))
);
create index artifact_text_fingerprint_lookup on artifact_text_fingerprint(user_id, fingerprint_version, fingerprint) where fingerprint is not null;
comment on table artifact_text_fingerprint is
  'ENG-1 (0032): versioned fingerprint of a text deliverable (packages/domain text-fingerprint.ts). Insert-only, service-only, '
  'compared within one learner only. Orthographic identity, never similarity.';
alter table artifact_text_fingerprint enable row level security;
alter table artifact_text_fingerprint force row level security;
revoke all on artifact_text_fingerprint from anon, authenticated;
grant select, insert on artifact_text_fingerprint to service_role;

create or replace function artifact_text_fingerprint_guard() returns trigger
  language plpgsql as $$
  declare a record;
  begin
    if tg_op <> 'INSERT' then
      raise exception 'a text fingerprint is derived history: it is never changed or deleted (a new version is a new row)' using errcode = 'check_violation';
    end if;
    select user_id, submission_id, kind::text as kind into a from submission_artifact where id = new.submission_artifact_id;
    if not found or a.kind <> 'text' then
      raise exception 'a text fingerprint belongs to a text deliverable' using errcode = 'check_violation';
    end if;
    if a.user_id <> new.user_id or a.submission_id <> new.submission_id then
      raise exception 'a text fingerprint carries its artifact''s own learner and submission' using errcode = 'check_violation';
    end if;
    return new;
  end $$;
create trigger artifact_text_fingerprint_guard_trg before insert or update or delete on artifact_text_fingerprint
  for each row execute function artifact_text_fingerprint_guard();

-- The current fingerprint version, in ONE place on the database side (asserted equal to TEXT_FINGERPRINT_VERSION by e2e).
create or replace function current_text_fingerprint_version() returns text language sql immutable as $$ select 'naqla-text-fp-v1'::text $$;

-- 0031's SQL normalizer is the source of the mismatch: removed.
-- (evidence_corroboration_conflict is redefined below without it.)
create or replace function evidence_corroboration_conflict(p_user uuid, p_skill uuid, p_result uuid) returns text
  language plpgsql stable as $$
  declare cand record; hit text; v text := current_text_fingerprint_version(); prior_subs uuid[]; all_subs uuid[];
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

    -- The submissions to compare: this one and those of every earlier evidence row of this learner and skill.
    prior_subs := array(select distinct r.submission_id from evidence e join evaluation_result r on r.id = e.evaluation_result_id
                         where e.user_id = p_user and canonical_skill_id(e.skill_id) = canonical_skill_id(p_skill)
                           and r.submission_id is not null and r.submission_id <> cand.submission_id);
    all_subs := prior_subs || cand.submission_id;

    -- Fail closed: an artifact that cannot be compared is an uncertain duplicate.
    if exists (select 1 from submission_artifact sa left join upload u on u.id = sa.upload_id and u.user_id = sa.user_id
                where sa.submission_id = any(all_subs) and sa.user_id = p_user and sa.upload_id is not null and u.checksum_sha256 is null) then
      return 'upload_checksum_missing';
    end if;
    if exists (select 1 from submission_artifact sa
                where sa.submission_id = any(all_subs) and sa.user_id = p_user and sa.kind = 'text' and sa.value_text is not null
                  and not exists (select 1 from artifact_text_fingerprint f where f.submission_artifact_id = sa.id and f.fingerprint_version = v)) then
      return 'text_fingerprint_missing';
    end if;

    -- Learner uploads shared with an earlier evidence's submission. Platform starter files are never a conflict.
    if exists (
      select 1
        from submission_artifact na join upload nu on nu.id = na.upload_id and nu.user_id = na.user_id
        join submission_artifact pa on pa.user_id = na.user_id and pa.submission_id = any(prior_subs)
        join upload pu on pu.id = pa.upload_id and pu.user_id = pa.user_id and pu.checksum_sha256 = nu.checksum_sha256
       where na.submission_id = cand.submission_id and na.user_id = p_user
         and not exists (select 1 from activity_starter_checksum st join submission s2 on s2.id in (na.submission_id, pa.submission_id)
                           join project p2 on p2.id = s2.project_id
                          where st.activity_spec_id = p2.activity_spec_id and st.checksum_sha256 = nu.checksum_sha256)) then
      return 'reused_upload';
    end if;
    -- Text deliverables: stored fingerprints of the current version only, within this learner only.
    if exists (
      select 1
        from artifact_text_fingerprint nf
        join artifact_text_fingerprint pf on pf.user_id = nf.user_id and pf.fingerprint_version = nf.fingerprint_version
                                          and pf.fingerprint = nf.fingerprint and pf.submission_id = any(prior_subs)
       where nf.submission_id = cand.submission_id and nf.user_id = p_user and nf.fingerprint_version = v and nf.fingerprint is not null) then
      return 'reused_text';
    end if;
    return null;
  end $$;
comment on function evidence_corroboration_conflict(uuid, uuid, uuid) is
  'ENG-1 P4 (0031, 0032): why evidence from this evaluation result would duplicate earlier evidence of the same user and skill (null = independent). '
  'Text is compared by stored versioned fingerprints only; an artifact that cannot be compared is a conflict (fail closed).';
drop function if exists evidence_normalized_text_hash(text);
