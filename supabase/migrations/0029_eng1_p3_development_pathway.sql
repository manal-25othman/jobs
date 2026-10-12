-- ═══════════════════════════════════════════════════════════════════════════
-- 0029 — ENG-1 P3: the per-skill assessment pathway as an INACTIVE development pathway.
--
-- 1. The P2 seal (`verification_policy_per_skill_sealed`: per_skill ⇒ inactive) is replaced by a
--    narrower development seal. A per_skill policy may be:
--       inactive              (as before), or
--       development_only      — only as an unapproved draft, with the independently_verified basis,
--                               without submission-based promotion, never a baseline,
--    and NEVER approved, published, production_active or legacy_baseline. (H6 stays excluded by
--    verification_policy_scope_excludes_h6.)
-- 2. An explicitly guarded test mechanism: making a per_skill policy development_only additionally
--    requires the transaction-local opt-in `naqla.per_skill_dev_activation = 'on'` and is refused when
--    `naqla.production = 'on'` (config_activation_guard already refuses development_only in production;
--    this states it again for this pathway). The opt-in authorises nothing else: it cannot approve,
--    publish or production-activate anything — those are refused by (1) whatever the settings.
-- 3. O-3: an APPROVED per-skill threshold must be representable on the criterion's scoring scale:
--    threshold_for_skill × max_score is an integer and, when the criterion has scoring levels, the score
--    of one of them. Checked at commit (levels are written beside their criterion). Existing rows are
--    not rewritten; a notice reports any that would not be accepted today.
--
-- No row is created, activated or approved by this migration. No threshold value is approved or changed.
-- Rollback: supabase/rollback/0029_eng1_p3_development_pathway.down.sql (refuses while a per_skill
-- policy is not inactive).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────── 1. development seal ───────────────────────────────
do $$
begin
  if exists (select 1 from verification_policy where assessment_scope = 'per_skill' and activation <> 'inactive') then
    raise exception '0029 aborted: a per_skill policy is not inactive although the P2 seal forbids it; investigate before migrating';
  end if;
end $$;

alter table verification_policy drop constraint verification_policy_per_skill_sealed;
alter table verification_policy add constraint verification_policy_per_skill_development_only check (
  assessment_scope <> 'per_skill'
  or (activation in ('inactive', 'development_only')
      and review_status not in ('approved', 'published')
      and baseline_of is null
      and promotion_basis = 'independently_verified'
      and not practiced_on_submission));

comment on constraint verification_policy_per_skill_development_only on verification_policy is
  'ENG-1 P3: the per-skill pathway is development-only. A per_skill policy is an unapproved draft, inactive or development_only (with the explicit opt-in), independently_verified, never a baseline, never approved, published or production_active.';
comment on column verification_policy.assessment_scope is
  'ENG-1: which skills a decision may move. primary_claimed_skill = the legacy path (one explicitly attributed skill, ENG-1 P0). per_skill = one decision per claimed skill from its own criteria (P1 domain, P3 development pathway): never approved or active for real users (verification_policy_per_skill_development_only).';

-- ─────────────────────────────── 2. explicit test opt-in ───────────────────────────────
create or replace function verification_policy_per_skill_dev_guard() returns trigger
  language plpgsql as $$
  begin
    if new.assessment_scope = 'per_skill' and new.activation = 'development_only'
       and (tg_op = 'INSERT' or old.activation is distinct from 'development_only' or old.assessment_scope is distinct from 'per_skill') then
      if coalesce(current_setting('naqla.production', true), '') = 'on' then
        raise exception 'ENG-1 P3: the per-skill assessment pathway can never be activated in production'
          using errcode = 'insufficient_privilege';
      end if;
      if coalesce(current_setting('naqla.per_skill_dev_activation', true), '') <> 'on' then
        raise exception 'ENG-1 P3: a per_skill policy becomes development_only only with the explicit, transaction-local test opt-in naqla.per_skill_dev_activation = on'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
    return new;
  end $$;

comment on function verification_policy_per_skill_dev_guard() is
  'ENG-1 P3: the narrowly scoped test mechanism. Development activation of a per_skill policy needs naqla.per_skill_dev_activation = on and is refused in production; it can authorise nothing beyond development_only.';

create trigger verification_policy_per_skill_dev_guard_trg before insert or update on verification_policy
  for each row execute function verification_policy_per_skill_dev_guard();

-- ─────────────────────────────── 3. threshold representability (O-3) ───────────────────────────────
do $$
declare n int;
begin
  select count(*) into n
    from rubric_criterion rc
   where rc.threshold_status = 'approved' and rc.threshold_for_skill is not null
     and (abs(rc.threshold_for_skill * rc.max_score - round(rc.threshold_for_skill * rc.max_score)) > 0.000001
          or (exists (select 1 from rubric_criterion_level l where l.criterion_id = rc.id)
              and not exists (select 1 from rubric_criterion_level l where l.criterion_id = rc.id
                                                               and l.score = round(rc.threshold_for_skill * rc.max_score))));
  if n > 0 then
    raise notice '0029: % existing approved threshold(s) are not representable on their scoring scale; preserved unchanged (the per-skill domain treats them as unusable).', n;
  end if;
end $$;

create or replace function rubric_criterion_threshold_representable() returns trigger
  language plpgsql as $$
  declare r record; required numeric;
  begin
    select id, threshold_for_skill, threshold_status::text as threshold_status, max_score into r from rubric_criterion where id = new.id;
    if not found or r.threshold_status is distinct from 'approved' or r.threshold_for_skill is null then return null; end if;
    required := r.threshold_for_skill * r.max_score;
    if abs(required - round(required)) > 0.000001 then
      raise exception 'rubric criterion %: an approved threshold % of max % requires a score of %, which the scoring scale cannot represent', new.key, r.threshold_for_skill, r.max_score, required
        using errcode = 'check_violation';
    end if;
    if exists (select 1 from rubric_criterion_level l where l.criterion_id = r.id)
       and not exists (select 1 from rubric_criterion_level l where l.criterion_id = r.id and l.score = round(required)) then
      raise exception 'rubric criterion %: an approved threshold % of max % requires a score of %, which is not one of its scoring levels', new.key, r.threshold_for_skill, r.max_score, round(required)
        using errcode = 'check_violation';
    end if;
    return null;
  end $$;

comment on function rubric_criterion_threshold_representable() is
  'ENG-1 P3 (O-3): threshold_for_skill is a fraction of the criterion maximum in (0,1]; an approved one must name a score the criterion can be given.';

create constraint trigger rubric_criterion_threshold_representable_trg after insert or update on rubric_criterion
  deferrable initially deferred for each row execute function rubric_criterion_threshold_representable();
