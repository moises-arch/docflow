-- Audit trail for rejected order drafts: who rejected and when.
-- Mirrors approved_by/approved_at already present.

alter table order_drafts
  add column if not exists rejected_by  uuid references auth.users(id),
  add column if not exists rejected_at  timestamptz;

comment on column order_drafts.rejected_by is
  'auth.users.id of the operator who rejected this draft. Null until rejected.';
comment on column order_drafts.rejected_at is
  'Timestamp at which the draft was rejected. Null until rejected.';
