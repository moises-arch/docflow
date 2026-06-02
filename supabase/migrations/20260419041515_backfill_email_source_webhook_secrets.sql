update public.email_ingest_sources
set settings =
  coalesce(settings, '{}'::jsonb)
  || jsonb_build_object(
    'adapter',
    coalesce(settings->>'adapter', 'mailgun'),
    'webhook_secret',
    replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
  )
where settings->>'webhook_secret' is null;
