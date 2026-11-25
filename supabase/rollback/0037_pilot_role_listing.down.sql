-- Rollback of 0037: restores the 0024 listing rule. No data was changed by 0037, so nothing else is restored.
create or replace function graduate_role_listed(p_role uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select graduate_role_visible(p_role) and (
    exists (select 1 from role_requirement rr join skill s on s.id = rr.skill_id
             where rr.target_role_id = p_role and rr.enabled and s.status = 'active'
               and graduate_content_visible(rr.review_status, rr.is_demo_fixture) and graduate_content_visible(s.review_status, s.is_demo_fixture))
    or exists (select 1 from activity_spec a where graduate_activity_in_catalogue(a.id, p_role)))
$$;
drop function if exists graduate_role_superseded_by_pilot(uuid);
