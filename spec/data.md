# Data

## Purpose

Define every persistent entity, its Postgres schema, its indexes, and its RLS policy — in one place. If a piece of state is referenced by any other spec, it lives here.

## Responsibilities

- Name and shape every table.
- Document every state machine (document lifecycle, ERP sync state).
- Declare RLS policies inline per table — **no separate RLS file**, to prevent drift.
- Define conventions all tables must follow.

## Conventions

- Every table: `id uuid primary key default gen_random_uuid()`.
- Every tenant-scoped table: `tenant_id uuid not null references tenants(id)`.
- Timestamps on every table: `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` (updated by trigger).
- No soft deletes in Phase 1. If a row shouldn't be visible, move it to a dedicated `archived_*` state column.
- JSONB used for schema-lite data (extractions, event metadata). Versioned via `schema_version int`.
- All monetary amounts: `numeric(18,4)`, currency in a sibling `*_currency char(3)`.
- All timestamps are `timestamptz`. UI converts to tenant display TZ.

## Entity relationships (text)

```
tenants ──< tenant_members >── users (Supabase auth.users)
tenants ──< odoo_connections
tenants ──< providers ──< provider_detection_rules
                 │
                 ├──< provider_field_mappings >── target_fields
                 └──< provider_product_mappings
tenants ──< odoo_products
tenants ──< email_ingest_sources ──< inbound_emails ──< inbound_email_attachments
tenants ──< documents ──< document_pages
                 │
                 └──< extractions (1:1 latest) ──< order_drafts ──< order_draft_lines
                                                        │
                                                        └──< odoo_sync_attempts
tenants ──< customer_mappings
tenants ──< product_mappings
tenants ──< credit_ledger
tenants ──< workflow_events
```

## State machines

### Document lifecycle (`documents.state`)

```
uploaded ──► processing ──► needs_review ──► reviewed ──► archived
                │                  │
                ▼                  ▼
         failed_processing    rejected
         (retriable)          (manual, terminal in Phase 1)
```

- `uploaded` — file stored, not yet processed.
- `processing` — `ai-process` holds an advisory lock on the row.
- `needs_review` — extraction complete, awaiting human.
- `reviewed` — human approved; ready for (or already attempted) ERP sync.
- `failed_processing` — AI pipeline failed after retries. Operator can retry or reject.
- `rejected` — operator explicitly rejected (wrong document, duplicate, etc).
- `archived` — hidden from Inbox but retained.

### ERP sync state (`order_drafts.sync_state`) — **distinct from document state**

```
none ──► pending ──► in_progress ──► synced
                          │
                          ▼
                     sync_failed ──► pending (on retry)
```

A document can be `reviewed` with `sync_state = none` (operator approved but hasn't pushed) or `sync_failed` (pushed, ERP rejected it). See [README.md](./README.md#state-separation) and [workflows/odoo-sync.md](./workflows/odoo-sync.md).

---

## Tables

### `tenants`

The organization that owns data.

```sql
create table tenants (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  locale          text not null default 'en',        -- 'en' | 'es'
  display_tz      text not null default 'UTC',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

**RLS:** enabled. Policy: a user can `select` a tenant iff they are a member of it. No direct insert/update/delete from clients — tenant creation goes through a server action.

### `tenant_members`

Links Supabase `auth.users` to tenants with a role.

```sql
create table tenant_members (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner','member')),
  created_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index on tenant_members (user_id);
```

**RLS:** `select` where `user_id = auth.uid()` OR user is an owner of the tenant. Inserts/updates restricted to owners.

### `odoo_connections`

Per-tenant ERP credentials. One row per tenant in Phase 1 (single ERP instance).

```sql
create table odoo_connections (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null unique references tenants(id) on delete cascade,
  base_url        text not null,
  database        text not null,           -- ERP DB name
  username        text not null,
  api_key_enc     bytea not null,          -- encrypted; see tenancy-auth.md
  status          text not null default 'unverified'
                  check (status in ('unverified','active','error')),
  last_checked_at timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

**RLS:** `select`/`update` restricted to owners of the tenant. Edge Functions use service role. See [tenancy-auth.md](./tenancy-auth.md) for encryption.

### `documents`

One uploaded PO.

```sql
create table documents (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  uploaded_by     uuid not null references auth.users(id),
  storage_path    text not null,                -- 'tenant_id/doc_id/filename.pdf'
  original_name   text not null,
  mime_type       text not null,
  size_bytes      bigint not null,
  page_count      int,                          -- set after OCR
  provider_id     uuid references providers(id),-- detected owner/distributor of the PO; optional
  source_channel  text not null default 'upload'
                  check (source_channel in ('upload','email','api')),
  source_ref      text,                         -- e.g. inbound_emails.id, API idempotency key
  source_meta     jsonb not null default '{}',
  state           text not null default 'uploaded'
                  check (state in (
                    'uploaded','processing','needs_review',
                    'reviewed','failed_processing','rejected','archived'
                  )),
  last_error      text,
  processing_run_id uuid,                       -- current/last ai-process run
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on documents (tenant_id, state, created_at desc);
create index on documents (tenant_id, uploaded_by);
create index on documents (tenant_id, provider_id, created_at desc);
create index on documents (tenant_id, source_channel, created_at desc);
```

**RLS:** `select`/`update` where user is a member of the tenant. `insert` restricted — documents are created by the `ingest` Edge Function (service role).

### `document_pages`

Per-page classification output. One row per page.

```sql
create table document_pages (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  document_id     uuid not null references documents(id) on delete cascade,
  page_number     int not null,
  page_type       text not null
                  check (page_type in (
                    'cover','body','line_items','signature','legal','blank','duplicate','other'
                  )),
  is_relevant     boolean not null,             -- used in credit calculation
  confidence      numeric(4,3),                 -- 0–1
  meta            jsonb not null default '{}',  -- OCR bbox, detected language, etc
  created_at      timestamptz not null default now(),
  unique (document_id, page_number)
);
create index on document_pages (tenant_id, document_id);
```

**RLS:** `select` where user is a member of the tenant. Inserts by service role only.

### `extractions`

The AI extraction output for a document. Versioned — we keep prior runs for audit but `current = true` marks the active one.

```sql
create table extractions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  document_id     uuid not null references documents(id) on delete cascade,
  run_id          uuid not null,
  schema_version  int not null default 1,
  payload         jsonb not null,              -- raw structured extraction (pre-normalize)
  normalized      jsonb not null,              -- post-normalize, canonical shape
  model_meta      jsonb not null default '{}', -- which model, tokens, etc
  confidence      numeric(4,3),
  current         boolean not null default true,
  created_at      timestamptz not null default now()
);
create unique index on extractions (document_id) where current = true;
create index on extractions (tenant_id, document_id, created_at desc);
```

**Canonical `normalized` shape** (schema_version 1):

```jsonc
{
  "po_number": "string",
  "po_date": "YYYY-MM-DD",
  "currency": "USD",
  "buyer": { "name": "string", "tax_id": "string?", "email": "string?" },
  "shipping_address": { "line1": "...", "city": "...", "country": "...", ... },
  "billing_address": { /* same */ },
  "line_items": [
    {
      "position": 1,
      "sku": "string?",
      "description": "string",
      "quantity": 10,
      "unit": "each" | "kg" | "...",
      "unit_price": 12.50,
      "line_total": 125.00,
      "tax_rate": 0.16
    }
  ],
  "subtotal": 125.00,
  "tax_total": 20.00,
  "total": 145.00,
  "notes": "string?"
}
```

**RLS:** `select` where user is a member of the tenant. Writes by service role only.

### `order_drafts`

The user-editable representation of an extraction. Created at end of AI pipeline and updated through review. One-to-one with the current extraction.

```sql
create table order_drafts (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  document_id        uuid not null unique references documents(id) on delete cascade,
  extraction_id      uuid not null references extractions(id),
  po_number          text,
  po_date            date,
  currency           char(3),
  buyer              jsonb not null default '{}',
  shipping_address   jsonb not null default '{}',
  billing_address    jsonb not null default '{}',
  notes              text,
  subtotal           numeric(18,4),
  tax_total          numeric(18,4),
  total              numeric(18,4),

  provider_id         uuid references providers(id),
  customer_mapping_id uuid references customer_mappings(id),  -- resolved at review or sync
  sync_state          text not null default 'none'
                      check (sync_state in ('none','pending','in_progress','synced','sync_failed')),
  odoo_so_id          int,                          -- ERP sale.order id on success
  odoo_so_name        text,                         -- e.g. 'S00123'
  last_sync_error     text,

  approved_by         uuid references auth.users(id),
  approved_at         timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on order_drafts (tenant_id, sync_state);
create index on order_drafts (tenant_id, approved_at desc);
create index on order_drafts (tenant_id, provider_id, created_at desc);
```

**RLS:** `select`/`update` where user is a tenant member. Only `member`/`owner` roles can update; no deletes.

### `order_draft_lines`

Line items on a draft.

```sql
create table order_draft_lines (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  order_draft_id      uuid not null references order_drafts(id) on delete cascade,
  position            int not null,
  sku                 text,
  description         text not null,
  quantity            numeric(18,4) not null,
  unit                text,
  unit_price          numeric(18,4),
  line_total          numeric(18,4),
  tax_rate            numeric(6,4),

  product_mapping_id  uuid references product_mappings(id),
  odoo_product_id     int,                    -- cached after sync attempt

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (order_draft_id, position)
);
create index on order_draft_lines (tenant_id, order_draft_id);
```

**RLS:** same as `order_drafts`.

### `providers`

A provider is the distributor/customer-specific document format owner. A provider is not the ERP customer itself in every case; it is the source profile used to detect incoming orders, interpret field names, and apply SKU mappings.

```sql
create table providers (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  name             text not null,
  code             text not null,                 -- stable slug, unique per tenant
  status           text not null default 'active'
                   check (status in ('active','paused','archived')),
  default_currency char(3),
  email_domains    text[] not null default '{}',
  settings         jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, code)
);
create index on providers (tenant_id, status, name);
```

**RLS:** tenant members read/write. Archived providers are retained so old documents keep their audit trail.

### `provider_detection_rules`

Rules used to infer `documents.provider_id`. Detection is best-effort and must never block processing. If no provider is confidently detected, the document still reaches Review with `provider_id = null`.

```sql
create table provider_detection_rules (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  provider_id uuid not null references providers(id) on delete cascade,
  rule_type   text not null check (rule_type in (
                'email_domain','sender_email','subject_contains',
                'filename_contains','extracted_field','keyword'
              )),
  field_path  text,                              -- for extracted_field, e.g. buyer.name
  pattern     text not null,
  priority    int not null default 100,
  confidence  numeric(4,3) not null default 0.800,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index on provider_detection_rules
  (provider_id, rule_type, coalesce(field_path, ''), pattern);
create index on provider_detection_rules (tenant_id, active, rule_type, priority);
```

**RLS:** tenant members read/write.

### `target_fields`

Tenant-configurable list of ERP destination fields. These are the fields DocFlow must produce or allow the operator to fill before sync. Admins can add/remove non-system fields and mark each as required.

```sql
create table target_fields (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  key           text not null,                   -- stable app key, e.g. po_number
  label         text not null,
  scope         text not null check (scope in ('header','line','partner','shipping','billing')),
  odoo_model    text not null,                   -- sale.order, sale.order.line, res.partner
  odoo_field    text not null,
  value_type    text not null default 'text'
                check (value_type in ('text','number','date','currency','boolean','json')),
  required      boolean not null default false,
  active        boolean not null default true,
  system        boolean not null default false,  -- core field; can be disabled only by app rules
  sort_order    int not null default 100,
  default_value jsonb,
  validation    jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, key)
);
create index on target_fields (tenant_id, scope, active, sort_order);
```

**RLS:** tenant members read/write. Server-side sync must validate required active target fields before creating an ERP SO.

Default system target fields are created for existing tenants by migration and should be created for new tenants during onboarding:

| Key                | Scope  | ERP field                        | Required |
| ------------------ | ------ | --------------------------------- | -------- |
| `partner_id`       | header | `sale.order.partner_id`           | yes      |
| `client_order_ref` | header | `sale.order.client_order_ref`     | yes      |
| `date_order`       | header | `sale.order.date_order`           | no       |
| `currency_id`      | header | `sale.order.currency_id`          | no       |
| `note`             | header | `sale.order.note`                 | no       |
| `product_id`       | line   | `sale.order.line.product_id`      | yes      |
| `product_uom_qty`  | line   | `sale.order.line.product_uom_qty` | yes      |
| `price_unit`       | line   | `sale.order.line.price_unit`      | no       |
| `name`             | line   | `sale.order.line.name`            | yes      |
| `tax_id`           | line   | `sale.order.line.tax_id`          | no       |

### `provider_field_mappings`

Maps a provider-specific source field to a tenant target field.

```sql
create table provider_field_mappings (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  provider_id        uuid not null references providers(id) on delete cascade,
  target_field_id    uuid not null references target_fields(id) on delete cascade,
  source_field_key   text not null,              -- e.g. item_code, customer_sku
  source_field_label text,
  required_override  boolean,                    -- null means use target_fields.required
  active             boolean not null default true,
  transform          jsonb not null default '{}', -- trim, uppercase, parse_date, etc.
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (provider_id, target_field_id)
);
create index on provider_field_mappings (provider_id, active);
```

**RLS:** tenant members read/write.

### `odoo_products`

Cached ERP product catalog. The mapping UI should show all ERP products by default from this table, then allow provider-specific aliases.

```sql
create table odoo_products (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  odoo_product_id int not null,
  name            text not null,
  default_code    text,
  barcode         text,
  uom_name        text,
  sale_ok         boolean not null default true,
  active          boolean not null default true,
  raw             jsonb not null default '{}',
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, odoo_product_id)
);
create index on odoo_products (tenant_id, default_code) where default_code is not null;
create index on odoo_products (tenant_id, name);
```

**RLS:** tenant members read. Writes by service role during ERP catalog sync.

### `provider_product_mappings`

Provider-specific product aliases. This supersedes global `product_mappings` for new work. Existing `product_mappings` can remain as a tenant-wide fallback.

```sql
create table provider_product_mappings (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  provider_id         uuid not null references providers(id) on delete cascade,
  source_sku          text,                      -- provider SKU
  source_company_sku  text,                      -- our/company SKU when present on the PO
  source_description  text,
  odoo_product_id     int not null,
  odoo_product_name   text not null,
  odoo_default_code   text,
  default_uom         text,
  default_tax_rate    numeric(6,4),
  confidence          numeric(4,3) not null default 1.0,
  source              text not null default 'manual'
                      check (source in ('manual','auto','imported','odoo_catalog')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (source_sku is not null or source_company_sku is not null or source_description is not null)
);
create unique index on provider_product_mappings (provider_id, source_sku) where source_sku is not null;
create unique index on provider_product_mappings (provider_id, source_company_sku) where source_company_sku is not null;
create index on provider_product_mappings (provider_id, source_description) where source_description is not null;
```

**RLS:** tenant members read/write.

### `email_ingest_sources`, `inbound_emails`, `inbound_email_attachments`

Email ingest records incoming messages before they become documents. Attachments and HTML bodies can each create one or more `documents` rows.

```sql
create table email_ingest_sources (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  provider_id     uuid references providers(id) on delete set null,
  address         text not null,
  status          text not null default 'active'
                  check (status in ('active','paused','archived')),
  allowed_senders text[] not null default '{}',
  settings        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, address)
);

create table inbound_emails (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  ingest_source_id  uuid references email_ingest_sources(id) on delete set null,
  provider_id       uuid references providers(id) on delete set null,
  message_id        text not null,
  from_email        text not null,
  from_name         text,
  subject           text,
  received_at       timestamptz not null default now(),
  state             text not null default 'received'
                    check (state in ('received','parsed','processing','processed','failed','ignored')),
  raw_storage_path  text,
  html_storage_path text,
  text_storage_path text,
  error_code        text,
  error_message     text,
  meta              jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, message_id)
);

create table inbound_email_attachments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  inbound_email_id uuid not null references inbound_emails(id) on delete cascade,
  document_id      uuid references documents(id) on delete set null,
  storage_path     text not null,
  original_name    text not null,
  mime_type        text not null,
  size_bytes       bigint not null,
  disposition      text,
  meta             jsonb not null default '{}',
  created_at       timestamptz not null default now()
);
```

**RLS:** tenant members read. Email writes are service-role-only.

### `customer_mappings`

Learned mapping from "buyer as seen on POs" → ERP `res.partner` id.

```sql
create table customer_mappings (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  match_key          text not null,               -- normalized buyer name or tax id
  odoo_partner_id    int not null,
  odoo_partner_name  text not null,
  confidence         numeric(4,3) not null default 1.0,
  source             text not null default 'manual'
                     check (source in ('manual','auto','imported')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, match_key)
);
```

**RLS:** tenant members read/write.

### `product_mappings`

Same idea for products. Keyed on SKU first, falls back on normalized description.

```sql
create table product_mappings (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  match_sku          text,
  match_description  text,
  odoo_product_id    int not null,
  odoo_product_name  text not null,
  default_uom        text,
  default_tax_rate   numeric(6,4),
  confidence         numeric(4,3) not null default 1.0,
  source             text not null default 'manual'
                     check (source in ('manual','auto','imported')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (match_sku is not null or match_description is not null)
);
create unique index on product_mappings (tenant_id, match_sku) where match_sku is not null;
create index on product_mappings (tenant_id, match_description) where match_description is not null;
```

**RLS:** tenant members read/write.

### `odoo_sync_attempts`

Audit log of every push attempt.

```sql
create table odoo_sync_attempts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  order_draft_id  uuid not null references order_drafts(id) on delete cascade,
  attempt_key     text not null,             -- idempotency key
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  outcome         text check (outcome in ('success','error')),
  odoo_so_id      int,
  error_code      text,
  error_message   text,
  request_meta    jsonb not null default '{}',
  response_meta   jsonb not null default '{}',
  unique (order_draft_id, attempt_key)
);
create index on odoo_sync_attempts (tenant_id, order_draft_id, started_at desc);
```

**RLS:** tenant members read; writes by service role only.

### `credit_ledger`

Append-only. One row per credit-affecting event.

```sql
create table credit_ledger (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  kind            text not null check (kind in ('grant','debit','refund','adjustment')),
  amount          int not null,                  -- credits, positive int; direction by `kind`
  document_id     uuid references documents(id), -- when kind=debit or refund
  stripe_event_id text,                          -- future: payment-triggered grants
  note            text,
  created_at      timestamptz not null default now(),
  unique (kind, document_id)                      -- prevents double-debit per document
         deferrable initially deferred
);
create index on credit_ledger (tenant_id, created_at desc);
```

See [credits.md](./credits.md) for rules. The partial uniqueness ensures a given document can have at most one `debit` and one `refund`.

**RLS:** tenant members read; writes by service role only.

### `workflow_events`

Structured observability log — used by the Processed / audit views.

```sql
create table workflow_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  run_id      uuid,
  stage       text not null,
  outcome     text not null check (outcome in ('ok','retry','fail')),
  duration_ms int,
  error_code  text,
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index on workflow_events (tenant_id, document_id, created_at desc);
create index on workflow_events (tenant_id, stage, outcome);
```

**RLS:** tenant members read; writes by service role only. Must never contain PII (enforced by code review + PR checklist).

---

## Indexes — summary

Most common query patterns and the index that serves them:

| Query                                      | Index                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| Inbox listing (needs_review, recent first) | `documents(tenant_id, state, created_at desc)`                                      |
| Processed listing (synced, recent first)   | `order_drafts(tenant_id, sync_state)` + `order_drafts(tenant_id, approved_at desc)` |
| Resolve customer mapping                   | `customer_mappings(tenant_id, match_key)` unique                                    |
| Resolve product mapping by SKU             | `product_mappings(tenant_id, match_sku)` partial unique                             |
| Credit balance                             | `credit_ledger(tenant_id, created_at desc)`                                         |
| Retry lookup for a failing push            | `odoo_sync_attempts(tenant_id, order_draft_id, started_at desc)`                    |

Balance is a computed view, not a stored column:

```sql
create view credit_balances as
  select
    tenant_id,
    sum(case when kind in ('grant','refund','adjustment') then amount
             when kind = 'debit' then -amount end) as balance
  from credit_ledger
  group by tenant_id;
```

---

## RLS summary

Every tenant-scoped table has RLS enabled. The canonical policy is:

```sql
create policy tenant_member_read on <table>
  for select using (
    tenant_id in (
      select tenant_id from tenant_members where user_id = auth.uid()
    )
  );
```

Write policies vary:

- `owner`-only for settings: `tenants`, `odoo_connections`.
- `member`-and-up for operational tables: `order_drafts`, `order_draft_lines`, `customer_mappings`, `product_mappings`.
- **Service-role-only** writes: `documents`, `document_pages`, `extractions`, `odoo_sync_attempts`, `credit_ledger`, `workflow_events`.

A helper function simplifies policies:

```sql
create function is_tenant_member(t uuid) returns boolean
  language sql stable as $$
    select exists (
      select 1 from tenant_members where user_id = auth.uid() and tenant_id = t
    );
  $$;

create function is_tenant_owner(t uuid) returns boolean
  language sql stable as $$
    select exists (
      select 1 from tenant_members
       where user_id = auth.uid() and tenant_id = t and role = 'owner'
    );
  $$;
```

Tests: every RLS policy must have a corresponding pgTAP test asserting a tenant-A user cannot read tenant-B rows. This is a gate for merging database migrations.

---

## Edge cases

- **Orphan `documents`** (uploaded but `ingest` never fired) — a janitor job deletes storage + row if `state = 'uploaded'` and `created_at < now() - interval '24 hours'`.
- **Re-processing.** A user-triggered retry creates a new `extractions` row, flips prior rows' `current` to `false`, and re-derives `order_drafts` (preserving user edits where possible — conflicts surfaced in the Review UI).
- **Deleted Supabase user.** `tenant_members.user_id` cascades. Rows the user created (documents, drafts) survive; `uploaded_by` remains pointing to the deleted auth.user id which becomes dangling — display fallback "Deleted user".
- **Schema evolution.** `schema_version` on JSONB-bearing tables (`extractions`) enables forward-only migrations. A migrator re-normalizes old extractions into the new schema on demand.

## Failure scenarios

- **RLS policy regression.** Mitigation: pgTAP tests, CI gate.
- **Storage path collision.** Mitigation: path always includes `document_id` (uuid).
- **JSONB schema drift.** Mitigation: `schema_version` column + app-side validation on read.
- **Partial row writes during `ai-process` failure.** Mitigation: the function writes in a single transaction at the end; on failure, state rolls back to `processing`, then the retry policy moves it to `failed_processing` after N attempts.

## Success criteria

- Every query in the app resolves to an indexed lookup or a small bounded scan.
- No cross-tenant read is possible via the Supabase client — provable by pgTAP tests.
- Schema migrations are additive (new columns nullable, new tables fine) for Phase 1 — no destructive changes without a migration plan.

## Dependencies

- Postgres 15+ (Supabase).
- `pgcrypto` extension (for `gen_random_uuid`).
- `pgTAP` for RLS tests.
- Encryption helper for `odoo_connections.api_key_enc` — see [tenancy-auth.md](./tenancy-auth.md).
