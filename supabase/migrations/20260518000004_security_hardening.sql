-- Security hardening + performance migration (2026-05-18)
--
-- 1) Force `credit_balances` view to run with INVOKER security so RLS on the
--    underlying `credit_ledger` table is honored (previously a postgres-defined
--    view defaulted to definer security, potentially leaking cross-tenant data).
-- 2) Re-restrict the `documents` bucket to a known list of MIME types. The
--    earlier migration set this to NULL "to allow Excel attachments" but that
--    also accepted any file format. We re-add the curated list including the
--    Excel types the email pipeline requires.
-- 3) Add missing indexes that turn hot lookups (PO number dedup, Cleo message
--    dedup) into index scans instead of sequential scans.

-- ── 1. credit_balances: security_invoker ──────────────────────────────────────
alter view if exists credit_balances set (security_invoker = true);

-- ── 2. documents bucket: restore MIME allowlist ───────────────────────────────
update storage.buckets
   set allowed_mime_types = array[
     'application/pdf',
     'image/jpeg',
     'image/png',
     'image/webp',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', -- xlsx
     'application/vnd.ms-excel',                                          -- xls
     'message/rfc822',                                                    -- raw email
     'text/html',                                                         -- email body / Rithum HTML
     'text/plain',
     'application/octet-stream'                                           -- email pipeline raw blobs
   ]
 where id = 'documents';

-- ── 3. Indexes for frequent equality lookups ──────────────────────────────────
create index if not exists order_drafts_tenant_po_idx
  on order_drafts (tenant_id, po_number)
  where po_number is not null;

-- cleo_orders already has UNIQUE(tenant_id, cleo_message_id) which implies an index.

-- ── 4. Restrict email_ingest_sources to owners ────────────────────────────────
-- settings.webhook_secret (Microsoft Graph) is stored unencrypted. The
-- previous policy allowed any tenant member to read it. Owners-only
-- prevents non-admin members from harvesting webhook secrets.
do $$
begin
  if exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename  = 'email_ingest_sources'
       and policyname = 'email_ingest_sources: members all'
  ) then
    drop policy "email_ingest_sources: members all" on email_ingest_sources;
  end if;
end$$;

create policy "email_ingest_sources: owners all" on email_ingest_sources
  for all
  using (
    exists (
      select 1 from tenant_members tm
       where tm.tenant_id = email_ingest_sources.tenant_id
         and tm.user_id = auth.uid()
         and tm.role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from tenant_members tm
       where tm.tenant_id = email_ingest_sources.tenant_id
         and tm.user_id = auth.uid()
         and tm.role = 'owner'
    )
  );
