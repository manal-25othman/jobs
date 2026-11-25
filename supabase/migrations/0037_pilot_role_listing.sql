-- ═══════════════════════════════════════════════════════════════════════════
-- 0037 — Phase B, PO decision 1: the current pilot track is the one OFFERED to new internal graduates.
--
-- Where a development pilot role is loaded (pilot_content_load, D-135), the older DEMO roles of the SAME track are no
-- longer LISTED for a new choice. Nothing else changes:
--   * graduate_role_visible is untouched — a graduate who already chose a legacy role keeps reading it, and every
--     goal, project, submission and evidence row that points at it stays exactly as it is;
--   * no row is deleted, re-statused or re-versioned;
--   * real (non-demo) roles are never hidden by this rule, and a pilot is never loaded in production (0035), so the
--     rule cannot act there.
-- Rollback: supabase/rollback/0037_pilot_role_listing.down.sql.
-- ═══════════════════════════════════════════════════════════════════════════

create function graduate_role_superseded_by_pilot(p_role uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from target_role r
     where r.id = p_role and r.is_demo_fixture and r.track_id is not null
       and not exists (select 1 from pilot_content_load l where l.target_role_id = r.id)
       and exists (select 1 from pilot_content_load l join target_role p on p.id = l.target_role_id
                    where p.track_id = r.track_id and p.id <> r.id))
$$;
comment on function graduate_role_superseded_by_pilot(uuid) is
  'PO decision 1 (Phase B): a DEMO role whose track has a loaded development pilot is not offered for a new choice; it stays visible to graduates who chose it.';

create or replace function graduate_role_listed(p_role uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select graduate_role_visible(p_role) and not graduate_role_superseded_by_pilot(p_role) and (
    exists (select 1 from role_requirement rr join skill s on s.id = rr.skill_id
             where rr.target_role_id = p_role and rr.enabled and s.status = 'active'
               and graduate_content_visible(rr.review_status, rr.is_demo_fixture) and graduate_content_visible(s.review_status, s.is_demo_fixture))
    or exists (select 1 from activity_spec a where graduate_activity_in_catalogue(a.id, p_role)))
$$;

revoke all on function graduate_role_superseded_by_pilot(uuid) from public, anon;
grant execute on function graduate_role_superseded_by_pilot(uuid) to authenticated, service_role;
