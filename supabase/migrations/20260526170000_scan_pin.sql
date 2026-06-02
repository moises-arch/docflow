-- PIN de 4 dígitos para acceso al QR mobile. Stored as a salted SHA-256 hash
-- (hex). The PIN space is small (10k options) so we MUST rely on rate
-- limiting at the verify endpoint, not crypto strength alone.
--
-- Nullable: PIN is optional. If null, /scan/[token] entra directo (back-compat
-- con todos los QRs que ya existen). Cuando un admin configure el PIN, todos
-- los scan tokens del tenant pasan a requerirlo.

alter table public.tenants
  add column if not exists scan_pin_hash text,
  add column if not exists scan_pin_salt text,
  add column if not exists scan_pin_updated_at timestamptz;

comment on column public.tenants.scan_pin_hash is
  'SHA-256(pin || salt) en hex. NULL = PIN deshabilitado.';
comment on column public.tenants.scan_pin_salt is
  'Salt random 32-byte hex generado al setear el PIN.';
