-- ═══════════════════════════════════════════════════════════════════════════
-- Owner decisions before the agent evaluation harness (D-073..D-077).
--
--   D-076  technology terms are DATA, and a technology may appear in a claim
--          only with an approved source (user-declared, project metadata,
--          artifact, evidence metadata). No inference from generic behaviour.
--   D-077  withdrawn evidence: the asset becomes needs_review, is no longer
--          evidence-backed, history is kept, re-link is explicit.
-- ═══════════════════════════════════════════════════════════════════════════

-- The vocabulary of technology terms, seeded from track packs. Data, not code:
-- validation scans wording for known terms and requires an approved source.
create table technology_term (
  id              uuid primary key default gen_random_uuid(),
  term            text not null unique,
  aliases         text[] not null default '{}',
  category        text not null check (category in ('language','framework','library','tool','platform')),
  provenance_source text not null,
  is_demo_fixture boolean not null default false,
  created_at      timestamptz not null default now()
);
alter table technology_term enable row level security; alter table technology_term force row level security;
grant select on technology_term to anon, authenticated, service_role;
create policy technology_term_read on technology_term for select to anon, authenticated using (true);

-- Approved technology sources. Free text the USER supplied — never inferred.
alter table project    add column declared_technologies text[] not null default '{}';
alter table submission add column declared_technologies text[] not null default '{}';
comment on column project.declared_technologies is 'D-076: user-provided. An approved source for a technology claim. Never inferred from files.';

-- D-077: an asset can stop being evidence-backed without being deleted.
alter type asset_lifecycle_state add value if not exists 'needs_review';
alter table professional_asset add column evidence_backed boolean not null default true;
alter table professional_asset add column review_reason text;
alter table professional_asset add column review_at timestamptz;
alter table professional_asset add constraint asset_needs_review_has_reason check (
  lifecycle_state <> 'needs_review' or (evidence_backed = false and length(btrim(coalesce(review_reason,''))) > 0)
);
comment on constraint asset_needs_review_has_reason on professional_asset is
  'D-077: needs_review always carries why, and is never presented as evidence-backed.';

-- Withdrawing evidence: the owner may do it, with a reason (evidence.withdrawn_reason exists).
create policy evidence_withdraw_own on evidence
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and withdrawn_at is not null and length(btrim(coalesce(withdrawn_reason,''))) > 0);
comment on policy evidence_withdraw_own on evidence is
  'The only client write on evidence: the owner may WITHDRAW their own evidence with a reason. Nothing else.';

-- D-057 on the proposal path: the direct CV-bullet endpoint is gone (D-074), so
-- the preview step must be recorded on the proposal itself. Approval without a
-- recorded preview is refused by the service (rule named in @naqla/agents).
alter table agent_proposal add column previewed_at timestamptz;
comment on column agent_proposal.previewed_at is 'D-057: set the first time the user opened the preview. Approval requires it.';
