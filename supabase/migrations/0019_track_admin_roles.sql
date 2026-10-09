-- 0019 — Admin Track Builder roles (Phase 8, D-116). A separate file because a new enum value
-- cannot be used in the transaction that adds it (plan §0016_track_admin note).
--
--   track_admin    drafts configuration and content; submits it for review. NOT an expert.
--   product_owner  publishes approved content and activates approved configuration.
-- `sme` (professional validation) and `human_reviewer` (blind criterion review) are unchanged.
-- Grants stay operator acts on reviewer_grant; nobody grants themself.
alter type role_performed add value if not exists 'track_admin';
alter type role_performed add value if not exists 'product_owner';
