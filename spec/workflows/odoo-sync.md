# Workflow — ERP Sync

## Purpose

Push an approved `order_drafts` into the tenant's ERP 19 instance as a **Draft Sales Order** — safely, idempotently, with a clean retry path when something breaks.

## Responsibilities

- Resolve customer and product mappings (with fallback).
- Create a draft `sale.order` in ERP via JSON-RPC.
- Record every attempt in `odoo_sync_attempts`.
- Update `order_drafts.sync_state` and capture ERP IDs on success.
- Surface actionable failures to the operator (mapping gaps, auth issues, ERP downtime).

This workflow is **the only place** in DocFlow that writes to ERP. It never confirms, invoices, or cancels SOs in Phase 1.

## Inputs

- `order_draft_id` (uuid)
- `tenant_id` (uuid)
- `attempt_key` (string) — idempotency key; see below.
- `run_id` (uuid)

Invoked by:

- Review approve action.
- User-triggered retry from Processed screen.
- Janitor for stuck `pending` drafts > 2 minutes old.

## Outputs

On success:

- `order_drafts.sync_state = 'synced'`
- `order_drafts.odoo_so_id`, `odoo_so_name` set.
- `odoo_sync_attempts` row with `outcome='success'`.
- Workflow event `stage='sync', outcome='ok'`.

On failure:

- `order_drafts.sync_state = 'sync_failed'`
- `last_sync_error` set.
- `odoo_sync_attempts` row with `outcome='error'` and error details.
- Workflow event `stage='sync', outcome='fail'`.

## Flow

```
1. lock       → advisory lock on order_draft_id
2. precheck   → connection health, balance (future)
3. validate   → ensure required active target_fields are present
4. map        → resolve customer_mapping and per-line provider/global product mappings
5. build      → construct ERP sale.order payload
6. push       → JSON-RPC call to create sale.order (draft)
7. finalize   → update order_drafts, write attempt record
```

## Idempotency

- **`attempt_key`** is derived: `sha256(order_draft_id || updated_at)`. A second invocation with the same `order_draft_id` **and** no changes to the draft yields the same key.
- `odoo_sync_attempts` has `unique (order_draft_id, attempt_key)`. Re-invoking an already-successful attempt is a no-op (returns existing success).
- ERP itself does not have a native "create-if-not-exists" for sale orders. We defend by:
  - Checking `order_drafts.odoo_so_id` **before** the push. If set, return success without pushing.
  - Wrapping our JSON-RPC call with an internal guard: search for `sale.order` where `client_order_ref = po_number AND partner_id = resolved_partner_id AND state = 'draft' AND create_date >= approved_at - 5m`. If found, adopt it.

## Stage detail

### 1. Lock

- Acquire `pg_try_advisory_lock(hashtext(order_draft_id))`. If lock fails, abort — another sync is in flight.

### 2. Precheck

- Load `odoo_connections` row; if `status != 'active'`, fail with `odoo_connection_unhealthy`. Operator is directed to Settings.
- (Future) Check tenant balance when Stripe is live. Not in Phase 1.

### 3. Validate target fields

- Load active `target_fields` for the tenant.
- For every required target field, verify the corresponding draft/header/line value is present.
- Provider mappings can explain where the value should come from, but sync validation checks the final draft values only.
- Missing required fields fail before any ERP call with `target_field_required`.
- Coordinates, highlights, and OCR evidence are never part of this validation.

### 4. Map

**Customer mapping:**

- If `order_drafts.customer_mapping_id` is set → use it. Validate the mapped `odoo_partner_id` still exists (search `res.partner`).
- Else: try to auto-match on normalized buyer name / tax_id against `customer_mappings`. On a single high-confidence hit, use it and set `customer_mapping_id`.
- Else: **fallback** — search `res.partner` in ERP for exact match on `vat` (tax id) or `name`. On single exact hit, create `customer_mappings` row and use it.
- Else: **fail** with `customer_mapping_required`. UI shows a "Map customer" dialog on the Processed row.

**Product mapping (per line):**

- If `order_draft_lines.product_mapping_id` is set → use it.
- Else if `order_drafts.provider_id` is set: try provider-specific mappings in this order:
  - `provider_product_mappings.source_company_sku`
  - `provider_product_mappings.source_sku`
  - `provider_product_mappings.source_description`
- Else: try auto-match on `sku` (exact) against tenant-wide `product_mappings`.
- Else: try auto-match on normalized `description` against `product_mappings` (only if unique high-confidence hit).
- Else: try cached `odoo_products.default_code` for exact match.
- Else: **fallback** — search `product.product` in ERP by `default_code` (SKU) for exact match and cache the result in `odoo_products`.
- Else: **options** (per tenant setting):
  - `strict` (default): fail the whole push with `product_mapping_required` listing the unmapped lines.
  - `use_generic`: use a tenant-configured "Generic product" partner and embed the original description in the line note.

`use_generic` is off in Phase 1; the hook is defined so we can flip it later per tenant without code changes.

### 5. Build

Construct the ERP JSON-RPC payload:

```jsonc
{
  "partner_id": <odoo_partner_id>,
  "partner_shipping_id": <resolved_shipping_partner_id_or_same>,
  "partner_invoice_id": <resolved_billing_partner_id_or_same>,
  "client_order_ref": "<po_number>",
  "date_order": "<po_date or now>",
  "currency_id": <odoo_currency_id_from_code>,
  "note": "<notes>",
  "order_line": [
    {
      "product_id": <odoo_product_id>,
      "name": "<description>",   // ERP uses this as the line description
      "product_uom_qty": <quantity>,
      "price_unit": <unit_price>,
      "tax_id": [[6, 0, <tax_ids_from_rate>]]
    },
    ...
  ]
}
```

- `date_order` defaults to today if missing.
- `currency_id` resolved via ERP `res.currency` lookup by `name`. Unresolved → fail with `currency_unknown`.
- Tax resolution: look up `account.tax` by matching `amount` = `tax_rate * 100`. If not found, leave tax empty and append a warning note; configurable per tenant later.
- We do **not** set `state` — ERP defaults new `sale.order` to `'draft'`. We explicitly never transition it.

### 6. Push

- Single JSON-RPC call to ERP's `/web/dataset/call_kw` endpoint:
  - `model='sale.order'`, `method='create'`, `args=[payload]`.
- Timeout: 20 seconds.
- Auth: per-tenant credentials decrypted from `odoo_connections.api_key_enc` (see [tenancy-auth.md](../tenancy-auth.md#encryption)).

### 7. Finalize

In a single transaction:

- `odoo_sync_attempts` row inserted (outcome, error, `odoo_so_id`).
- `order_drafts` updated (`sync_state`, `odoo_so_id`, `odoo_so_name`, `last_sync_error`).
- `workflow_events` row emitted.

## Retry policy

- **Transient errors** (network timeout, 5xx from ERP, rate limit): exponential backoff retry within the same invocation, up to 3 tries.
- **Auth errors** (401/403): no retry. Mark `sync_state='sync_failed'` with `odoo_auth_failed`. Also set `odoo_connections.status='error'` so Settings surfaces the problem.
- **Mapping errors** (`customer_mapping_required`, `product_mapping_required`): no retry. Clear action for the operator.
- **ERP validation errors** (e.g. invalid currency, missing required field): no retry — data problem, not transient.

Janitor: every 5 minutes, retry `sync_state='pending'` drafts older than 2 minutes (up to 3 times). After that, they are moved to `sync_failed` with `last_sync_error='janitor_gave_up'`.

## Error taxonomy

Stored in `order_drafts.last_sync_error` and `odoo_sync_attempts.error_code`:

| Code                        | Meaning                                          | Operator action                                               |
| --------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| `odoo_connection_unhealthy` | Connection flagged error in Settings             | Fix ERP connection.                                          |
| `odoo_auth_failed`          | Credentials rejected at push time                | Re-enter API key.                                             |
| `customer_mapping_required` | No mapping for buyer; fallback failed            | Map customer from Processed row's inline action.              |
| `product_mapping_required`  | One or more line items unmapped; fallback failed | Map products (dialog lists offending lines).                  |
| `currency_unknown`          | Currency not configured in ERP                  | Admin adds currency in ERP; retry.                           |
| `odoo_validation`           | ERP rejected the payload                        | Inspect error details; often a tax_id or partner_id mismatch. |
| `odoo_timeout`              | Network timeout after retries                    | Retry from Processed screen.                                  |
| `internal_error`            | Bug in our code                                  | File a ticket; logs have the detail.                          |

Every code has a corresponding i18n key (`odoo.error.<code>`).

## Data structures

### Invocation payload

```ts
{
  order_draft_id: string,
  tenant_id: string,
  run_id: string,
  attempt_key?: string   // computed if absent
}
```

### Attempt record (persisted)

See [data.md](../data.md#odoo_sync_attempts).

## States

This workflow owns transitions on `order_drafts.sync_state` only (not `documents.state`).

```
pending ──► in_progress ──► synced
                    │
                    ▼
               sync_failed ──► pending   (on manual/janitor retry)
```

`documents.state` remains `reviewed` throughout — it never regresses regardless of sync outcome. See [README.md](../README.md#state-separation).

## Business rules

1. **Drafts only.** We never create confirmed, invoiced, or cancelled SOs.
2. **One active push at a time per draft.** Advisory lock.
3. **Idempotency is non-negotiable.** Re-invoking with the same key never double-creates in ERP.
4. **Fail loudly, not silently.** Errors surface in UI with an actionable code, not a generic "sync failed".
5. **No ERP writes from outside this workflow.** Even mapping lookups that require a `res.partner` search go through [services/odoo.md](../services/odoo.md); they don't write.
6. **Tenant credentials are never logged**, even on error. Only the connection `base_url` may appear in logs.

## Edge cases

- **Same PO approved twice.** The second push short-circuits because `order_drafts.odoo_so_id` is set. Operator sees "already synced" in UI.
- **ERP SO deleted manually in ERP after sync.** Our state still says `synced`. We don't reconcile back to ERP in Phase 1 — this is a known gap, documented in [roadmap.md](../roadmap.md).
- **Draft edited after sync.** Allowed (edits go to our DB), but does not re-push. The Processed screen shows an "Out of sync" badge; operator can click "Re-push" which creates a new ERP SO **only if** they confirm (we don't auto-modify the existing ERP SO in Phase 1).
- **Line item with zero quantity.** Filtered out before push — ERP would accept it but it pollutes the SO.
- **Line item with zero unit_price.** Allowed (samples, freebies) but flagged in UI.
- **Tenant's ERP instance is self-hosted on a slow VPS.** 20s timeout is generous; if insufficient, the error is `odoo_timeout` and retryable.

## Failure scenarios

| Scenario                                         | Handling                                                                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| ERP returns success but `odoo_so_id` is `false` | Treated as error; attempt recorded with `error_code='odoo_validation'`.                                                                      |
| Connection succeeded but DB name wrong           | ERP returns auth error; `odoo_auth_failed`.                                                                                                 |
| Partial push (some lines rejected)               | Not possible: `sale.order` create is atomic — it succeeds with all lines or fails.                                                           |
| Push succeeded but finalize transaction fails    | The ERP SO exists but we don't know its ID. Next retry attempt's guard (search for existing SO with matching `client_order_ref`) adopts it. |
| Two janitor runs fire simultaneously             | Advisory lock ensures one proceeds; the other no-ops.                                                                                        |
| Per-tenant ERP is offline for 24h               | Janitor escalates: after 3 failed attempts, sync state is `sync_failed` and operator is notified in UI. No infinite retry.                   |

## Success criteria

- **Push latency**: median under 3 seconds for typical POs.
- **Idempotency proof**: automated test that invoking twice creates one ERP SO.
- **99%+ first-attempt success rate** for well-mapped POs.
- Every `sync_failed` has an `error_code` that maps to a concrete operator action.

## Dependencies

- [services/odoo.md](../services/odoo.md) — JSON-RPC client, search/create contracts.
- [data.md](../data.md) — `order_drafts`, `order_draft_lines`, `customer_mappings`, `product_mappings`, `odoo_sync_attempts`, `odoo_connections`.
- [tenancy-auth.md](../tenancy-auth.md) — credential decryption.
- [workflows/review.md](./review.md) — upstream producer.
- [ui.md](../ui.md) — Processed screen surfaces sync state and retry actions.
