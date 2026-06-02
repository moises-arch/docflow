-- Fix: credit_ledger.document_id had no ON DELETE action, causing FK violation
-- when trying to delete a document that has been billed.
-- Using SET NULL to preserve billing history even after document deletion.
alter table credit_ledger
  drop constraint if exists credit_ledger_document_id_fkey;

alter table credit_ledger
  add constraint credit_ledger_document_id_fkey
  foreign key (document_id) references documents(id) on delete set null;
