-- Fix cron jobs that had placeholder tokens embedded at schedule-time.
--
-- Root cause: previous migrations used format() + %L to embed vault secrets
-- into the cron command string at cron.schedule() call time. If the vault
-- secret had a placeholder value when the migration ran, that placeholder
-- became permanently baked into the stored cron command.
--
-- Fix: reschedule all three crons so that the vault lookup happens at
-- EXECUTION TIME (inside the cron SQL itself), not at schedule time.
-- This is the correct production pattern — secrets can rotate and crons
-- will always pick up the current value without needing to be rescheduled.

do $$
declare
  project_url text;
begin
  -- Verify vault has a real project URL before touching anything
  select decrypted_secret into project_url
    from vault.decrypted_secrets
   where name = 'intake_project_url'
   order by created_at desc
   limit 1;

  if project_url is null or project_url ilike '%PEGA_AQUI%' then
    raise exception
      'Vault secret intake_project_url is missing or still a placeholder. Set it before running this migration.';
  end if;
end $$;

-- ── 1. janitor-uploads (every 15 min) ────────────────────────────────────────
do $$
declare job_name constant text := 'intake-janitor-uploads-every-15m';
begin
  if exists (select 1 from cron.job where jobname = job_name) then
    perform cron.unschedule(job_name);
  end if;

  perform cron.schedule(
    job_name,
    '*/15 * * * *',
    $sql$
    select net.http_post(
      url := (
        select rtrim(decrypted_secret, '/')
          from vault.decrypted_secrets
         where name = 'intake_project_url'
         order by created_at desc limit 1
      ) || '/functions/v1/janitor-uploads',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
            from vault.decrypted_secrets
           where name = 'intake_service_role_key'
           order by created_at desc limit 1
        )
      ),
      body := '{"source":"pg_cron"}'::jsonb
    );
    $sql$
  );
end $$;

-- ── 2. graph-subscription-renew (every 6 hours) ──────────────────────────────
do $$
declare job_name constant text := 'intake-graph-subscription-renew-every-6h';
begin
  if exists (select 1 from cron.job where jobname = job_name) then
    perform cron.unschedule(job_name);
  end if;

  perform cron.schedule(
    job_name,
    '17 */6 * * *',
    $sql$
    select net.http_post(
      url := (
        select rtrim(decrypted_secret, '/')
          from vault.decrypted_secrets
         where name = 'intake_project_url'
         order by created_at desc limit 1
      ) || '/functions/v1/graph-subscription-renew',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
            from vault.decrypted_secrets
           where name = 'intake_service_role_key'
           order by created_at desc limit 1
        )
      ),
      body := '{"source":"pg_cron"}'::jsonb
    );
    $sql$
  );
end $$;

-- ── 3. email-imap-poll (every 3 min) — kept active even if no IMAP sources ──
do $$
declare job_name constant text := 'intake-email-imap-poll-every-3m';
begin
  if exists (select 1 from cron.job where jobname = job_name) then
    perform cron.unschedule(job_name);
  end if;

  perform cron.schedule(
    job_name,
    '*/3 * * * *',
    $sql$
    select net.http_post(
      url := (
        select rtrim(decrypted_secret, '/')
          from vault.decrypted_secrets
         where name = 'intake_project_url'
         order by created_at desc limit 1
      ) || '/functions/v1/email-ingest-imap-poll',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
            from vault.decrypted_secrets
           where name = 'intake_service_role_key'
           order by created_at desc limit 1
        )
      ),
      body := '{"source":"pg_cron"}'::jsonb
    );
    $sql$
  );
end $$;
