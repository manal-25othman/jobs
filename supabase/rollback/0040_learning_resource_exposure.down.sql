-- Rollback of 0040. Restores the 0024 graduate read policy. Refuses while any row records a direct check or usage
-- terms (verification history is never discarded by a rollback). The removed draft durations are NOT restored:
-- they had no stated basis (PO decision 2).
do $$
begin
  if exists (select 1 from learning_resource where link_check = 'direct' or usage_terms_checked is not null or duration_basis is not null) then
    raise exception '0040 rollback refused: learning resources record verification history';
  end if;
end $$;
drop policy if exists learning_resource_read_graduate on learning_resource;
create policy learning_resource_read_graduate on learning_resource for select to authenticated using (
  graduate_content_visible(review_status, is_demo_fixture)
);
drop function if exists learning_resource_verified(resource_quality, review_state, text, text, date, date);
alter table learning_resource
  drop constraint if exists learning_resource_verified_needs_direct_check,
  drop constraint if exists learning_resource_duration_has_basis,
  drop column if exists duration_basis,
  drop column if exists usage_terms_checked,
  drop column if exists usage_terms_note,
  drop column if exists link_check;
