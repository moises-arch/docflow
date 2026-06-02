-- Add customer_sku to order_draft_lines.
--
-- The "sku" column holds OUR internal product code (default_code) after
-- ai-process resolves the line to a catalog product. The original partner-
-- recognized code (Zoro's "Buyer's Part Number", Northern Tool's "Item
-- Number", etc.) is lost in the swap.
--
-- customer_sku preserves that original code so it can be forwarded to Odoo
-- (x_customer_sku) and rendered on packing slips with the code the partner
-- recognizes.

alter table order_draft_lines
  add column if not exists customer_sku text;

-- Index for analytics / lookup by partner code (not enforced unique because
-- the same partner code may appear across drafts/tenants).
create index if not exists order_draft_lines_customer_sku_idx
  on order_draft_lines (tenant_id, customer_sku)
  where customer_sku is not null;

comment on column order_draft_lines.customer_sku is
  'Partner/customer-recognized product code as it appeared on the source PO. '
  'Populated by ai-process when a SKU swap occurs (i.e. the original code did '
  'not match our catalog and was resolved via mapping or alt_codes). NULL when '
  'no swap occurred (line.sku already matched our internal default_code).';
