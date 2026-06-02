-- Add 'payment' document kind for payment settlements / remittance documents.
-- These flow through a dedicated path (ai-process → direct push to Odoo
-- DocFlow.settlement) instead of the order_drafts pipeline used by orders.

-- Extend document_kind checks on the three tables that carry it.
alter table review_profiles drop constraint if exists review_profiles_document_kind_check;
alter table review_profiles add constraint review_profiles_document_kind_check
  check (document_kind in ('purchase_order','invoice','shipping','receipt','custom','payment'));

alter table documents drop constraint if exists documents_document_kind_check;
alter table documents add constraint documents_document_kind_check
  check (document_kind in ('purchase_order','invoice','shipping','receipt','custom','payment'));

alter table order_drafts drop constraint if exists order_drafts_document_kind_check;
alter table order_drafts add constraint order_drafts_document_kind_check
  check (document_kind in ('purchase_order','invoice','shipping','receipt','custom','payment'));

-- System review profile, one per tenant. Appears in Profile Studio.
insert into review_profiles (tenant_id, name, slug, document_kind, description, system, sort_order)
select
  t.id,
  'Payment Documents',
  'payment-docs',
  'payment',
  'Settlements and payment remittances (Amazon/Shopify/bank). Extracted and pushed to the Odoo settlement inbox.',
  true,
  50
from tenants t
on conflict (tenant_id, slug) do update
set
  name = excluded.name,
  document_kind = excluded.document_kind,
  description = excluded.description,
  active = true;
