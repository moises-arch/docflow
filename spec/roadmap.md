# Roadmap

## Purpose

Pin the boundary of Phase 1 (what's in, what's out) and name the likely next phases without committing to dates.

This file is a compass, not a contract. Reprioritize freely as customer signal arrives.

## Phase 1 — Engine First (this spec set)

**Goal**: prove that Upload → AI → Review → ERP **works** for a handful of real B2B customers, on real POs, reliably enough to displace manual entry.

**In scope** (covered by the specs in this directory):

- Document upload (PDF, images) with basic validation.
- AI pipeline: Document AI OCR → page classification → Gemini extraction → normalization.
- Human review with inline edits, customer/product mapping, approve/reject.
- Provider profiles for distributor-specific field mappings and SKU aliases.
- ERP 19 push: Draft Sales Order creation, idempotent, with actionable error surfaces.
- Multi-tenant isolation via Supabase RLS.
- Per-tenant ERP credentials, encrypted at rest.
- Bilingual UI (en/es) via next-intl.
- Credit ledger (internal unit, no Stripe wired).
- Four screens: Inbox, Review, Processed, Settings.

**Explicitly out of scope for Phase 1** (and why):

| Feature                                    | Why deferred                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Stripe Checkout + subscription UI          | Don't monetize until the engine is proven useful.                                                                         |
| Self-service tenant sign-up                | Manual provisioning gives us direct customer contact during the proof phase.                                              |
| Subdomains (`acme.intake.app`)             | Cosmetic; not a purchase-decision driver yet.                                                                             |
| Per-tenant branding (logo, colors)         | Same.                                                                                                                     |
| Public API / webhooks / Zapier             | Nobody has asked yet; premature abstraction.                                                                              |
| Full self-serve Email-to-DocFlow            | Foundation is now specified, but production rollout needs webhook hardening, sender controls, and dedup monitoring.       |
| Mobile-first UX                            | Back-office users are on desktop.                                                                                         |
| Auto-confirming SOs in ERP                | Customers want human approval at DocFlow AND confirmation in ERP. Breaking their workflow is worse than "one extra step". |
| Tenant switcher UI                         | Data model supports multi-tenant membership; UI exposes primary tenant only.                                              |
| Fine-grained roles (viewer, approver-only) | Two-role model (owner/member) is enough for small teams.                                                                  |
| Auto-learning from corrections             | Captured in data (`extractions` + `order_drafts` diffs), not yet fed into prompts/fine-tunes.                             |
| ERP integrations beyond ERP               | We're ERP-first. Others come after the ERP motion is solid.                                                             |
| UoM conversion in line items               | Defaults to ERP's product UoM; acceptable for most POs.                                                                  |
| Cross-tenant admin dashboard               | Internal tool, but support script is fine for 5–10 tenants.                                                               |
| Reconciliation with ERP-side changes      | If an SO is deleted/modified in ERP, DocFlow doesn't notice. Known gap.                                                   |

## Phase 2 — Monetize & harden

**Trigger**: 3+ paying-intent tenants on Phase 1 who've processed ≥ 100 POs each, with ≥ 90% review-accept rate.

**Candidate work** (order TBD by customer signal):

- **Stripe integration**: Checkout, subscriptions, webhooks, balance gating at upload. Foundations already in `credit_ledger` and `billing_customers` (see [credits.md](./credits.md)).
- **Self-service sign-up** with email verification and a simple onboarding wizard (tenant creation → ERP connect → first upload).
- **Provider mapping setup UI** — a dedicated UI to review and bulk-edit provider source fields, target fields, and SKU aliases.
- **Email-to-DocFlow rollout** — a per-tenant inbox address (e.g. `acme@in.intake.app`) that accepts forwarded POs. Requires email parsing + auth (DKIM/SPF check, sender allowlist).
- **OCR-result caching** across retries so re-extraction doesn't re-OCR.
- **Auto-partner creation** in ERP (with confirmation) when no mapping exists.
- **Reconciliation** with ERP-side SO state (periodic poll or ERP webhook if available).
- **Observability UI** — per-tenant dashboard of throughput, error rates, credit burn.
- **MFA** on Supabase Auth for owners.

## Phase 3 — Scale & differentiate

**Trigger**: ~25+ active tenants; noticeable feature-request overlap.

**Candidate work**:

- **Additional ERPs** (SAP Business One, QuickBooks, NetSuite). Requires abstracting [services/odoo.md](./services/odoo.md) into a generic "ERP adapter" interface — the hook is there (`OdooClient` interface), but the workflow [workflows/odoo-sync.md](./workflows/odoo-sync.md) currently assumes ERP idioms.
- **Subdomains + branding** per tenant.
- **Public API** (REST) for programmatic upload and sync-status polling.
- **Webhook emitter** (intake.document.reviewed, etc.).
- **Auto-learning**: use operator edits as a labeled dataset; periodically fine-tune or few-shot-refresh the extraction prompt per tenant.
- **Richer roles**: approver-only, viewer, auditor.
- **Audit log UI** — already have `workflow_events`; expose it.
- **Quotes and invoices** — same pipeline, different ERP model (`account.move`). Treat as separate product mode.

## Parking lot

Ideas we've noted but don't plan to act on without explicit signal:

- Browser extension for drag-and-drop from Gmail.
- On-prem / self-hosted edition for security-sensitive customers.
- Line-item price verification against a customer's contract pricing.
- Duplicate-PO detection across time.
- OCR-confidence heatmap overlaid on the PDF viewer in Review.

## What the roadmap is not

- **Not a commitment.** These are candidates; actual order is driven by customer signal and revenue.
- **Not exhaustive.** New items surface monthly; we add them here when they mature past "someone mentioned it once."
- **Not a product plan.** That lives in a separate doc when we have one.

## Dependencies

- [product.md](./product.md) — what Phase 1 is for and who it's for.
- [credits.md](./credits.md) — Stripe-ready foundation referenced in Phase 2.
- [services/odoo.md](./services/odoo.md) — interface reuse for multi-ERP in Phase 3.
