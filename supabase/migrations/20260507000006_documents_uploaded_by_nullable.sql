-- Email and browser-scraper ingests don't have a human "uploader" — they are
-- system-driven. The original schema required uploaded_by NOT NULL because it
-- was designed only for the manual upload flow. This makes the column nullable
-- so automated source channels (email, browser-ingest) can insert documents.
-- Manual uploads still set uploaded_by from the authenticated user (see
-- src/app/api/upload/route.ts).

alter table documents alter column uploaded_by drop not null;
