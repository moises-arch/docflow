# Workflow — AI Processing

## Purpose

Turn a raw uploaded document into a structured, reviewable `order_draft`. This is the engine — the part of DocFlow that actually saves time.

## Responsibilities

- Orchestrate OCR → page classification → field extraction → normalization.
- Decide which pages are relevant and which are noise.
- Compute credit cost and write the debit in the same transaction as state transition.
- Produce a canonical `normalized` payload and hydrate `order_drafts` / `order_draft_lines`.
- Detect the provider when possible and apply provider-specific field/product mappings.
- Emit structured events per stage for observability.

This workflow does **not** push to ERP — that's [workflows/odoo-sync.md](./odoo-sync.md). It does not render the review UI — that's [workflows/review.md](./review.md).

## Inputs

- `document_id` (uuid)
- `run_id` (uuid — new per invocation)
- `tenant_id` (uuid)

Invoked by the `ingest` Edge Function. May also be invoked by a user-triggered **retry** from the Review or Processed screens.

## Outputs

On success:

- `document_pages` rows (one per page) with classification and `is_relevant`.
- `extractions` row with `current = true`, `payload` (raw), `normalized` (canonical), `confidence`.
- `order_drafts` row (1:1 with document).
- `order_draft_lines` rows.
- `credit_ledger` row (`kind='debit'`).
- `documents.state` transitions to `needs_review`.

On terminal failure (after retries exhausted):

- `documents.state = 'failed_processing'` with `last_error`.
- A `credit_ledger` refund row if a debit was previously written for this `document_id`.

Events emitted (per stage): `ocr`, `classify`, `relevance_filter`, `extract`, `normalize`, `persist`, `credits`.

## Pipeline stages

```
1. fetch      → pull PDF from Storage, validate
2. ocr        → Google Document AI: text + layout + page count
3. classify   → Gemini (structured): per-page type + relevance
4. detect     → infer provider from metadata, OCR text, and extracted hints
5. filter     → drop irrelevant pages; compute credit cost
6. extract    → Gemini (structured): source fields + line items from relevant pages
7. map        → provider source fields → tenant ERP target fields
8. normalize  → canonicalize dates, currency, units, numbers
9. persist    → single transaction: extractions, order_draft(_lines), debit, state
```

Each stage is a pure function with a typed input/output; the orchestrator is a small state machine. If a stage fails, the orchestrator either retries the stage (transient) or fails the run (terminal).

### Stage 1 — fetch

- Read `documents.storage_path` via service role.
- Download to memory (cap at 25 MB; already enforced at upload).
- Validate MIME and that bytes aren't empty.
- **Advisory lock** on `documents.id` (`pg_try_advisory_lock`) to prevent concurrent runs for the same doc.

### Stage 2 — OCR (Document AI)

- Call Google Document AI processor (see [services/ai-adapters.md](../services/ai-adapters.md)).
- Output: `{ pages: [{ page_number, text, blocks, bbox, language, confidence }] }`.
- Persist nothing yet — hold in memory.

### Stage 3 — page classification (Gemini)

- For each page, send `{ page_number, text (truncated to N chars), layout_summary }` to Gemini with a structured schema asking for `page_type` and `is_relevant`.
- **Batched**: up to 10 pages per Gemini call; multi-page docs call in parallel with concurrency 3.
- Temperature 0 for determinism.
- Write `document_pages` rows at end of this stage — they are useful even if extraction later fails.

Page type taxonomy (matches [data.md](../data.md#document_pages)):

| `page_type`  | What it is                             | Default relevance                      |
| ------------ | -------------------------------------- | -------------------------------------- |
| `cover`      | Header page with PO number, buyer info | yes                                    |
| `body`       | General PO content                     | yes                                    |
| `line_items` | Tables of products                     | yes                                    |
| `signature`  | Signature/stamp page                   | no                                     |
| `legal`      | Terms and conditions                   | no                                     |
| `blank`      | Empty or near-empty                    | no                                     |
| `duplicate`  | Exact repeat of a prior page           | no                                     |
| `other`      | Classifier uncertain                   | yes if confidence < 0.7 (conservative) |

### Stage 4 — provider detection

- First use `documents.provider_id` if already supplied by upload/email ingest.
- Otherwise evaluate active `provider_detection_rules` using document metadata, filename, OCR text, and early extracted hints.
- Persist the winning `provider_id` to `documents` only if confidence clears the tenant threshold.
- If no match is reliable, continue with `provider_id = null`.
- Provider detection is never required for processing. It only selects better mappings and review defaults.

### Stage 5 — relevance filter & credit computation

- `relevant_pages = filter(document_pages where is_relevant)`.
- Compute credits per [credits.md](../credits.md#credit-cost-formula). Result stored in memory; debit is written in Stage 9.
- If `relevant_pages = 0`: short-circuit. Transition doc to `rejected` with `last_error = 'no_relevant_content'`. Write `refund` ledger row (no debit ever written). Emit `workflow_events` and stop.

### Stage 6 — extraction (Gemini)

- Concatenate text of relevant pages (ordered) into an extraction prompt.
- Send to Gemini with a **structured JSON schema** matching the canonical `normalized` shape (see [data.md](../data.md#extractions)).
- Include provider context when known: provider name, source fields, and target fields.
- Ask Gemini to preserve provider/source field names when visible, such as `item_code`, `customer_sku`, `vendor_name`, and `ship_to`.
- Temperature 0.
- Retries: up to 2 on `invalid_json` or schema-validation failure; on retry, increase reminder about schema strictness.
- Output stored as `extractions.payload` (raw Gemini response).

### Stage 7 — provider mapping

- Load active `target_fields`.
- Load active `provider_field_mappings` when `provider_id` is known.
- Resolve line products using provider-specific mappings before tenant-wide product mappings:
  1. `source_company_sku`
  2. `source_sku`
  3. `source_description`
  4. tenant-wide `product_mappings`
  5. cached `odoo_products.default_code`
- Store mapping decisions in `extractions.normalized._mapping` or `order_drafts.meta.mapping`.
- Missing required target fields are not a processing failure; they are surfaced in Review and block approval/sync until fixed.

### Stage 8 — normalization

Pure TypeScript (no LLM). Operates on `extractions.payload` to produce `normalized`:

- **Dates**: parse to ISO `YYYY-MM-DD`. Ambiguous formats (`01/02/2026`) resolve by the tenant's `locale` (en → MM/DD, es → DD/MM).
- **Currency**: detect symbol/code; default to PO's explicit currency, fallback to tenant default (future: `tenants.default_currency` — not in Phase 1).
- **Numbers**: strip thousands separators; parse decimals respecting locale.
- **Units**: map common variants (`pcs`, `pza`, `u.`) to canonical `each`; `kg`, `g`, `lb` to metric/imperial.
- **Line totals sanity check**: `quantity * unit_price ≈ line_total` within 1% tolerance. Mismatch → flag the line with `_normalization_warning` in `normalized`, surfaced in Review UI.
- **PO number**: strip whitespace, preserve case.
- **Tax rates**: parse percent (`16%` → `0.16`).

Normalization is deterministic and **testable in isolation** — golden-file tests live alongside.

### Stage 9 — persist (single transaction)

All in one Postgres transaction:

```
INSERT extractions (current=true, payload, normalized, confidence, model_meta)
UPDATE prior extractions for this document SET current=false
UPSERT order_drafts (from normalized)
DELETE order_draft_lines WHERE order_draft_id = ?
INSERT order_draft_lines (from normalized.line_items)
INSERT credit_ledger (kind='debit', amount=computed, document_id=?)
UPDATE documents SET state='needs_review'
```

If the transaction fails, nothing was persisted; the orchestrator decides retry vs. terminal fail. On terminal fail after retries, `documents.state = 'failed_processing'` and (if there was a prior debit from a reprocess) a `refund` is written.

## Retry policy

- **Transient failures** (network, 5xx from Document AI / Gemini, Postgres deadlock): exponential backoff, 3 retries, within the same Edge Function invocation if wall-clock allows.
- **Wall-clock limits**: Edge Function max 150s. If we hit 120s with retries remaining, we **re-enqueue** by invoking `ai-process` again with the same `document_id` and a new `run_id`.
- **Permanent failures** (Gemini returns unparseable output after 2 retries, OCR returns nothing): mark doc `failed_processing` with `last_error`.
- Retry count is tracked via `workflow_events` rows for this `document_id` — not a counter column (avoids write contention).

### Chunking large documents

If OCR returns > 30 pages, the orchestrator splits classification into 3 parallel batches. Extraction still runs as one call if combined text < 150k tokens; else we split by logical sections (cover + groups of line-item pages) and merge results in a follow-up Gemini call ("merge these partial extractions into one coherent PO").

## States

The document moves through:

- `processing` (set by `ingest`, held throughout this workflow)
- `needs_review` on success
- `failed_processing` on terminal failure
- `rejected` as a short-circuit when `relevant_pages = 0`

See [data.md](../data.md#document-lifecycle-documentsstate).

## Business rules

1. **Deterministic cost.** Credit cost is a pure function of `document_pages.is_relevant` — see [credits.md](../credits.md).
2. **One `debit` per document.** Reprocessing requires either a prior `refund` or is a no-op on the ledger.
3. **Atomic persistence.** All of Stage 7 lands together or not at all — no half-saved extractions.
4. **Preserve user edits on re-process.** If `order_drafts` was already edited (fields differ from prior `extractions.normalized`), re-processing creates a new `extraction` but does **not** overwrite edited fields in `order_drafts`. Conflicts are surfaced in the Review UI with a diff — see [workflows/review.md](./review.md).
5. **No PII in events.** `workflow_events.meta` may contain counts, durations, confidence scores; never buyer names, PO numbers, or line-item content.

## Edge cases

- **Empty OCR** (Document AI returns no text) → try once more with higher-quality processor profile; still empty → terminal fail, `last_error='ocr_empty'`.
- **Single-page doc** → still runs all stages; classification on 1 page is cheap.
- **Doc in a language other than en/es** → Document AI detects language; OK for OCR. Gemini handles many languages; we allow it but log a `workflow_events` row with `meta.lang` for visibility.
- **PO with no line items** (e.g. a service PO with a single-line description) → acceptable; `order_draft_lines` gets one row. Review UI shows a hint.
- **PO with > 100 line items** → trigger optional +1 credit adjustment (see [credits.md](../credits.md#credit-cost-formula)); extraction may split into chunks.
- **Mixed PO + other documents in one upload** (e.g. a 20-page scan that's actually 3 POs) → out of scope Phase 1. Classifier treats it as one document; extraction may be garbage; operator rejects. We note this as a known limitation.

## Failure scenarios

| Scenario                                    | Handling                                                                                                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Document AI quota exceeded                  | Transient retry; after 3 fails, terminal with `last_error='ocr_quota'`; alerting.                                                                                                                                                                      |
| Gemini returns non-JSON                     | Retry with stricter prompt; after 2 fails, terminal.                                                                                                                                                                                                   |
| Gemini JSON doesn't match schema            | Validate server-side; retry once with a repair prompt; terminal on second fail.                                                                                                                                                                        |
| Postgres transaction deadlock               | Advisory lock prevents parallel runs for same doc; retry on serialization errors.                                                                                                                                                                      |
| Edge Function cold start timeout            | Orchestrator re-enqueues if < 30s remain; next invocation picks up from scratch (idempotent).                                                                                                                                                          |
| Partial success (classify ok, extract fail) | `document_pages` is already written and survives; `extraction` is not — user sees doc in `failed_processing` and can retry without re-OCRing. (Optimization: cache OCR result under `processing_run_id` for retry; Phase 1 can re-OCR — cheap enough.) |

## Success criteria

- **Throughput**: median time from `ai-process` invocation to `needs_review` ≤ 45 seconds for a 3-page PO.
- **Quality**: ≥ 90% of POs require < 3 manual edits on review (see [product.md](../product.md#success-criteria-phase-1)).
- **Reliability**: < 1% of valid documents end in `failed_processing` after the retry policy.
- **Observability**: every run emits an event per stage; a failed run has enough in `meta` to diagnose without re-running.
- **No PII leak** into logs or events (PR checklist enforced).

## Dependencies

- [services/ai-adapters.md](../services/ai-adapters.md) — Document AI + Gemini client contracts.
- [data.md](../data.md) — `documents`, `document_pages`, `extractions`, `order_drafts`, `order_draft_lines`, `credit_ledger`.
- [credits.md](../credits.md) — cost formula and relevance definition.
- [workflows/upload.md](./upload.md) — upstream producer.
- [workflows/review.md](./review.md) — downstream consumer of `order_drafts`.
