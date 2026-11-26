-- ═══════════════════════════════════════════════════════════════════════════
-- 0041 — FR-U-013 / BR-001: the graduate's self-assessment of the skills of their role (journey S06 `SelfAssessment`).
--
--   * A separate, append-only record at confidence `Observed` ONLY. It is NOT evidence, NOT a skill claim and NOT a
--     level: nothing here references or changes `skill_claim`, `evidence`, a verification decision or readiness
--     (PO decision 1 of the post-package-5 review; standard 07: "self-assessment is not verified evidence").
--   * Never public (D-017 / BR-001): readable only by its owner; no public, share or report path reads it.
--   * History is kept: a new rating is a new row; nothing is updated or deleted (except with the account).
--   * A rating is a key of the default proficiency scale, or `not_tried` / `unsure`.
-- ═══════════════════════════════════════════════════════════════════════════

create table skill_self_assessment (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references app_user(id) on delete cascade,
  skill_id       uuid not null references skill(id) on delete restrict,
  target_role_id uuid references target_role(id) on delete set null,
  rating         text not null check (rating ~ '^[a-z_]{2,40}$'),
  note           text check (note is null or (length(btrim(note)) > 0 and length(note) <= 500)),
  confidence     text not null default 'observed' check (confidence = 'observed'),
  created_at     timestamptz not null default now()
);
create index skill_self_assessment_latest on skill_self_assessment (user_id, skill_id, created_at desc);
comment on table skill_self_assessment is
  'FR-U-013 / BR-001: a self-assessment, confidence Observed only. Not evidence, not a claim, not a level; never public; append-only.';

-- security definer: the validation reads the scale and the skill registry whatever the caller may read.
create function skill_self_assessment_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then
    raise exception '[self_assessment_append_only] a self-assessment is history: add a new rating instead of changing one';
  end if;
  if new.rating not in ('not_tried', 'unsure')
     and not exists (select 1 from proficiency_level l join proficiency_scale s on s.id = l.scale_id where s.code = 'scale_default' and l.level_key = new.rating) then
    raise exception '[self_assessment_bad_rating] % is not a level of the proficiency scale', new.rating;
  end if;
  if not exists (select 1 from skill s where s.id = new.skill_id and s.status = 'active') then
    raise exception '[self_assessment_unknown_skill] the skill is not an active skill';
  end if;
  return new;
end $$;
create trigger skill_self_assessment_guard_ins before insert on skill_self_assessment for each row execute function skill_self_assessment_guard();
create trigger skill_self_assessment_guard_upd before update or delete on skill_self_assessment for each row
  -- a direct change is refused; the row goes only with its account (an FK cascade runs at trigger depth > 0)
  when (pg_trigger_depth() = 0)
  execute function skill_self_assessment_guard();

alter table skill_self_assessment enable row level security;
alter table skill_self_assessment force row level security;
revoke all on skill_self_assessment from anon;
revoke all on skill_self_assessment from authenticated;
grant select, insert on skill_self_assessment to authenticated;
grant all on skill_self_assessment to service_role;
create policy skill_self_assessment_own_read on skill_self_assessment for select to authenticated using (user_id = auth.uid());
create policy skill_self_assessment_own_insert on skill_self_assessment for insert to authenticated with check (user_id = auth.uid());
