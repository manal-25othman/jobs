-- ═══════════════════════════════════════════════════════════════════════════
-- 0040 — Phase B package 2 (PO decision 2): learning resources are exposed to a graduate only once verified.
--
--   * Verification is recorded on the existing registry row (no parallel system):
--       link_check          none | search_index | direct  — how the URL was checked
--       last_checked        (existing) the date of that check
--       usage_terms_note    the provider's terms as checked (licence name, linking note)
--       usage_terms_checked the date the provider's terms were checked
--   * A resource may be sme_reviewed / approved ONLY with a URL opened directly and the usage terms checked.
--   * A duration needs a stated basis (`duration_basis`); the drafts' unsupported durations are removed.
--     Rows already past review keep their history (the constraint is NOT VALID: it binds every new write).
--   * Graduates (authenticated) read a resource row only when it is exposable: verified AND visible content.
--     Unverified candidates are never readable by a graduate; the API serves them only in the internal
--     candidate preview (development only, audited, labelled — not a database permission).
-- Nothing here publishes, approves or verifies anything.
-- ═══════════════════════════════════════════════════════════════════════════

alter table learning_resource
  add column link_check          text not null default 'none' check (link_check in ('none', 'search_index', 'direct')),
  add column usage_terms_note    text,
  add column usage_terms_checked date,
  add column duration_basis      text check (duration_basis is null or length(btrim(duration_basis)) > 0);

comment on column learning_resource.link_check is
  'How the URL was checked: none, search_index (seen in a search result, never opened), direct (opened directly on last_checked).';
comment on column learning_resource.usage_terms_checked is
  'Date the provider''s own usage terms / licence page was checked directly (usage_terms_note says what it states).';
comment on column learning_resource.duration_basis is
  'Where the duration comes from (e.g. stated by the provider on the page). No basis ⇒ no duration (PO decision 2).';

-- The drafts' durations were never stated by a provider: removed (content rows still in review only).
update learning_resource set duration_minutes = null
 where duration_minutes is not null and duration_basis is null
   and review_status in ('draft', 'curated', 'needs_revision', 'rejected');

alter table learning_resource
  add constraint learning_resource_duration_has_basis check (duration_minutes is null or duration_basis is not null) not valid,
  add constraint learning_resource_verified_needs_direct_check check (
    quality_status not in ('sme_reviewed', 'approved')
    or (url is not null and link_check = 'direct' and last_checked is not null and usage_terms_checked is not null)
  ) not valid;

-- One rule, used by the row policy and by the API.
create function learning_resource_verified(p_quality resource_quality, p_review review_state, p_url text, p_link text, p_checked date, p_terms date)
  returns boolean language sql immutable as $$
  select p_quality in ('sme_reviewed', 'approved') and p_review = 'published' and p_url is not null
     and p_link = 'direct' and p_checked is not null and p_terms is not null
$$;
grant execute on function learning_resource_verified(resource_quality, review_state, text, text, date, date) to authenticated, service_role;

drop policy learning_resource_read_graduate on learning_resource;
create policy learning_resource_read_graduate on learning_resource for select to authenticated using (
  graduate_content_visible(review_status, is_demo_fixture)
  and learning_resource_verified(quality_status, review_status, url, link_check, last_checked, usage_terms_checked)
);
comment on policy learning_resource_read_graduate on learning_resource is
  'Phase B package 2: a graduate reads only a verified, visible resource. Candidates are never graduate-readable.';
