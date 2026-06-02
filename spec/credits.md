# Credits

## Purpose

Credits are the internal unit of value consumed when DocFlow processes a document. This spec defines:

- What a credit is (and isn't) from the user's and system's perspectives.
- How credit cost is computed per document.
- How the ledger works.
- The data shape required for a future Stripe integration — **without implementing Stripe in Phase 1**.

## ⚠️ Provisional thresholds

The numeric thresholds below are a **starting point**. They must be calibrated with real customer documents before being treated as final. Every threshold table in this file is marked `// PROVISIONAL` — do not cite these numbers as product guarantees.

## User-facing vs internal model

- **What users see**: "1 order = 1 credit." Pricing pages, dashboards, and invoices (when Stripe lands) use this simple framing.
- **What we compute**: credits per document based on **relevant page count**. A very large PO costs more credits internally. This protects margin without confusing the user in the common case.

> In the common case (1–3 relevant pages per PO), internal = user-facing = 1 credit. Users only notice the difference on unusually large POs, at which point we display "This document will consume N credits" before they submit.

## Credit cost formula

Cost is a pure function of the `document_pages` table after the AI pipeline classifies relevance:

```
relevant_pages = count of document_pages where is_relevant = true
```

Then:

```
// PROVISIONAL
relevant_pages   credits
     1–3          1
     4–8          2
     9–15         3
    16+           4   // capped
```

Complexity adjustment (optional, **off by default** in Phase 1):

- If any page has `page_type = 'line_items'` AND extracted `line_items.length > 100`, add **+1 credit**.
- Rationale: extremely long line-item tables cost disproportionately more in AI tokens.

### What counts as "relevant"

From the classification stage (see [workflows/ai-processing.md](./workflows/ai-processing.md)):

| `page_type`  | Relevant?                                                           |
| ------------ | ------------------------------------------------------------------- |
| `cover`      | yes                                                                 |
| `body`       | yes                                                                 |
| `line_items` | yes                                                                 |
| `signature`  | no                                                                  |
| `legal`      | no                                                                  |
| `blank`      | no                                                                  |
| `duplicate`  | no                                                                  |
| `other`      | depends on confidence — if `< 0.7` treat as relevant (conservative) |

This rule is defined once here and referenced from [workflows/ai-processing.md](./workflows/ai-processing.md).

## Ledger model

The single source of truth for credit state is `credit_ledger` (see [data.md](./data.md#credit_ledger)). It is **append-only** and **idempotent per document**.

Event kinds:

| `kind`       | When                                          | Sign |
| ------------ | --------------------------------------------- | ---- |
| `grant`      | Credits added (trial, Stripe purchase, promo) | +    |
| `debit`      | A document is processed successfully          | −    |
| `refund`     | A document is rejected or reprocessing failed | +    |
| `adjustment` | Manual correction (support action)            | ±    |

The balance view (`credit_balances`) computes `sum(+grants, +refunds, +adjustments, −debits)` per tenant — defined in [data.md](./data.md#indexes--summary).

### Debit rules

- Debited **once** per document, at the end of successful AI processing (when doc transitions to `needs_review`).
- Idempotent: `unique (kind, document_id) where kind in ('debit','refund')` (enforced in the partial unique constraint — see [data.md](./data.md#credit_ledger)).
- Debit **before** review — the operator sees the charge preview in Inbox when doc enters `needs_review`. This matches customer expectation (they paid for the AI work, regardless of what they do in review).

### Refund rules

- Full refund if:
  - Operator moves doc to `rejected` within **24 hours** of `needs_review`.
  - AI pipeline failed terminally (doc ends in `failed_processing` after retries exhausted).
- No refund for edits — editing extraction results is part of the product.
- Refund writes a new ledger row with `kind='refund'` equal in amount to the original debit.

### Balance semantics

- A tenant can go **below zero** (overdraft) in Phase 1 — we never block processing on balance, because Stripe is not wired yet and we're onboarding early customers manually.
- Once Stripe lands, a tenant with `balance <= 0` and no active subscription is blocked at upload. That check is **not implemented now**, but the `balance` view must be correct so it can be added without data migrations.

## Granting credits

Phase 1:

- Manual grants via a support script that inserts a `grant` ledger row with a note (`note = 'trial'`, `note = 'onboarding'`, etc.).
- No self-service top-up.

Future (Stripe-ready):

- Stripe Checkout success → webhook → Edge Function writes `grant` row with `stripe_event_id`.
- Subscription renewal → same path, monthly.
- The `credit_ledger.stripe_event_id` column is **already defined** in Phase 1 to avoid a migration.

## Stripe-ready foundation (no implementation)

What exists in Phase 1:

- `credit_ledger.stripe_event_id text` column — reserved for idempotency when Stripe events arrive.
- A placeholder table `billing_customers` (optional, can be deferred — see below).
- Documented integration plan here.

What does **not** exist:

- Any Stripe SDK code.
- Any webhook handler.
- Any checkout UI.
- Any subscription or plan tables.

### Data shape when we add Stripe

```sql
create table billing_customers (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null unique references tenants(id),
  stripe_customer_id  text unique,
  status              text not null default 'none'
                      check (status in ('none','active','past_due','canceled')),
  current_plan        text,           -- 'starter' | 'growth' | 'scale' — TBD
  credits_per_period  int,
  period_anchor       date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
```

We'll add this table when we start the Stripe work. Creating it empty now is **optional** and not required for Phase 1 — the spec's goal is only to ensure the `credit_ledger` shape will accept Stripe events without migration.

## Inputs

- `tenant_id` (every credit operation is tenant-scoped).
- `document_id` (for debits/refunds).
- `amount` (computed or granted).
- `kind` (enum).

## Outputs

- A new `credit_ledger` row.
- Updated `credit_balances` view (automatic).
- A `workflow_events` entry with `stage='credits'`, `outcome='ok'|'fail'`.

## States

Credits don't have their own state machine — they are events. The relevant state is the **document state** that triggers them:

- `processing` → (on completion) → `needs_review` triggers a `debit`.
- `needs_review` → `rejected` within 24h triggers a `refund`.
- `processing` → `failed_processing` (terminal, after retries) triggers a `refund`.

## Business rules

1. A document generates **at most one `debit`** and **at most one `refund`**.
2. Credit cost is computed **once**, after page classification, using the formula above. Re-processing a document does **not** generate a second debit unless the first was refunded.
3. The formula is deterministic — same `document_pages` classification ⇒ same cost.
4. Internal overdraft (`balance < 0`) is **allowed** in Phase 1. A warning banner shows in Settings when `balance < 0`.
5. Grants and adjustments are visible to owners only; members see only the balance, not the ledger detail.

## Edge cases

- **Document with zero relevant pages.** Cost = 0, no debit written. Doc moves to `rejected` with reason `no_relevant_content` (operator can verify).
- **Reprocessing after user edit to classification.** Not supported in Phase 1 — the operator can reject + re-upload.
- **Race between debit and refund.** Impossible: debit is written in the same transaction that transitions doc to `needs_review`; refund requires a later user action.
- **Cap at 16+ pages.** Beyond 16 relevant pages, cost stays at 4 — rationale: POs this large are rare, and capping keeps the user-facing "1 order = 1 credit" framing less misleading at the tail.

## Failure scenarios

- **Ledger write fails after AI processing succeeds.** The `ai-process` Edge Function writes the debit in the same transaction as the state transition. If the ledger insert fails, the transition rolls back and the function retries. Net: no partial state.
- **Balance view miscount.** Mitigation: ledger is append-only; balance is a SQL sum — no drift possible unless rows are manually deleted. Deletes on `credit_ledger` are denied by RLS (service-role only) and monitored.
- **Stripe webhook duplicates (future).** Mitigation: `stripe_event_id` uniqueness prevents double-grants.

## Success criteria

- Every document in `needs_review` has exactly one `debit` in `credit_ledger`.
- Every document in `rejected` (within 24h) or `failed_processing` (terminal) has a matching `refund`.
- `credit_balances.balance` matches the sum of all events within 1 second of the last insert.
- Adding Stripe requires zero schema changes to `credit_ledger`.

## Dependencies

- [data.md](./data.md) for `credit_ledger` table and `credit_balances` view.
- [workflows/ai-processing.md](./workflows/ai-processing.md) for the page classification that feeds the formula.
- [workflows/review.md](./workflows/review.md) for rejection triggering a refund.
- [README.md](./README.md#credits) for the convention that credit thresholds are provisional.

---

*⚡ Built by [Mojo Dev](https://github.com/moises-arch)*
