-- Auto-renew Microsoft Graph email subscriptions every 6 hours.
-- Graph mailbox subscriptions max out at ~70.5h; renewal window is 24h before
-- expiry. Uses the same vault secrets as the other Intake cron jobs.

do $$
declare
  job_name constant text := 'intake-graph-subscription-renew-every-6h';
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

  request_url := rtrim(project_url, '/') || '/functions/v1/graph-subscription-renew';

  if exists (select 1 from cron.job where jobname = job_name) then
    perform cron.unschedule(job_name);
  end if;

  perform cron.schedule(
    job_name,
    '17 */6 * * *',
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
