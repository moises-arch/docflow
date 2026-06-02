-- Cover foreign keys introduced by provider/email ingest work.

create index if not exists inbound_emails_ingest_source_id_idx
  on inbound_emails (ingest_source_id)
  where ingest_source_id is not null;

create index if not exists email_ingest_events_ingest_source_id_idx
  on email_ingest_events (ingest_source_id)
  where ingest_source_id is not null;

create index if not exists email_ingest_events_inbound_email_id_idx
  on email_ingest_events (inbound_email_id)
  where inbound_email_id is not null;

create index if not exists documents_provider_id_idx
  on documents (provider_id)
  where provider_id is not null;

create index if not exists order_drafts_provider_id_idx
  on order_drafts (provider_id)
  where provider_id is not null;
