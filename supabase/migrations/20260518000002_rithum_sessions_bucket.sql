-- Bucket privado para cachear el storageState de Playwright entre
-- ejecuciones del scraper de Rithum. Una sesión válida ahorra el
-- login completo (Auth0 two-step) en la siguiente corrida, lo que
-- reduce la exposición a Cloudflare/Auth0 y baja la tasa de fallas.
--
-- Path convention: <tenant_id>/state.json
-- File size: ~5-30KB (cookies + localStorage). Limit 512KB por
-- seguridad si el portal alguna vez agrega payloads grandes.
insert into storage.buckets (id, name, public, file_size_limit)
values ('rithum-sessions', 'rithum-sessions', false, 524288)
on conflict (id) do nothing;
