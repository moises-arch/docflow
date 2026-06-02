-- Versionado de prompts del pipeline IA.
--
-- Cada prompt (system-extractor, boundary-detection) tiene N versiones; una
-- está activa. La edge function lee la versión activa de aquí en cada request
-- (con caché in-memory de ~5 min). El admin puede hacer rollback desde la UI
-- (cambia la versión activa) pero NO editar — las versiones nuevas se crean
-- vía migration desde el código, no desde UI.
--
-- Diseño global (no per-tenant): el prompt es del sistema, no del cliente.
-- Una sola versión activa por prompt_id; partial unique index lo asegura.

create table prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_id text not null check (prompt_id in ('system-extractor', 'boundary-detection')),
  version_label text not null,                 -- 'v5', 'v6', 'v6.1', etc.
  content text not null,                       -- el prompt template completo
  model text not null,                         -- 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'
  max_tokens int not null,
  description text,                            -- changelog corto: qué cambió
  is_active boolean not null default false,
  created_by_email text,                       -- audit trail
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  activated_by_email text,
  unique (prompt_id, version_label)
);

-- Una sola versión activa por prompt_id.
create unique index prompt_versions_one_active_per_prompt
  on prompt_versions (prompt_id)
  where is_active = true;

create index prompt_versions_prompt_idx
  on prompt_versions (prompt_id, created_at desc);

-- RLS: lectura para autenticados; escritura solo service role (server-side).
alter table prompt_versions enable row level security;

create policy "prompt_versions: authenticated read"
  on prompt_versions
  for select
  using (auth.role() = 'authenticated');

-- No políticas de INSERT/UPDATE/DELETE — solo el service role (que las
-- bypassa) puede modificar la tabla. Las migrations también la modifican
-- porque corren con el service role.

comment on table prompt_versions is
  'Versionado de prompts del pipeline IA. Una sola versión activa por prompt_id. Las nuevas versiones se crean vía migration; el rollback se hace desde la UI cambiando is_active.';
