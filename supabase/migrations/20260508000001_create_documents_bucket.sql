-- Create the "documents" storage bucket for PDF/image uploads.
-- Idempotent: does nothing if already exists.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  52428800, -- 50MB
  array[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;

-- RLS: tenants can only access their own files (prefixed by tenant_id/)
create policy "tenant upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select tenant_id::text from public.tenant_members
      where user_id = auth.uid()
    )
  );

create policy "tenant read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select tenant_id::text from public.tenant_members
      where user_id = auth.uid()
    )
  );

create policy "tenant delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select tenant_id::text from public.tenant_members
      where user_id = auth.uid()
    )
  );

-- Service role can access all (for edge functions)
create policy "service role full access"
  on storage.objects
  to service_role
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');
