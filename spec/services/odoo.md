# Service — ERP 19 Client

## Purpose

A tenant-scoped client for ERP 19 that handles authentication, JSON-RPC calls, model searches, and Draft Sales Order creation. Every ERP interaction in DocFlow goes through this module.

## ⚠️ ERP 19 note

ERP 19 was released in **late 2025**. Its APIs are broadly compatible with 17/18 but specific endpoints, model schemas, and default behaviors may shift with point releases. This adapter is built behind the `OdooClient` interface so we can:

- Pin the ERP version compatibility per tenant (future: `odoo_connections.odoo_version`).
- Swap the transport (JSON-RPC → XML-RPC or REST) without touching callers.
- Maintain a compatibility layer if 19.x patch releases break something.

Treat the concrete client as **replaceable**; treat the interface as stable.

## Responsibilities

- Authenticate per tenant using decrypted credentials from `odoo_connections`.
- Expose typed methods for search, read, and create against the models we touch.
- Normalize ERP error responses into stable error codes.
- Handle timeouts, retries, and connection health checks.

Out of scope:

- Caching ERP data (Phase 1 has no cache layer).
- Writes other than `sale.order` create (never confirm, invoice, or cancel).
- Cross-tenant data access (every call is tenant-scoped).

## Interface

```ts
interface OdooClient {
  testConnection(): Promise<
    { ok: true; version: string } | { ok: false; code: OdooErrorCode; message: string }
  >;

  // Reads
  searchPartnerByVat(vat: string): Promise<OdooPartner | null>;
  searchPartnerByName(name: string, limit?: number): Promise<OdooPartner[]>;
  readPartner(id: number): Promise<OdooPartner | null>;

  searchProductBySku(sku: string): Promise<OdooProduct | null>;
  searchProductByName(name: string, limit?: number): Promise<OdooProduct[]>;
  readProduct(id: number): Promise<OdooProduct | null>;

  searchCurrency(code: string): Promise<{ id: number; name: string } | null>;
  searchTaxByRate(rate: number, type_tax_use?: "sale" | "purchase"): Promise<OdooTax | null>;

  // Writes (only this one, in Phase 1)
  createDraftSaleOrder(payload: DraftSaleOrderPayload): Promise<{ id: number; name: string }>;

  // Post-creation verifier (used by idempotency guard in workflows/odoo-sync.md)
  findDraftSaleOrderByRef(params: {
    client_order_ref: string;
    partner_id: number;
    after: Date;
  }): Promise<{ id: number; name: string } | null>;
}

type OdooPartner = {
  id: number;
  name: string;
  vat: string | null;
  email: string | null;
  country_code: string | null;
};

type OdooProduct = {
  id: number;
  name: string;
  default_code: string | null; // SKU
  uom_name: string;
  taxes_id: number[];
};

type OdooTax = {
  id: number;
  name: string;
  amount: number; // 16.0 for 16%
  type_tax_use: "sale" | "purchase" | "none";
};

type DraftSaleOrderPayload = {
  partner_id: number;
  partner_shipping_id?: number;
  partner_invoice_id?: number;
  client_order_ref: string;
  date_order: string; // ISO date
  currency_id: number;
  note?: string;
  order_line: Array<{
    product_id: number;
    name: string;
    product_uom_qty: number;
    price_unit: number;
    tax_id: number[]; // many2many; adapter wraps in [[6, 0, ids]]
  }>;
};
```

Factory:

```ts
// Called with the tenant context; factory decrypts the API key inside the Edge Function.
function createOdooClient(ctx: { tenant_id: string; run_id: string }): Promise<OdooClient>;
```

## Transport

### Protocol

- **JSON-RPC** via `/web/dataset/call_kw` (ERP's standard endpoint).
- Alternative: XML-RPC (`/xmlrpc/2/object`). JSON-RPC chosen because it avoids the XML parsing dependency and is the modern default.
- Authentication: `session_id` from `/web/session/authenticate` (username + API key + db).

### Session lifecycle

- Client authenticates once per `createOdooClient` call, caches session for the lifetime of the Edge Function invocation.
- Session is **not** persisted across invocations — trivial to re-auth and avoids stale-session bugs.

### Timeouts

- 20 seconds per call.
- Retries: 2 on transient errors (network, 502/503/504) with exponential backoff.
- No retry on `auth_failed`, validation errors.

## Error taxonomy

Normalized to `OdooErrorCode`:

| Code                 | Cause                                                    |
| -------------------- | -------------------------------------------------------- |
| `auth_failed`        | Bad username / API key / db name                         |
| `connection_refused` | `base_url` unreachable                                   |
| `timeout`            | 20s cap exceeded                                         |
| `rate_limited`       | 429 from ERP                                            |
| `model_not_found`    | `sale.order` or other model missing (misconfigured ERP) |
| `field_validation`   | ERP returned `ValidationError`                          |
| `access_denied`      | User lacks permission on the model                       |
| `currency_unknown`   | Currency code not active in ERP                         |
| `tax_not_found`      | No tax matched the given rate                            |
| `unknown`            | Anything else                                            |

Upstream ([workflows/odoo-sync.md](../workflows/odoo-sync.md)) maps these to its own higher-level codes where useful.

## Connection health (`testConnection`)

Called from Settings when owner clicks "Test connection" and periodically (post-Phase-1) by a health-check job.

Flow:

1. Authenticate.
2. Call `common.version_info` (ERP's version endpoint).
3. Return `{ ok, version }` or `{ ok: false, code, message }`.

Side effect: updates `odoo_connections.status`, `last_checked_at`, `last_error`.

## Field mapping notes

### Partner (customer)

- Match priority: `vat` (tax id) → `name` (exact) → `name` (fuzzy, operator-assisted).
- We do not create partners in Phase 1 — if no match exists, we fail with `customer_mapping_required` and the operator resolves it.

### Product

- Match priority: `default_code` (SKU) → `name`.
- We do not create products in Phase 1. Missing products → `product_mapping_required`.

### Currency

- `res.currency` lookup by `name` (ISO code, e.g. `USD`).
- ERP may have multiple records for the same code in theory; we use the first active one.

### Tax

- `account.tax` lookup by `amount` where `type_tax_use='sale'`.
- Tolerance: exact match. Rate `16` (percent) matches ERP's `amount=16.0`.
- If no match: push with empty tax on the line and emit a warning; tenant can configure a default later.

### Units of measure (UoM)

- We do **not** set `product_uom` explicitly in Phase 1 — we let ERP default to the product's primary UoM.
- UoM conversion (the PO says "box", the product is stocked in "each") is a deferred concern — documented in [roadmap.md](../roadmap.md).

### Multi-currency

- ERP 19 requires `currency_id` on `sale.order`. We always provide it. If the tenant's ERP only has one currency active, we still include it explicitly.

## Draft Sales Order — the only write

`createDraftSaleOrder` is the only mutating call in this adapter.

```
POST /web/dataset/call_kw
{
  "model": "sale.order",
  "method": "create",
  "args": [<DraftSaleOrderPayload>],
  "kwargs": {}
}
```

Returns the new `sale.order.id`. We then `read(['name'])` to get the human-readable reference (e.g. `'S00123'`).

We do **not**:

- Call `action_confirm` (would transition to sent/confirmed).
- Call `_create_invoices`.
- Edit existing SOs.

This is a hard rule enforced by the interface — it exposes no other write methods.

## Observability

Every call emits a `workflow_events` row:

```jsonc
{
  "stage": "odoo",
  "outcome": "ok" | "retry" | "fail",
  "duration_ms": 1234,
  "meta": {
    "method": "search_read" | "create" | ...,
    "model": "res.partner" | "product.product" | "sale.order",
    "result_size": 3,                // for searches
    "error_code": "..."              // when outcome != ok
    // Never: partner names, product names, full payloads, credentials
  }
}
```

## Security

- **API key decryption** happens inside `createOdooClient`, never in the caller. Plaintext key lives only in the Edge Function's memory for the duration of the invocation.
- **TLS** required (`base_url` must be HTTPS in Phase 1; HTTP rejected with `connection_refused`).
- **No credential logging** — PR checklist enforces.
- **Request/response bodies** are not persisted by default. For error diagnosis, `odoo_sync_attempts.request_meta` / `response_meta` store a **sanitized** subset (model, method, result shape — not full payload).

## Testing strategy

- **Integration tests** against a dedicated ERP 19 test instance. Seeded with known partners/products/taxes. Run in CI nightly (not every PR, to keep PR runs fast).
- **Mock-based unit tests** for every error code path (auth, timeout, validation).
- **Idempotency test**: create + `findDraftSaleOrderByRef` resolves the same SO after a simulated partial failure.

## Edge cases

- **Base URL has trailing slash / path.** Adapter normalizes `base_url` to the root (no trailing slash) and appends endpoints. Trailing path is preserved if present (for custom deployments behind subpath proxies).
- **Custom ERP modules add required fields.** Detected on create: ERP returns `ValidationError`. Error is surfaced as `field_validation` with the ERP message in `error_message`; operator's action is to fix ERP config.
- **Partner has multiple VAT numbers.** We don't match on ambiguous VATs; if `searchPartnerByVat` returns >1, we treat as no match and require operator action.
- **Product archived in ERP.** `default_code` lookup might still return it; we filter `active=true` in the search domain.
- **ERP instance behind VPN / private network.** Not supported in Phase 1 — `base_url` must be reachable from Supabase Edge Functions (public internet).

## Failure scenarios

| Scenario                                                            | Handling                                                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ERP upgrade breaks `sale.order.create` signature                   | Adapter-level integration test fails; we pin to known-good version per tenant.                                         |
| Session cookie expires mid-run                                      | Not applicable — we don't reuse sessions across invocations.                                                           |
| ERP returns `500 Internal Server Error` intermittently             | Retry; after 2 fails, surface `unknown`.                                                                               |
| ERP raises `AccessError` instead of `access_denied`                | Detected by message pattern; normalized to `access_denied`.                                                            |
| Per-tenant ERP runs an old 17.x and doesn't support JSON-RPC shape | Unsupported in Phase 1. Adapter returns `connection_refused` or `model_not_found` on attempt; Settings shows guidance. |

## Success criteria

- Zero ERP interactions occur outside this module — provable by a lint rule (no direct network calls to `odoo_connections.base_url` outside `services/odoo/*`).
- All 10 error codes have stable behavior with integration tests.
- 99%+ of valid draft sale order creations succeed on first attempt in a healthy ERP.
- Adapter is swappable: replacing JSON-RPC with XML-RPC requires changes to one file.

## Dependencies

- [tenancy-auth.md](../tenancy-auth.md) — credential decryption.
- [data.md](../data.md) — `odoo_connections`, `odoo_sync_attempts`.
- [workflows/odoo-sync.md](../workflows/odoo-sync.md) — the only caller of `createDraftSaleOrder`.
- [workflows/review.md](../workflows/review.md) — caller of `searchPartnerByName` / `searchProductBySku` during mapping.
- A reachable ERP 19 instance per tenant.
