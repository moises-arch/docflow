-- Schedule janitor-uploads every 15 minutes via pg_cron + pg_net.
-- Requires two secrets in vault.decrypted_secrets:
--   - intake_project_url        (e.g. https://<project-ref>.supabase.co)
--   - intake_service_role_key   (service role key for Edge Function auth)

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
declare
  job_name constant text := 'intake-janitor-uploads-every-15m';
  project_url text;
  service_role_key text;
  request_url text;
begin
  select decrypted_secret
    into project_url
    from vault.decrypted_secrets
   where name = 'intake_project_url'
   order by created_at desc
   limit 1;

  select decrypted_secret
    into service_role_key
    from vault.decrypted_secrets
   where name = 'intake_service_role_key'
   order by created_at desc
   limit 1;

  if project_url is null or service_role_key is null then
    raise warning
      'Skipping cron schedule for %: missing vault secret(s) intake_project_url and/or intake_service_role_key',
      job_name;
    return;
  end if;

  request_url := rtrim(project_url, '/') || '/functions/v1/janitor-uploads';

  if exists (select 1 from cron.job where jobname = job_name) then
    perform cron.unschedule(job_name);
  end if;

  perform cron.schedule(
    job_name,
    '*/15 * * * *',
    format(
      $cron$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', %L
        ),
        body := '{"source":"pg_cron"}'::jsonb
      ) as request_id;
      $cron$,
      request_url,
      'Bearer ' || service_role_key
    )
  );
end $$;
