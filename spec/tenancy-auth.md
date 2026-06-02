# Tenancy & Auth

## Purpose

Define how users authenticate, how tenants are isolated, and how per-tenant secrets (specifically ERP credentials) are stored and used.

## Responsibilities

- Authentication flow against Supabase Auth.
- Tenant resolution in Next.js and Edge Functions.
- Role model (owner, member) and where each matters.
- Per-tenant secret storage (encryption, retrieval, rotation).
- Session lifecycle, timeouts, sign-out.

## Model

- **Tenant** = a company (organization) using DocFlow.
- **User** = a Supabase `auth.users` row.
- **Membership** = `tenant_members` row linking a user to a tenant with a role.
- A user may belong to **multiple** tenants (supported from day one; switcher in UI is deferred but the data model allows it).
- Exactly **one active tenant per session** — stored in a server cookie.

## Authentication

### Provider: Supabase Auth

- **Sign-up**: disabled for self-service in Phase 1. Tenants onboard via an internal provisioning script (creates tenant + owner + invitation). Open sign-up is a deferred decision.
- **Sign-in**: email + password. MFA deferred. Magic links deferred (easy to add later, not a Phase 1 requirement).
- **Session**: Supabase default (JWT + refresh token, cookie-based via `@supabase/ssr`).
- **Expiry**: access token 1h, refresh 7 days. Rolling refresh on Server Component request.
- **Sign-out**: clears cookies + invalidates refresh token.

### Invitations (Phase 1 minimal)

- An owner can invite a user by email from Settings.
- Invitation creates a pending `tenant_members` row (or a separate `tenant_invites` row — open; pick in migration).
- The invitee receives a Supabase magic link; first sign-in resolves membership.

## Tenant resolution

Every authenticated request must resolve an **active tenant**. The path:

1. Next.js middleware reads the session cookie.
2. Middleware reads the `active_tenant_id` cookie (set at sign-in, or on tenant switch).
3. If the cookie is missing or invalid, middleware redirects to `/select-tenant`.
4. The resolved `tenant_id` is attached to `request.headers['x-tenant-id']` for server-side consumption.

Safety rails:

- `x-tenant-id` from the browser is **ignored**. It is set server-side only.
- Every server action and route handler re-verifies `is_tenant_member(tenant_id, user_id)` before executing. Never trust the cookie alone.
- RLS in Postgres enforces this at the data layer too (defense in depth). See [data.md](./data.md#rls-summary).

### In Edge Functions

Edge Functions receive `{ tenant_id, user_id, run_id }` explicitly in the payload and re-verify membership before any work. They use the **service role** key (bypasses RLS) and therefore must include `tenant_id` in every query — verified by code review.

## Roles

Phase 1 has two roles:

| Role     | Can                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------- |
| `owner`  | Everything a `member` can, plus: invite/remove members, edit ERP connection, view audit logs. |
| `member` | Upload, review, approve, edit mappings, trigger ERP push.                                     |

Role gates live in:

- RLS policies ([data.md](./data.md)).
- Server-side guards in Next.js route handlers.
- UI render (hide admin-only controls) — **not** a security boundary, only UX.

Future roles (viewer, approver-only) are out of scope for Phase 1.

## Per-tenant secrets

### The problem

Each tenant's ERP credentials (URL, DB name, username, API key) must be accessible only to:

- Edge Functions doing a sync for that tenant.
- Owners of that tenant, when configuring.

They must **not** be readable by:

- Other tenants (obvious).
- Browser clients (ever — even own tenant).
- Unauthenticated code paths.

### Storage

- Table: `odoo_connections` (see [data.md](./data.md#odoo_connections)).
- `api_key_enc bytea` holds the **encrypted** API key.
- Plaintext key is **never** stored.

### Encryption

- Symmetric encryption using **libsodium** `crypto_secretbox` (or pgsodium if we accept the Supabase extension).
- The master key (`INTAKE_SECRETS_KEY`) is stored in Supabase Edge Function secrets — **not** in the database.
- Encryption happens in the Edge Function when owner saves credentials (via a `save-odoo-connection` function — never client-side).
- Decryption happens in the `odoo-sync` Edge Function at push time.

### Access pattern

```
Owner saves credentials in UI
   │
   ▼
Next.js route handler forwards to Edge Function `save-odoo-connection`
   │
   ▼
Edge Function encrypts api_key with INTAKE_SECRETS_KEY and writes api_key_enc
   │
   ▼
(later) odoo-sync Edge Function reads api_key_enc, decrypts, makes JSON-RPC call
```

- Browser never sees the encrypted key on read. For display, the UI shows a masked placeholder (`••••••••`) and an "Update" action that opens a fresh input.
- Round-trip test: owner clicks "Test connection" → Edge Function decrypts + pings ERP `/version` → returns `status = 'active'` or `status = 'error'` with an i18n error code.

### Rotation

- If `INTAKE_SECRETS_KEY` is rotated, a migration re-encrypts all `api_key_enc` rows with the new key. The DB stores a `key_version` byte prefix on the ciphertext so decryption knows which key to use.
- Tenants can rotate their ERP API key via the UI; a new encrypt+save replaces the old ciphertext.

## Storage paths

Supabase Storage is tenant-scoped by path convention:

```
documents/
  {tenant_id}/
    {document_id}/
      original.pdf
```

Storage RLS policy (on `storage.objects`):

```sql
create policy tenant_read on storage.objects
  for select using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (
      select tenant_id::text from tenant_members
       where user_id = auth.uid() limit 1
    )
  );
```

(Generalized for multi-tenant membership — actual policy joins `tenant_members`.) Edge Functions use service role for writes.

## i18n

- User-facing error messages from auth flows are i18n keys (e.g. `auth.error.invalid_credentials`).
- Invitation emails are bilingual — the tenant's `locale` determines the email template.

## Edge cases

- **User belongs to zero tenants.** Redirect to an "awaiting invitation" screen. Don't 404.
- **User's membership revoked mid-session.** Next request fails RLS; middleware catches and signs them out with a message.
- **Session cookie valid but `active_tenant_id` points to a tenant they're no longer in.** Middleware resets cookie and redirects to `/select-tenant`.
- **Owner deletes themselves.** Blocked — a tenant must always have at least one owner.
- **Supabase Auth outage.** App degrades to a friendly error page; no silent data access.
- **Edge Function gets a `tenant_id` that doesn't match the invoking user.** Function rejects with 403 and emits a `workflow_events` row with `outcome='fail', error_code='tenancy_mismatch'`.

## Failure scenarios

- **Lost `INTAKE_SECRETS_KEY`.** All `api_key_enc` rows become unusable — operators must re-enter ERP credentials. Key is backed up in a separate vault; rotation is drill-tested quarterly.
- **Stolen service-role key.** Catastrophic — all tenant data is readable. Mitigation: service-role key lives only in Edge Function secrets, never checked into source, rotated on suspicion. Alerting on any service-role use from unexpected IPs (post-Phase-1 hardening).
- **RLS bypass bug.** Caught by pgTAP tests (see [data.md](./data.md#rls-summary)) as a CI gate.

## Success criteria

- A tenant-A user cannot read any tenant-B row by any code path (browser client, server component, route handler). Provable by pgTAP tests.
- ERP credentials are never visible in plaintext outside an Edge Function's memory.
- Sign-in/sign-out/invitation flows work in both English and Spanish.

## Dependencies

- Supabase Auth enabled.
- `@supabase/ssr` in Next.js for cookie-based sessions.
- `INTAKE_SECRETS_KEY` provisioned in Edge Function secrets (and backed up).
- [data.md](./data.md) for table definitions and RLS policies.
- [architecture.md](./architecture.md) for where each component runs.
