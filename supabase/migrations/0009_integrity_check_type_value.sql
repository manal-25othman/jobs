-- 0009 — one statement on purpose: a new enum value cannot be used in the same
-- transaction that adds it, so it lives in its own migration (0010 uses it).
-- `mandatory_deliverables`: the user-facing gate "attach every mandatory file".
-- Until now that gate was mislabelled `followup_modification` (OPEN-045 review).
alter type integrity_check_type add value if not exists 'mandatory_deliverables';
