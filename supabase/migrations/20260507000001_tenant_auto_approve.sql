-- Add auto_approve_clean setting to tenants.
-- When true, the ai-process pipeline will automatically approve + sync to Odoo
-- any document that completes extraction with no missing required fields and
-- a resolved template/partner mapping — no human review click required.
--
-- Default: false (current behavior — manual approval required).
alter table tenants
  add column if not exists auto_approve_clean boolean not null default false;

comment on column tenants.auto_approve_clean is
  'When true, documents that pass AI extraction with no issues are auto-approved and synced to Odoo without human review.';
