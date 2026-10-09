-- ═══════════════════════════════════════════════════════════════════════════
-- 0024 · Graduate activity journey, Phase 1 — content access safety
--
-- Before:
--   * target_role, skill, role_requirement and learning_resource were readable
--     `using (true)` by authenticated AND anon: draft, test and unreviewed
--     roles, skills and mappings were exposed to anyone who asked.
--   * activity_input (including `contains_planted_issue` and descriptions such
--     as "four planted defects") was readable by authenticated and anon for any
--     published activity: the assessment design could be read before working.
--   * activity_spec exposed every column (the opaque `spec` document, reviewer
--     identities, validation flags) to authenticated and anon.
--   * role_requirement exposed assessment and readiness internals (weights,
--     demand data, minimum evidence counts, human-review flags).
--
-- After:
--   1. One rule, in one place: `graduate_content_visible(review_status, is_demo)`
--      — non-demo content only when `published`; DEMO fixtures only where this
--      deployment says demo content is visible (`platform_deployment`, OFF by
--      default and refused by the API in production), and never when retired.
--      RLS and the API both call it.
--   2. Rows a user already owns a reference to stay readable to that user
--      (their goal's role, the skills of their claims/progress/evidence/
--      submissions, the activities of their projects): history is never hidden.
--   3. anon reads none of this content. Writes from clients were never allowed
--      (no write policy); the unused write grants are revoked too.
--   4. activity_input is service-only: the API serves a learner projection
--      without planted-issue flags or planted-input descriptions.
--   5. activity_spec and role_requirement are readable by column: learner-facing
--      columns only.
-- Admin and internal paths (evaluation, review, Track Builder, readiness
-- computation) run through the service role, as before; nothing here reopens
-- graduate access to make them work.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────── 1. deployment flag (singleton) ─────────────────────

create table platform_deployment (
  singleton            boolean primary key default true check (singleton),
  id                   uuid not null unique default gen_random_uuid(),
  demo_content_visible boolean not null default false,
  updated_at           timestamptz not null default now()
);
comment on table platform_deployment is
  'Graduate journey Phase 1: deployment facts the database needs. demo_content_visible = whether DEMO fixtures may be shown to graduates (labelled). OFF by default; set only by the demo seed or an audited operator act; the API refuses to start in production when it is on.';
alter table platform_deployment enable row level security;
alter table platform_deployment force row level security;
grant select, insert, update on platform_deployment to service_role;
insert into platform_deployment (singleton) values (true);

create function platform_deployment_audit() returns trigger language plpgsql as $$
declare actor text := nullif(current_setting('naqla.config_actor', true), '');
        why   text := nullif(current_setting('naqla.config_reason', true), '');
begin
  if new.demo_content_visible is distinct from old.demo_content_visible then
    if actor is null or why is null then
      raise exception 'platform_deployment.demo_content_visible changes need naqla.config_actor and naqla.config_reason (audited)';
    end if;
    insert into config_change (entity_table, entity_id, field, old_value, new_value, actor, reason)
    values ('platform_deployment', new.id, 'demo_content_visible', old.demo_content_visible::text, new.demo_content_visible::text, actor, why);
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger platform_deployment_audit before update on platform_deployment for each row execute function platform_deployment_audit();
create function platform_deployment_no_delete() returns trigger language plpgsql as $$
begin raise exception 'platform_deployment is a singleton; it is never deleted'; end $$;
create trigger platform_deployment_no_delete before delete on platform_deployment for each row execute function platform_deployment_no_delete();

-- ─────────────────────────── 2. the visibility rule ─────────────────────────
-- SECURITY DEFINER so a client policy can read the flag without reading the table.

create function demo_content_visible() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select demo_content_visible from platform_deployment where singleton), false)
$$;

-- Mirrored by @naqla/domain contentVisibleToGraduate (unit-tested; equivalence checked by e2e).
create function graduate_content_visible(p_review review_state, p_demo boolean) returns boolean
  language sql stable security definer set search_path = public as $$
  select case when p_demo then demo_content_visible() and p_review not in ('superseded','rejected')
              else p_review = 'published' end
$$;

-- Mirrored by @naqla/domain activityVisibleToGraduate.
create function graduate_activity_visible(p_status review_state, p_demo boolean) returns boolean
  language sql stable security definer set search_path = public as $$
  select p_status = 'published' and (not p_demo or demo_content_visible())
$$;

grant execute on function demo_content_visible(), graduate_content_visible(review_state, boolean), graduate_activity_visible(review_state, boolean)
  to authenticated, service_role;

-- A role a graduate may see: visible content.
create function graduate_role_visible(p_role uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from target_role r where r.id = p_role and graduate_content_visible(r.review_status, r.is_demo_fixture))
$$;

-- An activity is in a role's catalogue when: it is visible; the role is visible; it is mapped to the role —
-- bound to it (target_role_id), or, when bound to no role, through a skill the role requires (an enabled,
-- visible requirement on a visible skill); and at least one of its skills is a visible, active skill.
create function graduate_activity_in_catalogue(p_activity uuid, p_role uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from activity_spec a
     where a.id = p_activity
       and graduate_activity_visible(a.status, a.is_demo_fixture)
       and graduate_role_visible(p_role)
       and (a.target_role_id = p_role
            or (a.target_role_id is null and exists (
                  select 1 from activity_skill k join role_requirement rr on rr.skill_id = k.skill_id join skill s on s.id = k.skill_id
                   where k.activity_spec_id = a.id and rr.target_role_id = p_role and rr.enabled
                     and graduate_content_visible(rr.review_status, rr.is_demo_fixture) and graduate_content_visible(s.review_status, s.is_demo_fixture))))
       and exists (select 1 from activity_skill k join skill s on s.id = k.skill_id
                    where k.activity_spec_id = a.id and s.status = 'active' and graduate_content_visible(s.review_status, s.is_demo_fixture))
  )
$$;

-- A role is listed for choice when it is visible AND has consumable content: a visible enabled requirement on a
-- visible active skill, or an activity in its catalogue. An empty shell is not offered.
create function graduate_role_listed(p_role uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select graduate_role_visible(p_role) and (
    exists (select 1 from role_requirement rr join skill s on s.id = rr.skill_id
             where rr.target_role_id = p_role and rr.enabled and s.status = 'active'
               and graduate_content_visible(rr.review_status, rr.is_demo_fixture) and graduate_content_visible(s.review_status, s.is_demo_fixture))
    or exists (select 1 from activity_spec a where graduate_activity_in_catalogue(a.id, p_role)))
$$;
grant execute on function graduate_role_visible(uuid), graduate_activity_in_catalogue(uuid, uuid), graduate_role_listed(uuid) to authenticated, service_role;

-- canonical_skill_id resolves an alias id to its canonical id. It returns an id, never content; it must not
-- depend on what the caller may read, or a merged alias would resolve differently per user.
alter function canonical_skill_id(uuid) security definer;
alter function canonical_skill_id(uuid) set search_path = public;

-- ─────────────────── 3. anon reads none of this; clients write none ──────────

revoke select on target_role, skill, role_requirement, learning_resource,
  activity_spec, activity_input, activity_deliverable, activity_skill, activity_task from anon;
revoke insert, update, delete on target_role, skill, role_requirement, learning_resource, activity_spec from authenticated;

-- ───────────────────────────── 4. row policies ──────────────────────────────

drop policy target_role_read_published on target_role;
create policy target_role_read_graduate on target_role for select to authenticated using (
  graduate_content_visible(review_status, is_demo_fixture)
  or exists (select 1 from career_goal g where g.target_role_id = target_role.id and g.user_id = auth.uid())
);

drop policy skill_read_published on skill;
create policy skill_read_graduate on skill for select to authenticated using (
  graduate_content_visible(review_status, is_demo_fixture)
  or exists (select 1 from skill_claim x where x.skill_id = skill.id and x.user_id = auth.uid())
  or exists (select 1 from skill_progress x where x.skill_id = skill.id and x.user_id = auth.uid())
  or exists (select 1 from submission_claimed_skill x where x.skill_id = skill.id and x.user_id = auth.uid())
  or exists (select 1 from evidence x where x.skill_id = skill.id and x.user_id = auth.uid())
  or exists (select 1 from evidence_item_skill x where x.skill_id = skill.id and x.user_id = auth.uid())
);

-- A requirement is a role↔skill mapping: visible when it, its role and its skill are all visible content, and enabled.
drop policy role_requirement_read_published on role_requirement;
create policy role_requirement_read_graduate on role_requirement for select to authenticated using (
  enabled
  and graduate_content_visible(review_status, is_demo_fixture)
  and exists (select 1 from target_role r where r.id = role_requirement.target_role_id and graduate_content_visible(r.review_status, r.is_demo_fixture))
  and exists (select 1 from skill s where s.id = role_requirement.skill_id and graduate_content_visible(s.review_status, s.is_demo_fixture))
);

drop policy learning_resource_read_published on learning_resource;
create policy learning_resource_read_graduate on learning_resource for select to authenticated using (
  graduate_content_visible(review_status, is_demo_fixture)
);

drop policy activity_spec_read_published on activity_spec;
create policy activity_spec_read_graduate on activity_spec for select to authenticated using (
  graduate_activity_visible(status, is_demo_fixture)
  or exists (select 1 from project p where p.activity_spec_id = activity_spec.id and p.user_id = auth.uid())
);

drop policy activity_deliverable_read_published on activity_deliverable;
create policy activity_deliverable_read_graduate on activity_deliverable for select to authenticated using (
  exists (select 1 from activity_spec a where a.id = activity_deliverable.activity_spec_id)  -- inherits activity_spec RLS
);
drop policy activity_skill_read_published on activity_skill;
create policy activity_skill_read_graduate on activity_skill for select to authenticated using (
  exists (select 1 from activity_spec a where a.id = activity_skill.activity_spec_id)
);
drop policy activity_task_read_published on activity_task;
create policy activity_task_read_graduate on activity_task for select to authenticated using (
  exists (select 1 from activity_spec a where a.id = activity_task.activity_spec_id)
);

-- ───────────────── 5. assessment-private data: service only ─────────────────
-- Inputs carry the assessment design (planted issues). The learner projection is served by the API.
drop policy activity_input_read_published on activity_input;
revoke select on activity_input from authenticated;
comment on table activity_input is
  'Activity inputs. Service-only since 0024: contains_planted_issue and planted-input descriptions are assessment design. The API serves a learner projection (key, and the description only of inputs with no planted issue).';

-- ─────────────────── 6. column projections (learner-facing only) ────────────
revoke select on activity_spec from authenticated;
grant select (id, slug, version, status, title_ar, title_en, objective_ar, objective_en, business_context_ar, business_context_en,
  level, ai_usage_mode, estimated_minutes, target_role_id, is_demo_fixture, can_yield_demonstrated, published_at)
  on activity_spec to authenticated;

revoke select on role_requirement from authenticated;
grant select (id, target_role_id, skill_id, importance, is_core, category, display_order, expected_level, target_proficiency,
  why_required_ar, why_required_en, evidence_type_expected, review_status, is_demo_fixture, enabled, classification_status, version)
  on role_requirement to authenticated;
