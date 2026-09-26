-- ═══════════════════════════════════════════════════════════════════════════
-- Vertical Slice 02 — agent invocations, proposals, usage.
--
-- An agent proposal is a request. It never IS evidence, a claim, an asset or
-- a publication. There is no foreign key from any authoritative table to this
-- one; the only way a proposal affects the product is through the same
-- approval path a user-initiated asset takes.
-- ═══════════════════════════════════════════════════════════════════════════

create type agent_type as enum ('recruitment', 'technical', 'learning', 'personal_branding', 'business');
create type proposal_lifecycle as enum ('generated', 'validated', 'awaiting_user', 'approved', 'rejected', 'superseded');
create type agent_usage_status as enum ('ok', 'rejected_invalid_output', 'provider_error', 'budget_exceeded', 'context_refused');

create table agent_invocation (
  id                uuid primary key default gen_random_uuid(),
  agent_id          text not null,
  agent_type        agent_type not null,
  trigger           text not null,
  user_id           uuid not null references app_user(id) on delete cascade,
  target_role_id    uuid references target_role(id) on delete set null,
  -- Exactly the context field paths passed to the agent (privacy §12).
  allowed_context   text[] not null,
  redacted_context  text[] not null default '{}',
  requested_action  text not null,
  input_references  jsonb not null default '[]'::jsonb,
  output_types      text[] not null,
  provenance_class  provenance_class not null default 'ai_generated',
  provenance_source text not null,
  -- Null for the local test provider. Never fabricated.
  provider          text not null,
  model             text,
  orchestration_rule text,
  created_at        timestamptz not null default now()
);
create index agent_invocation_user_idx on agent_invocation(user_id, created_at desc);

comment on column agent_invocation.allowed_context is 'What the agent actually saw, recorded per invocation — not what it might have seen.';
comment on column agent_invocation.input_references is 'JSONB justified: a list of typed references; queried only for audit.';

-- Append-only usage, one row per invocation. INV-6 for agents.
create table agent_usage (
  id              uuid primary key default gen_random_uuid(),
  invocation_id   uuid not null unique references agent_invocation(id) on delete cascade,
  user_id         uuid not null references app_user(id) on delete cascade,
  agent_type      agent_type not null,
  provider        text not null,
  model           text not null,
  input_bytes     int not null check (input_bytes >= 0),
  output_bytes    int not null check (output_bytes >= 0),
  latency_ms      int not null check (latency_ms >= 0),
  -- Null unless the provider reported a real figure.
  estimated_cost  numeric(12,6),
  status          agent_usage_status not null,
  cache_status    text not null check (cache_status in ('hit','miss','n/a')),
  error_type      text,
  created_at      timestamptz not null default now()
);

create table agent_proposal (
  id                    uuid primary key default gen_random_uuid(),
  invocation_id         uuid not null references agent_invocation(id) on delete restrict,
  user_id               uuid not null references app_user(id) on delete cascade,
  agent_type            agent_type not null,
  proposal_type         text not null,
  subject_type          text not null,
  subject_id            text not null,
  summary               text not null check (length(btrim(summary)) > 0),
  structured_payload    jsonb not null,
  evidence_refs         text[] not null default '{}',
  source_refs           jsonb not null default '[]'::jsonb,
  rationale             text not null check (length(btrim(rationale)) > 0),
  warnings              text[] not null default '{}',
  requires_user_approval boolean not null,
  requires_domain_validation boolean not null default true,
  lifecycle             proposal_lifecycle not null default 'generated',
  version               int not null default 1,
  validated_at          timestamptz,
  approved_at           timestamptz,
  -- Optional user edit captured at approval; the original stays in structured_payload.
  approved_body         text,
  rejected_at           timestamptz,
  rejection_reason      text,
  superseded_by         uuid references agent_proposal(id) on delete set null,
  -- The asset the approval created or activated. Never set on any other path.
  resulting_asset_id    uuid references professional_asset(id) on delete set null,
  created_at            timestamptz not null default now(),

  constraint proposal_payload_is_typed check (structured_payload ? 'kind'),
  constraint proposal_approved_needs_time check (lifecycle <> 'approved' or approved_at is not null),
  constraint proposal_rejected_needs_reason check (
    lifecycle <> 'rejected' or (rejected_at is not null and length(btrim(coalesce(rejection_reason,''))) > 0)
  ),
  constraint proposal_superseded_points_forward check (lifecycle <> 'superseded' or superseded_by is not null),
  constraint proposal_asset_only_when_approved check (resulting_asset_id is null or lifecycle = 'approved')
);
create index agent_proposal_user_idx on agent_proposal(user_id, lifecycle, created_at desc);

comment on table agent_proposal is 'A request, never a fact. Approved history is not rewritten: a change is a new version linked by superseded_by.';
comment on column agent_proposal.structured_payload is 'JSONB justified: a typed payload validated by the gateway; the kind column inside it is required by constraint.';

-- Approved and rejected proposals are history: no UPDATE that changes their
-- substance. A trigger, because the rule spans rows (lifecycle before/after).
create function agent_proposal_freeze() returns trigger language plpgsql as $$
begin
  if old.lifecycle in ('approved','rejected') then
    if new.structured_payload <> old.structured_payload or new.lifecycle <> old.lifecycle
       or new.summary <> old.summary or new.evidence_refs <> old.evidence_refs then
      raise exception 'agent_proposal % is % and cannot be rewritten', old.id, old.lifecycle;
    end if;
  end if;
  return new;
end $$;
create trigger agent_proposal_freeze_trg before update on agent_proposal
  for each row execute function agent_proposal_freeze();

-- ───────────────────────────────── RLS ─────────────────────────────────────
alter table agent_invocation enable row level security; alter table agent_invocation force row level security;
alter table agent_usage      enable row level security; alter table agent_usage      force row level security;
alter table agent_proposal   enable row level security; alter table agent_proposal   force row level security;
grant select, insert, update, delete on agent_invocation, agent_usage, agent_proposal to authenticated, service_role;
grant select on agent_invocation, agent_usage, agent_proposal to anon;

-- The user reads their own proposals. They never write them: the gateway
-- creates, the approval endpoint transitions. Usage and invocation detail
-- (what context was passed, provider metadata) are audit rows the user does
-- not query directly.
create policy agent_proposal_select_own on agent_proposal for select to authenticated using (user_id = auth.uid());
