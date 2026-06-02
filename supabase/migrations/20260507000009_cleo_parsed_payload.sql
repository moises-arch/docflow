-- Stores the structured payload extracted from Cleo's printDocument HTML.
-- Used as authoritative source for line items / addresses / totals to bypass
-- AI extraction errors on Cleo's complex print template.

alter table cleo_orders
  add column if not exists parsed_payload jsonb,
  add column if not exists html_storage_path text;

-- Index for filtering parsed vs unparsed orders
create index if not exists cleo_orders_parsed_idx
  on cleo_orders ((parsed_payload is not null));
