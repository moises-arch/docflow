# Workflow — Review

## Purpose

Put a human in the loop: let an operator verify an AI-extracted draft, fix what's wrong, and approve it for ERP sync (or reject it).

This is where the product's value is proven. If review is slower than manual entry, we've failed.

## Responsibilities

- Surface the full extraction next to the original document.
- Support inline edits on every field (header + line items).
- Resolve customer and product mappings at review time (optional — can defer to sync).
- Transition the document to `reviewed` on approval, or `rejected` on rejection.
- Preserve edits across re-processing.

This spec covers the **workflow** (states, rules, data mutations). The screen layout lives in [ui.md](../ui.md#review-screen).

## Inputs

- `document_id` (from Inbox click).
- Current `order_drafts` row + `order_draft_lines`.
- Original PDF from Storage (signed URL).
- Existing mappings (customer_mappings, product_mappings) for the tenant.

## Outputs

On approval:

- `order_drafts.approved_by`, `approved_at` set.
- `order_drafts.sync_state` → `pending`.
- `documents.state` → `reviewed`.
- `odoo-sync` Edge Function invoked.

On rejection:

- `documents.state` → `rejected`, `last_error` set to operator's chosen reason.
- If within 24h of `needs_review` timestamp: `credit_ledger` refund written. See [credits.md](../credits.md#refund-rules).

On edit (autosave):

- `order_drafts` or `order_draft_lines` mutated in place.
- `updated_at` bumped.
- No event emitted unless the edit is the approval action.

## Actions available in Review

| Action            | Effect                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Edit header field | Inline update to `order_drafts.*`.                                                         |
| Edit line item    | Inline update to `order_draft_lines`; recompute line_total client-side, server validates.  |
| Add line item     | Insert new `order_draft_lines` row at next position.                                       |
| Remove line item  | Delete `order_draft_lines` row; renumber `position`.                                       |
| Map customer      | Set `order_drafts.customer_mapping_id`; optionally save as default for future.             |
| Map product       | Set `order_draft_lines.product_mapping_id` for a specific line.                            |
| Approve           | Transition to `reviewed`, kick off ERP sync.                                              |
| Reject            | Transition to `rejected` with reason; refund if eligible.                                  |
| Retry AI          | Re-run `ai-process` (see [workflows/ai-processing.md](./ai-processing.md#business-rules)). |

## Autosave semantics

- Every edit autosaves on blur (text fields) or immediately (selects/toggles).
- Optimistic UI: local state updates immediately, request fires in background.
- On server rejection (validation or RLS), UI reverts with an inline error.
- Multiple operators editing the same draft: last-write-wins for Phase 1. A row-level lock / presence indicator is a deferred enhancement.

## Mapping resolution (optional at review)

The extraction may have identified a buyer name but not a mapped ERP partner. The Review UI shows:

- **Green badge** if `customer_mapping_id` is already resolved (auto-matched by normalized name/tax_id).
- **Amber badge** "Map customer" if unresolved — operator picks from a search field against `res.partner` in ERP (via `services/odoo.md`) or creates a new mapping.

Same for each line item's product. Unresolved mappings are **not** a blocker for approval — the sync workflow handles fallback (see [workflows/odoo-sync.md](./odoo-sync.md#mapping-resolution)). The Review UI surfaces them so the operator can pre-empt a push failure.

If the operator resolves a mapping during review, they can tick **"Remember for future POs from this buyer/product"** — this writes/updates a row in `customer_mappings` or `product_mappings`.

## Edit-preservation on re-processing

Rule: **user edits win over re-extraction.**

When `ai-process` runs again on a document that already has a `needs_review` or `reviewed` `order_drafts`:

1. The new extraction is persisted as a new `extractions` row with `current=true`.
2. The existing `order_drafts` row is **not** overwritten field-by-field.
3. A diff is computed: for each field, `old_normalized[field] vs new_normalized[field] vs current_order_drafts[field]`.
4. If `current_order_drafts[field] == old_normalized[field]` (user didn't edit), update it to `new_normalized[field]`.
5. If `current_order_drafts[field] != old_normalized[field]` (user edited) **and** `new_normalized[field] != current_order_drafts[field]`, surface it as a **conflict** in the Review UI with three choices: keep mine, accept new, merge manually.

Conflict state is tracked in `order_drafts.meta.conflicts` (jsonb). No separate table needed.

## Data structures

### Client-side edit payload

```ts
// PATCH /api/order-drafts/:id
{
  patches: Array<
    | { op: 'set'; path: 'po_number' | 'po_date' | 'currency' | 'notes' | 'total' | ...; value: any }
    | { op: 'set'; path: 'buyer.name' | 'shipping_address.city' | ...; value: any }
    | { op: 'line.set'; line_id: string; path: 'description' | 'quantity' | 'unit_price' | ...; value: any }
    | { op: 'line.add'; line: Partial<OrderDraftLine> }
    | { op: 'line.remove'; line_id: string }
  >
}
```

Server applies in order. Each patch is validated against a zod/ajv schema.

### Approve payload

```ts
// POST /api/order-drafts/:id/approve
{
}
```

Response:

```ts
{
  sync_state: 'pending',
  sync_run_started: true
}
```

### Reject payload

```ts
// POST /api/order-drafts/:id/reject
{
  reason_code: 'wrong_document' | 'duplicate' | 'low_quality' | 'other',
  note?: string
}
```

## States

This workflow moves `documents.state` between:

- `needs_review` (entry) → `reviewed` (approve) | `rejected` (reject) | `processing` (retry AI).

It sets `order_drafts.sync_state`:

- `none` (entry) → `pending` on approve.

It does **not** change `sync_state` to anything else — that's owned by [workflows/odoo-sync.md](./odoo-sync.md).

## Business rules

1. **Approval requires** at least one line item. A draft with zero lines cannot be approved — UI disables the button.
2. **Approval does not require** mappings to be resolved. The sync workflow handles fallback.
3. **Only members or owners can approve.** Enforced by RLS + server-side role check.
4. **Rejected documents are terminal in Phase 1.** No un-reject. An operator who rejects by mistake re-uploads.
5. **Retry AI** is allowed from any state in `{needs_review, reviewed, failed_processing}`. If the doc was already `reviewed`, retrying puts it back into `processing` and the existing `order_drafts` is preserved per the edit-preservation rule.
6. **Autosave is eventually consistent.** Approve button is disabled if any autosave is in-flight — prevents approving mid-edit.

## Edge cases

- **Operator approves while ERP connection is unhealthy.** Approve still succeeds (state transitions + `sync_state='pending'`); the sync workflow will attempt and likely fail. UI shows a warning banner on Settings.
- **Autosave request lost** (network). Retries twice; on persistent failure, UI shows an error banner and disables Approve. No data lost — last good server state is what persists.
- **Operator pastes a multi-line description into a single field.** UI accepts it; server doesn't sanitize beyond length limits.
- **Line totals don't match quantity × unit_price.** UI shows an inline warning but does not block approval — the operator is the final authority.
- **Currency inconsistency across lines.** Not permitted — the form enforces a single currency per order (from header).
- **Operator re-processes a reviewed-but-not-synced document.** Allowed; treated as a fresh review cycle. Any existing `credit_ledger` debit stands; no refund unless the new run short-circuits.

## Failure scenarios

| Scenario                                   | Handling                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Approve succeeds but sync invocation fails | `order_drafts.sync_state = 'pending'` persists; a janitor picks up `pending` drafts > 2m old and retries. |
| Autosave during session expiry             | Middleware returns 401; UI freezes edits and prompts re-login; on return, local edits re-sync.            |
| Concurrent edits by two operators          | Last-write-wins. Future: presence indicator.                                                              |
| User closes tab mid-approve                | If the approve POST reached the server, the transition happened. UI on next load reflects actual state.   |

## Success criteria

- Median operator time in Review for a typical 5-line PO: **under 30 seconds** (see [product.md](../product.md#success-criteria-phase-1)).
- Approve-to-sync invocation latency: **under 500ms**.
- Zero cases of approved drafts with zero lines reaching ERP.
- Edit-preservation: no reports of lost edits after a re-process.

## Dependencies

- [data.md](../data.md) — `order_drafts`, `order_draft_lines`, `customer_mappings`, `product_mappings`.
- [workflows/ai-processing.md](./ai-processing.md) — upstream producer.
- [workflows/odoo-sync.md](./odoo-sync.md) — downstream consumer on approve.
- [credits.md](../credits.md) — refund rules on rejection.
- [ui.md](../ui.md) — Review screen layout.
- [services/odoo.md](../services/odoo.md) — customer/product search during mapping.
