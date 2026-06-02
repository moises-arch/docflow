-- ─────────────────────────────────────────────────────────────────────────────
-- Storage — documents bucket
-- ─────────────────────────────────────────────────────────────────────────────
-- Private bucket. Path: {tenant_id}/{YYYY-MM}/{uuid}.pdf
-- Phase 1: all writes go through the Next.js API route (service role).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  26214400,  -- 25 MiB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS policies (defence-in-depth) ──────────────────────────────────────────

CREATE POLICY "Tenant members can read their documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT tm.tenant_id::text
      FROM   tenant_members tm
      WHERE  tm.user_id = auth.uid()
      LIMIT  1
    )
  );

CREATE POLICY "Tenant members can upload their documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT tm.tenant_id::text
      FROM   tenant_members tm
      WHERE  tm.user_id = auth.uid()
      LIMIT  1
    )
  );

CREATE POLICY "Tenant members can delete their documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT tm.tenant_id::text
      FROM   tenant_members tm
      WHERE  tm.user_id = auth.uid()
      LIMIT  1
    )
  );
