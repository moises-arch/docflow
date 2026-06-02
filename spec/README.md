# DocFlow — Spec System

This directory is the **single source of truth** for DocFlow: a B2B product that automates purchase-order ingestion from uploaded documents into **Odoo 19** via an AI pipeline.

Core flow: **Upload → AI processing → Review → Push to Odoo 19.**

These specs describe **Phase 1 — Engine First**. Stripe UI, per-tenant branding, subdomains, admin dashboards, team management, public APIs are deferred — see [roadmap.md](./roadmap.md).

---

## How to use this system

1. Read [product.md](./product.md) — what we're building and for whom.
2. Read [architecture.md](./architecture.md) — system shape and data flow.
3. Drill into workflows, services, data, UI, or tenancy as you implement each slice.

Every spec follows the same skeleton so you can skim consistently:

> **Purpose · Responsibilities · Inputs · Outputs · Data structures · States · Business rules · Edge cases · Failure scenarios · Success criteria · Dependencies.**

---

## Reading order by role

- **Product / PM** → [product.md](./product.md), `workflows/*`, [ui.md](./ui.md)
- **Backend engineer** → [architecture.md](./architecture.md), [data.md](./data.md), `services/*`, `workflows/*`
- **Frontend engineer** → [architecture.md](./architecture.md), [design-system.md](./design-system.md), [ui.md](./ui.md), [workflows/review.md](./workflows/review.md), [tenancy-auth.md](./tenancy-auth.md)
- **Platform / DevOps** → [architecture.md](./architecture.md), [data.md](./data.md), [tenancy-auth.md](./tenancy-auth.md)
- **AI engineer** → [workflows/ai-processing.md](./workflows/ai-processing.md), [services/ai-adapters.md](./services/ai-adapters.md)

---

## Index

### Core

- [product.md](./product.md) — vision, users, value prop, non-goals, success metrics
- [architecture.md](./architecture.md) — components, deployment, data flow, runtime boundaries
- [roadmap.md](./roadmap.md) — Phase 1 boundary + post-Phase-1 trajectory

### Data

- [data.md](./data.md) — domain entities, Postgres schema, indexes, **RLS inline**

### Auth & tenancy

- [tenancy-auth.md](./tenancy-auth.md) — Supabase Auth, tenant isolation, per-tenant secrets

### Workflows (end-to-end engine flows)

- [workflows/upload.md](./workflows/upload.md)
- [workflows/ai-processing.md](./workflows/ai-processing.md)
- [workflows/review.md](./workflows/review.md)
- [workflows/odoo-sync.md](./workflows/odoo-sync.md)

### Services (logical modules, each owns its contract)

- [services/ai-adapters.md](./services/ai-adapters.md) — Document AI + Gemini
- [services/odoo.md](./services/odoo.md) — Odoo 19 client

### UI

- [ui.md](./ui.md) — Inbox, Review, Processed, Settings
- [design-system.md](./design-system.md) — tokens, components, patterns (Attio-first, Vercel-strict)

### Setup

- [setup.md](./setup.md) — pre-code checklist: repo, Supabase, auth, i18n, CI, first deploy

---

## Global conventions

These are **invariants** — every spec must respect them. If a spec conflicts with a convention, the convention wins.

### Tenancy

- Every tenant-scoped table carries `tenant_id uuid not null`.
- Tenant isolation is enforced by **Postgres RLS**, not application code. See [data.md](./data.md) and [tenancy-auth.md](./tenancy-auth.md).
- Service-role (Edge Functions, server actions) bypasses RLS _only_ when it has resolved `tenant_id` from a trusted source.

### State separation

**Document lifecycle state ≠ Odoo sync state.** This is a load-bearing invariant.

- A document can reach `reviewed` and never be pushed to Odoo.
- An Odoo push can fail and retry without regressing the document state.
- See [data.md](./data.md) for the two state machines and [workflows/odoo-sync.md](./workflows/odoo-sync.md) for transitions.

### Idempotency

Every externally-visible side effect is keyed so it can be safely retried:

- Odoo pushes use `(tenant_id, order_draft_id, attempt_key)` idempotency.
- Credit deductions reference `document_id` and are idempotent per document.
- Upload processing uses `document_id` as the run key.

### Internationalization

- **No hardcoded user-facing strings.** All copy is a `next-intl` key under the relevant domain namespace (e.g. `inbox.empty`, `review.action.approve`).
- English + Spanish supported from day one.
- Error messages surfaced to users are also i18n keys; internal log messages are English-only.

### Observability

Every workflow emits structured events with at minimum:
`tenant_id`, `document_id` (when applicable), `run_id`, `stage`, `outcome`, `duration_ms`, `error_code?`.

- Logs are plain JSON lines.
- PII (document contents, customer names from POs) must not be logged at INFO or below.

### Odoo

- Target Odoo version is **19** (released late 2025). The adapter is built behind an interface (`services/odoo.md`) so we can swap it if APIs shift.
- Odoo writes are always **Draft Sales Orders** in Phase 1 — never confirmed, never invoiced.

---

## Cross-reference rules

Dependency direction is strict — respect it to keep specs decoupled:

- **Workflows** may reference services and data. Not UI. Not other workflows directly (they interact via persisted state).
- **Services** may reference data only. Not workflows. Not UI. Not other services except via explicit contract.
- **UI** references workflows and data. Never services directly.
- **Data** references only other data.
- **This file** (`README.md`) is the only spec that references everything.

If a rule needs to exist in two places, one of them is wrong — extract it to its owning spec and link.

---

## What's not here (and why)

- **No implementation code.** Minimal SQL DDL or type shapes are allowed only to disambiguate structure.
- **Design tokens** live in [design-system.md](./design-system.md). [ui.md](./ui.md) describes screen-level behavior.
- **No public API spec.** Phase 1 has no public API surface; internal Edge Function contracts are covered by their owning workflow.
- **No tests spec.** Testing strategy is per-workflow and appears inline under "Success criteria".

---

*⚡ Built by [Mojo Dev](https://github.com/moises-arch)*
