-- ═══════════════════════════════════════════════════════════════════════════
-- Vertical Slice 01.1 — production hardening.
--
--   1. `upload`: private file storage with provenance and ownership.
--   2. Submission artifacts may reference an upload or an external URL.
--   3. Verified stays blocked in production (D-059), as a constraint.
--
-- Storage objects live in Supabase Storage. This table is the product's record
-- of them: who uploaded what, when, how big, with which checksum. The object
-- path is never handed to a client; access is by short-lived signed URL only.
-- ═══════════════════════════════════════════════════════════════════════════

create type upload_state as enum ('pending', 'confirmed', 'rejected');

create table upload (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references app_user(id) on delete cascade,
  bucket          text not null,
  -- Prefixed with the owner's uuid so the storage policy is a prefix check.
  object_path     text not null,
  declared_name   text not null check (length(btrim(declared_name)) > 0),
  content_type    text not null,
  declared_size   bigint not null check (declared_size > 0),
  -- Filled on confirmation, from the object as stored, never from the client.
  size_bytes      bigint check (size_bytes > 0),
  checksum_sha256 text check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  state           upload_state not null default 'pending',
  purpose         text not null check (purpose in ('submission_file', 'cv_upload')),
  -- INV-5: provenance. The user uploaded it; nothing was generated.
  provenance_class  provenance_class not null default 'user_generated',
  provenance_source text not null,
  privacy_class     privacy_class not null default 'private_never_shareable',
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz,
  unique (bucket, object_path),
  constraint upload_confirmed_is_measured check (
    state <> 'confirmed' or (size_bytes is not null and checksum_sha256 is not null and confirmed_at is not null)
  ),
  constraint upload_path_is_owner_prefixed check (
    object_path like (user_id::text || '/%')
  ),
  constraint upload_never_shareable check (privacy_class = 'private_never_shareable')
);
create index upload_user_idx on upload(user_id, created_at desc);

comment on table upload is
  'Product record of a private storage object. The path never reaches a client; access is by signed URL only.';
comment on constraint upload_confirmed_is_measured on upload is
  'A confirmed upload carries the size and checksum measured from the stored object, never client-declared values.';
comment on constraint upload_path_is_owner_prefixed on upload is
  'The owner uuid prefixes every object path, so storage policies are a prefix comparison.';

-- A file artifact references its upload; a link artifact carries an http(s) URL.
alter table submission_artifact
  add column upload_id uuid references upload(id) on delete restrict;

alter table submission_artifact
  add constraint submission_artifact_file_has_upload check (
    kind <> 'file' or upload_id is not null
  ),
  add constraint submission_artifact_link_is_http check (
    kind <> 'link' or value_text ~* '^https?://'
  );

comment on constraint submission_artifact_file_has_upload on submission_artifact is
  'A file artifact is a confirmed upload the user owns, not a free-text filename.';

-- D-059: Verified is not available in production until the SME approval and
-- independent verification workflow exist. Removing this constraint is the
-- deliberate act that enables it — a migration, reviewed, not a code path.
alter table evidence_transition
  add constraint transition_verified_not_yet_available check (to_state <> 'verified');

comment on constraint transition_verified_not_yet_available on evidence_transition is
  'D-059: Demonstrated is the highest production evidence state. Drop this constraint only with the verification workflow.';

-- ───────────────────────────────── RLS ─────────────────────────────────────

alter table upload enable row level security;
alter table upload force  row level security;
grant select, insert, update, delete on upload to authenticated, service_role;
grant select on upload to anon;

-- The owner reads their own upload records. They never write them: the API
-- creates the pending row with the signed URL and confirms it from the stored
-- object, so a client cannot declare a file confirmed.
create policy upload_select_own on upload
  for select to authenticated using (user_id = auth.uid());
