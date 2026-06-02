-- Add delivery_date (estimated delivery date / commitment date) to order_drafts.
-- Maps to Odoo's commitment_date on sale.order.
alter table order_drafts add column if not exists delivery_date date;
