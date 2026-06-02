# UI — Screens

## Purpose

Describe the four screens of Phase 1 — **Inbox**, **Review**, **Processed**, **Settings** — at the level of layout, components, actions, and i18n surfaces. This spec is the bridge between workflows and the actual Next.js app.

Visual tokens (color, typography, spacing, radii, motion) and component specifications live in [design-system.md](./design-system.md). This file uses those components — it does not redefine them.

## Responsibilities

- Describe each screen's layout, data dependencies, and available actions.
- Define i18n namespaces per screen.
- Document loading, empty, error, and permission states.
- Pin UX principles: density, table-first, action clarity.

## Global principles

- **Desktop-first.** All screens target ≥ 1280px. Mobile is supported (≥ 375px) to not-break; we don't optimize for it in Phase 1.
- **Table-first.** Inbox and Processed are tables. No cards, no kanban.
- **Compact density.** Rows are 32–36px tall. No hero sections, no marketing-style imagery.
- **Monochrome + muted accents.** Neutral base; the 8-color Attio-style palette (see [design-system.md](./design-system.md#color--accent-palette-attio-style-8-tints)) is reserved for status pills and avatars. Never decorative.
- **No shadows, no gradients.** Borders define elevation. Enforced at the design-system level.
- **Actions are obvious.** Primary action on each screen is never more than one click away. Destructive actions (reject, delete mapping) confirm via a dialog.
- **No orphan states.** Every screen has an empty state, a loading state, and an error state — each with i18n copy. Primitives in [design-system.md](./design-system.md#empty--loading--error-states).
- **Keyboard-first.** `⌘K` command palette is central; every primary action has a shortcut. See [design-system.md](./design-system.md#command-palette-k).

## Layout shell

All screens share a shell:

```
┌────────────────────────────────────────────────────────────────────┐
│  [DocFlow]    Inbox · Review · Processed · Settings           [🙂]  │  ← top bar
├────────────┬───────────────────────────────────────────────────────┤
│            │                                                       │
│   (no      │              <screen content>                         │
│  sidebar   │                                                       │
│  in P1)    │                                                       │
│            │                                                       │
└────────────┴───────────────────────────────────────────────────────┘
```

- Top-bar nav only. Sidebar is deferred — we don't have enough screens to justify it in Phase 1.
- User menu (top-right): user name, active tenant name, locale toggle (en/es), sign out.
- Tenant switcher: deferred to post-Phase-1 (data model supports multi-tenant membership from day one; UI exposes only the primary tenant in P1).

## i18n

Every string is a `next-intl` key. Top-level namespaces per screen:

```
app.nav.{inbox|review|processed|settings}
app.user_menu.{sign_out|switch_locale}
inbox.{empty|table|actions|upload|errors}
review.{header|lines|actions|mapping|conflicts|errors}
processed.{empty|table|filters|actions|errors}
settings.{odoo|team|credits|general|errors}
common.{yes|no|cancel|save|confirm|loading|retry|...}
```

Locale selection: resolved by middleware based on URL prefix (`/en/*`, `/es/*`). Default per tenant in `tenants.locale`.

## Screen — Inbox

### Purpose

Land here after sign-in. Upload new POs and handle anything that's waiting for human review.

### Route

`/[locale]/inbox`

### Data

- `documents` where `state in ('uploaded','processing','needs_review','failed_processing')`, ordered by `created_at desc`.
- Realtime subscription for state transitions (see [architecture.md](./architecture.md)).

### Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  Inbox                                          [Upload ▾]  [🔎]    │
├────────────────────────────────────────────────────────────────────┤
│  ▼ Drop zone (collapsible, expanded by default if empty)            │
├────────────────────────────────────────────────────────────────────┤
│  Status   File              Uploaded    Pages  Credits   Actions    │
│  ●Proc…   po-2026-04-16.pdf 10:41       —      —         —          │
│  ●Review  po-acme-123.pdf   10:39       3      1         [Review]   │
│  ●Failed  po-bad-scan.pdf   10:20       —      —         [Retry]    │
│  ...                                                                │
└────────────────────────────────────────────────────────────────────┘
```

### Columns

| Column   | Content                                                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Status   | Dot + label. States: `uploaded`, `processing`, `needs_review`, `failed_processing`. `rejected` hidden (goes to Processed archive filter). |
| File     | Original filename (truncated, full on hover).                                                                                             |
| Uploaded | Relative time (`3m ago`) with full timestamp on hover.                                                                                    |
| Pages    | Total page count (from `documents.page_count` once OCR'd).                                                                                |
| Credits  | Cost (from `credit_ledger` or preview).                                                                                                   |
| Actions  | Primary: `[Review]` for `needs_review`, `[Retry]` for `failed_processing`. Nothing for in-progress states.                                |

### Actions

- **Upload** (primary): opens file picker or accepts drops. Multi-file supported. Kicks off [workflows/upload.md](./workflows/upload.md).
- **Row click**: opens Review for that document. Disabled if state ≠ `needs_review`.
- **Retry** (on `failed_processing`): re-invokes `ai-process`.

### States

- **Empty**: the drop zone is prominent, plus a short i18n blurb (`inbox.empty.title`, `inbox.empty.subtitle`).
- **Loading**: skeleton rows.
- **Uploading**: rows inserted optimistically with a progress bar.
- **Error banner**: appears at top when any document is `failed_processing` with actionable text.

### Permission

All members can see Inbox. No owner-only gating.

## Screen — Review

### Purpose

Verify and correct a single extraction. Approve or reject.

### Route

`/[locale]/review/[documentId]`

### Data

- `documents[documentId]` (must be in `needs_review`, else redirect to Processed).
- `extractions` where `current=true` for this doc.
- `order_drafts` (1:1).
- `order_draft_lines` (ordered by `position`).
- PDF signed URL from Storage.
- `customer_mappings`, `product_mappings` for the tenant (for search/resolve).

### Layout — 3 columns (canonical)

Full layout, column widths, responsive breakpoints, and top-bar spec: see [design-system.md — Review screen](./design-system.md#review-screen--3-column-layout-canonical).

Summary:

- **Left (240px)** — Properties panel: key facts (PO number, date, currency, customer w/ mapping badge, total) + Activity log. Collapsible via `⌘B`.
- **Center (flex)** — PDF viewer (sticky). Page thumbnails; relevant pages marked with accent, irrelevant faded.
- **Right (420px)** — Extraction editor: Header, Lines, Totals, Notes. Scrollable.
- **Top bar (h-12)** — Back · breadcrumb · `⌘⇧N next` hint · Reject dropdown · Approve primary.

### Components

- **Header form** (right column): fields bound to `order_drafts`. Inline edit; autosave on blur. Uses `<Input>` / `<Select>` from [design-system.md](./design-system.md#input--textarea--select).
- **Customer mapping badge** (left column, "Customer" property):
  - Teal `✓ Mapped` when `customer_mapping_id` is set.
  - Amber `Map customer` when unresolved → opens a dialog that searches ERP `res.partner` (via [services/odoo.md](./services/odoo.md)). See [workflows/review.md](./workflows/review.md#mapping-resolution).
  - Rendered with the `<StatusBadge>` primitive — see [design-system.md](./design-system.md#status-pill-system).
- **Lines table** (right column): inline-editable. Columns: position, SKU, description, qty, unit, unit price, tax rate, line total. Add/remove rows. Follows the table patterns in [design-system.md](./design-system.md#table) — dense, keyboard-navigable, tabular numbers.
- **Product mapping per line**: a compact badge cell per row, same pattern as customer.
- **Totals** (right column, pinned to bottom of section): computed client-side; server recomputes on save and flags mismatch with an inline warning `<Banner kind="warning">`.
- **Notes**: `<Textarea>`, expandable.
- **Activity log** (left column): chronological list with `<Avatar>` + timestamp + one-line description. Sourced from `workflow_events` + edit history.

### Actions

- **Approve**: calls `POST /api/order-drafts/:id/approve`. Disabled if:
  - No lines exist.
  - An autosave is in flight.
  - Currency is missing.
- **Reject ▾**: dropdown with reasons (`wrong_document`, `duplicate`, `low_quality`, `other`). Calls `POST /api/order-drafts/:id/reject`.
- **Retry AI** (menu): re-runs extraction; surfaces conflict UI if edits exist. See [workflows/review.md](./workflows/review.md#edit-preservation-on-re-processing).

### Conflict UI (after Retry AI)

- A blue banner at the top: "X fields changed after re-extraction."
- Each conflicting field shows old / new / current with three choices: Keep mine · Accept new · Merge manually.
- Stored in `order_drafts.meta.conflicts` and cleared on resolution.

### Keyboard

Full shortcut list lives in [design-system.md — Command palette](./design-system.md#contextual-shortcuts--review-screen). The essentials:

- `Tab` / `Shift+Tab` cycle fields top to bottom.
- `⌘Enter` approves (if enabled).
- `⌘⇧R` rejects.
- `⌘⇧N` / `⌘⇧P` next / previous document.
- `⌘B` toggles Properties panel.
- `Esc` exits the nearest dialog or, at the root, returns to Inbox (confirms if unsaved).

### States

- **Loading**: skeleton in both panes.
- **Stale** (document state changed while open): banner "This document was updated elsewhere" with a Refresh button.
- **Error on autosave**: inline error beneath the field + banner "Changes not saved".
- **RLS/permission error**: redirect to Inbox with toast.

### Permission

Members + owners.

## Screen — Processed

### Purpose

View reviewed, synced, failed-sync, and rejected documents. Resolve sync failures.

### Route

`/[locale]/processed`

### Data

- `documents` where `state in ('reviewed','rejected','archived')` joined with `order_drafts`.
- Ordered by `updated_at desc`.
- Filter: by `sync_state`, by date range, search by PO number / filename.

### Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  Processed                         [Filter ▾]  [Search 🔎]          │
├────────────────────────────────────────────────────────────────────┤
│  Sync     PO #      Buyer       Date       ERP SO    Total        │
│  ●Synced  ACME-123  Acme Corp   04-16      S00123     $145.00      │
│  ●Failed  BOLT-99   —           04-16      —          $—           │
│  ●Rejctd  —         —           04-15      —          —            │
│  ...                                                                │
└────────────────────────────────────────────────────────────────────┘
```

### Columns

| Column  | Content                                                                       |
| ------- | ----------------------------------------------------------------------------- |
| Sync    | Dot + label: `Synced`, `Pending`, `Failed`, `Rejected`.                       |
| PO #    | From `order_drafts.po_number`.                                                |
| Buyer   | Resolved partner name, or raw extracted if unmapped.                          |
| Date    | `po_date`.                                                                    |
| ERP SO | `odoo_so_name` with link to the ERP record (opens tenant's ERP in new tab). |
| Total   | Formatted currency.                                                           |

### Row expanded (on click)

A side drawer shows:

- Sync attempt history (`odoo_sync_attempts` rows).
- Last error with i18n-ed code.
- Inline actions: **Retry push**, **Map customer**, **Map products**, **Re-review** (re-opens Review screen).

### Actions

- **Retry push** (on `sync_failed`): re-invokes `odoo-sync`.
- **Map customer / products**: opens the same dialogs as Review, for drafts that failed due to mapping.
- **Re-review**: reopens Review; allowed on `reviewed` and `sync_failed` drafts (not on `rejected` or `synced`).

### Filters

- `Sync state`: synced, pending, failed, rejected.
- `Date range`: `po_date` or `approved_at`.
- `Search`: fuzzy over `po_number`, `buyer.name`, filename.

### States

- **Empty**: "No processed documents yet." CTA to Inbox.
- **Loading**: skeletons.
- **Error**: standard banner.

### Permission

All members.

## Screen — Settings

### Purpose

Configure the tenant. Phase 1 scope is intentionally narrow.

### Route

`/[locale]/settings`

### Sections (stacked, one-column, not tabs — shorter to scan)

#### 1. General

- Tenant name (owner-editable).
- Locale default (`en`/`es`).
- Display timezone.

#### 2. ERP connection

- Base URL, Database, Username, API key (masked).
- [Test connection] button → calls `OdooClient.testConnection()`, surfaces result inline.
- Status dot: `unverified`, `active`, `error`. Synced from `odoo_connections.status`.
- "Update API key" opens a fresh field; previous ciphertext replaced on save (see [tenancy-auth.md](./tenancy-auth.md#access-pattern)).

#### 3. Team

- List of tenant members (name, email, role).
- [Invite member] → email + role picker. Sends a Supabase invite (see [tenancy-auth.md](./tenancy-auth.md#invitations-phase-1-minimal)).
- Remove member (owner-only). Owners can't remove themselves if sole owner.

#### 4. Credits

- Current `balance` from `credit_balances` view.
- Recent ledger events (last 20): date, kind, amount, note.
- Overdraft banner if `balance < 0` (Phase 1: informational only).
- No checkout / top-up. An inline note: "Self-service purchase coming soon" (i18n).

#### 5. Mappings (read-only summary)

- Counts: `customer_mappings` total, `product_mappings` total.
- Link to a separate Mappings screen **deferred** (Phase 1 manages mappings inline during Review / Processed flows).

### Actions

- Save (per section).
- Invite member / remove member (team).
- Test connection (ERP).

### Permission

- **Owners**: can see and edit all sections.
- **Members**: can see General, Credits (balance only). ERP connection and Team are hidden.

## Shared primitives

All cross-screen primitives (`<EmptyState>`, `<SkeletonTable>`, `<InlineError>`, `<Banner>`, `<ConfirmDialog>`, `<StatusBadge>`, `<Avatar>`, `<Spinner>`) are defined once in [design-system.md](./design-system.md). Screens consume them — they do not redefine visuals.

## Success criteria

- All user-facing text resolves from `next-intl`; zero hardcoded strings (ESLint rule).
- Inbox → Review → Approve flow completes in **≤ 3 clicks** from dashboard entry, for a typical PO.
- No screen has a state with no i18n-ed copy (empty, loading, error).
- Desktop layout does not require horizontal scroll at 1280px for any table.

## Dependencies

- [workflows/upload.md](./workflows/upload.md) — Inbox dropzone.
- [workflows/ai-processing.md](./workflows/ai-processing.md) — realtime state transitions surfaced in Inbox.
- [workflows/review.md](./workflows/review.md) — Review screen.
- [workflows/odoo-sync.md](./workflows/odoo-sync.md) — Processed retry actions.
- [credits.md](./credits.md) — Settings credits section.
- [tenancy-auth.md](./tenancy-auth.md) — Settings ERP + team sections.
- [data.md](./data.md) — all data shapes.
