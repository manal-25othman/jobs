-- ═══════════════════════════════════════════════════════════════════════════
-- 0036 — D-136: development-only DEMO publication of PILOT content (conditional PO approval, Option B).
--
-- The generic review guard (0007) already lets a DEMO fixture move curated → published; the governed review command
-- never does it (publication needs a named SME's approval, which a demo fixture never receives). This migration does
-- NOT touch either: real content's SME workflow, the 0007 guard and the review command are unchanged.
--
-- It NARROWS the existing shortcut for pilot content (an activity or rubric of a role recorded in pilot_content_load):
-- such a row becomes `published` only when, in the same transaction,
--   * naqla.production is not 'on';
--   * naqla.pilot_demo_publication = 'on' (explicit, transaction-local opt-in);
--   * naqla.pilot_publication_operator names a user with an ACTIVE product_owner grant;
--   * the row is a DEMO fixture and the deployment shows demo content (platform_deployment);
-- and a pilot row never carries an SME or values approval (sme_approved_*, reviewed_*, values_approved_*).
-- Nothing is published, approved or activated by this migration.
-- Rollback: supabase/rollback/0036_dev_pilot_demo_publication.down.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- The pilot role of an activity (by its role) or of a rubric (by its activity's role); null for any other content.
create function pilot_role_of(p_target_role uuid, p_activity uuid) returns uuid
  language sql stable security definer set search_path = public as $$
  select l.target_role_id from pilot_content_load l
   where l.target_role_id = case when p_activity is null then p_target_role else (select a.target_role_id from activity_spec a where a.id = p_activity) end
   limit 1
$$;
revoke all on function pilot_role_of(uuid, uuid) from public, anon, authenticated;

create function pilot_demo_publication_guard() returns trigger
  language plpgsql as $$
  declare
    -- (read through jsonb: the two tables do not share these column names)
    pilot uuid := pilot_role_of((to_jsonb(new) ->> 'target_role_id')::uuid, (to_jsonb(new) ->> 'activity_spec_id')::uuid);
    op text;
  begin
    if pilot is null then return new; end if;   -- not pilot content: every existing rule applies unchanged
    -- A pilot row never carries an SME or values approval, whatever the transition.
    if tg_table_name = 'activity_spec' and (to_jsonb(new) ->> 'sme_approved_by' is not null or to_jsonb(new) ->> 'sme_approved_at' is not null or to_jsonb(new) ->> 'reviewed_by' is not null) then
      raise exception 'D-136: pilot content never carries an SME approval' using errcode = 'check_violation';
    end if;
    if tg_table_name = 'rubric_version' and (to_jsonb(new) ->> 'values_approved_by' is not null or to_jsonb(new) ->> 'values_approved_at' is not null) then
      raise exception 'D-136: pilot content never carries an SME values approval' using errcode = 'check_violation';
    end if;
    if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
      if coalesce(current_setting('naqla.production', true), '') = 'on' then
        raise exception 'D-136: pilot content is never published in production' using errcode = 'insufficient_privilege';
      end if;
      if coalesce(current_setting('naqla.pilot_demo_publication', true), '') <> 'on' then
        raise exception 'D-136: pilot content is published only by the authorized Product Owner pilot operation (naqla.pilot_demo_publication = on)'
          using errcode = 'insufficient_privilege';
      end if;
      op := nullif(current_setting('naqla.pilot_publication_operator', true), '');
      if op is null or op !~* '^[0-9a-f-]{36}$' or not exists (
           select 1 from reviewer_grant g where g.user_id = op::uuid and g.role_performed = 'product_owner' and g.revoked_at is null) then
        raise exception 'D-136: the pilot publication operator must hold an active product_owner grant' using errcode = 'insufficient_privilege';
      end if;
      if not new.is_demo_fixture then
        raise exception 'D-136: only DEMO-fixture pilot content can take the development publication' using errcode = 'check_violation';
      end if;
      if not demo_content_visible() then
        raise exception 'D-136: this deployment does not show demo content; pilot content is not published here' using errcode = 'insufficient_privilege';
      end if;
    end if;
    return new;
  end $$;

create trigger activity_spec_pilot_demo_publication_trg before insert or update on activity_spec
  for each row execute function pilot_demo_publication_guard();
create trigger rubric_version_pilot_demo_publication_trg before insert or update on rubric_version
  for each row execute function pilot_demo_publication_guard();
