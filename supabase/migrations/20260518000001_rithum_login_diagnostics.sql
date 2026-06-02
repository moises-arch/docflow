-- Diagnóstico estructurado de fallos de login en Rithum.
--
-- last_error: ya existía, ahora guarda solo el mensaje corto categorizado
--   (ej. "rithum_login_failed:captcha_challenge").
-- last_error_code: código corto sin prefijo (ej. "captcha_challenge",
--   "invalid_credentials", "cloudflare_challenge", "mfa_required",
--   "account_locked", "password_submit_failed", "dashboard_not_reached",
--   "redirect_loop", "session_expired", "unknown"). Permite filtrar y
--   agrupar fallos por categoría en el historial.
-- last_error_diagnostics: dump completo del intento fallido — url, title,
--   body snippet, cookies, errores de red recientes y selectores
--   detectados. Pensado para post-mortem cuando aparezca un nuevo modo
--   de falla que aún no esté categorizado.
-- failure_screenshot_path: storage path del screenshot en
--   intake-debug bucket (puede ser null si la captura falló).

alter table rithum_orders
  add column if not exists last_error_code text,
  add column if not exists last_error_diagnostics jsonb,
  add column if not exists failure_screenshot_path text;

create index if not exists rithum_orders_last_error_code_idx
  on rithum_orders (tenant_id, last_error_code, updated_at desc)
  where last_error_code is not null;

-- Bucket privado para guardar screenshots y dumps de HTML de fallos
-- de scraping. No es público — sólo el service role lo lee.
insert into storage.buckets (id, name, public, file_size_limit)
values ('rithum-diagnostics', 'rithum-diagnostics', false, 2097152)
on conflict (id) do nothing;

