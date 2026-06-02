alter table order_drafts
add column if not exists payment_terms text null;
