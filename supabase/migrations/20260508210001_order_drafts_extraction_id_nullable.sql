-- Allow order_drafts.extraction_id to be NULL for orders that bypass the AI
-- pipeline (e.g. Walmart API direct integration where all data comes from the
-- structured JSON response, not from document extraction).
alter table order_drafts alter column extraction_id drop not null;
