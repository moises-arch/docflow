-- Allow image uploads in Inbox manual upload flow.
-- Keeps the same 25 MiB limit and private bucket behavior.

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]
where id = 'documents';
