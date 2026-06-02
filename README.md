# DocFlow — AI Purchase Order Automation for Odoo 19

> Turn purchase orders (PDF, email, or photo) into **Odoo 19 Sales Orders**
> automatically. Claude AI reads each document, a human approves in one click,
> and the order lands in Odoo as a `sale.order` — no manual data entry.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Odoo](https://img.shields.io/badge/Odoo-19-714B67?style=flat-square&logo=odoo&logoColor=white)](https://www.odoo.com)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![Anthropic](https://img.shields.io/badge/Claude-Sonnet-D97706?style=flat-square)](https://anthropic.com)
[![License](https://img.shields.io/badge/license-MIT-8b5cf6?style=flat-square)](LICENSE)

> **Note:** public, auditable edition of a production product. Real credentials,
> domains, and customer names have been replaced with placeholders. The code is
> functional but needs your own configuration (Supabase, Anthropic, Odoo 19) to
> run end to end.

---

## What is DocFlow?

**DocFlow is an AI-powered purchase order automation layer for Odoo 19.** It
converts incoming purchase orders — on paper, PDF, or email — into structured
Odoo Sales Orders without re-typing. A supplier uploads a PDF, Claude extracts
every line with prices and quantities, a reviewer approves in seconds, and the
order is pushed to Odoo 19 over native XML-RPC as a `sale.order`.

```
📄 PDF / Email / Photo   →   🤖 Claude AI extracts   →   👤 1-click review   →   ✅ Odoo 19 sale.order
```

### Why DocFlow for Odoo 19?

- **Native Odoo 19 integration** over XML-RPC — creates `sale.order`,
  `res.partner` and `product.product` records directly, no middleware.
- **Zero manual entry** — eliminate the data-entry desk for inbound POs.
- **Human-in-the-loop** — AI extracts, a person approves; full audit trail.
- **ERP-agnostic core** — Odoo 19 supported out of the box; the connector layer
  can target any XML-RPC ERP.

---

## Features

### 📥 Multichannel ingestion

| Channel | Description |
|---|---|
| **Direct upload** | Drag & drop — PDF, image, JPEG, Excel |
| **Email** | Webhook (Mailgun · Resend) or an OAuth email provider |
| **IMAP** | Automatic polling of any mailbox |
| **QR scanner** | QR code → photo from a phone, no login |
| **Portal connectors** | Supplier portal / marketplace connectors, daily cron |

### 🤖 AI extraction

- **Claude Sonnet** — multimodal, reads PDFs and images directly
- Extracts supplier, order number, date, line items, SKU, quantities, prices, totals
- **Review Profiles** — configurable templates per document type
- **Provider Templates** — per-supplier field annotations
- **Auto-approve** — configurable confidence threshold, no human review when the AI is sure
- Idempotent per `processing_run_id` — retries never double-charge the API

### ✅ Review workflow

- Side-by-side view: original PDF + extracted fields
- Inline editing of any field before approval
- Rejection with full audit trail (`rejected_by`, `rejected_at`)
- Bulk actions for high-volume teams
- Reseller mappings: supplier SKU → your own Odoo product

### 🔄 Odoo 19 synchronization

- Native XML-RPC — built and tested against **Odoo 19**
- Creates the `sale.order` with all its lines automatically
- Per-tenant customer and product mapping
- Reseller mode (buy from supplier, sell to customer)
- Rate limiting (30 retries/h per tenant)
- Full log of every push attempt

### 🏢 Multi-tenant

- Full isolation with PostgreSQL Row Level Security (RLS)
- Each tenant has its own Odoo, AI, supplier and mapping configuration
- Email team invitations

### 🛡️ Security & observability

- Token-bucket rate limiting on upload (100/h) and retry-sync (30/h)
- Replay protection on email ingestion (rejects messages older than 15 min)
- HMAC-SHA256 signed QR tokens, 7-day TTL
- `workflow_events` — complete timeline for every document

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        BROWSER                               │
│   Next.js 16 · React 19 · Tailwind v4 · shadcn/ui           │
│   next-intl (en/es) · Sonner · Recharts · TanStack Table    │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼───────────────────────────────┐
│                       WEB (serverless)                        │
│                                                              │
│  /api/upload          → validate, store in Supabase Storage  │
│  /api/scan-links      → generate signed QR (HMAC-SHA256)     │
│  /api/order-drafts/*  → approve · reject · retry-sync       │
│  /api/settings/*      → odoo · ai · team · mappings         │
│  /api/ingest/*        → email webhooks                       │
│  /api/cron/*          → browser-ingest (daily 6am)          │
└──────────────┬───────────────────────────┬───────────────────┘
               │ Supabase JS SDK            │ XML-RPC
┌──────────────▼──────────────┐   ┌────────▼──────────────────┐
│          SUPABASE           │   │          ODOO 19           │
│                             │   │                            │
│  PostgreSQL + RLS           │   │  sale.order                │
│  Auth (magic link)          │   │  res.partner               │
│  Storage (PDFs/images)      │   │  product.product           │
│                             │   └────────────────────────────┘
│  Edge Functions (Deno):     │
│  ├── ai-process  ───────────┼──▶  Anthropic API
│  ├── odoo-sync              │     Claude Sonnet multimodal
│  ├── ingest                 │
│  ├── email-ingest           │
│  ├── odoo-sync-catalog      │
│  └── janitor-uploads        │
└─────────────────────────────┘
```

### Document lifecycle

```
uploaded → processing → needs_review → reviewed → synced
               ↓              ↓            ↓          ↓
            failed         rejected      failed    archived
```

---

## Tech stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js App Router | 16.x |
| UI | React | 19.x |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | v4 |
| Components | shadcn/ui + Radix UI | — |
| i18n | next-intl (en/es) | 4.x |
| Database | Supabase (PostgreSQL) | — |
| Auth | Supabase Auth (magic link) | — |
| Storage | Supabase Storage | — |
| Edge Functions | Supabase Functions (Deno) | — |
| AI / LLM | Anthropic Claude Sonnet | — |
| ERP | **Odoo 19** via XML-RPC | 19 |
| Package manager | pnpm | 10.x |
| Unit tests | Vitest | 4.x |
| E2E tests | Playwright | 1.x |

---

## Project structure

```
docflow/
├── src/
│   ├── app/
│   │   ├── [locale]/               # i18n routes (en / es)
│   │   │   ├── inbox/              # Documents to process
│   │   │   ├── review/[id]/        # Review workspace
│   │   │   ├── processed/          # Synced orders
│   │   │   ├── templates/          # Extraction templates
│   │   │   ├── integrations/       # External connectors
│   │   │   ├── settings/           # Odoo · AI · team · mappings
│   │   │   ├── help/               # Bilingual help center
│   │   │   └── dashboard/          # Metrics and overview
│   │   └── api/                    # Route handlers (Node.js)
│   ├── components/
│   │   ├── app/                    # Product components
│   │   └── ui/                     # shadcn/ui base
│   ├── lib/
│   │   ├── supabase/               # Clients: server · client · middleware
│   │   ├── rate-limit.ts           # Per-tenant token bucket
│   │   └── scan-token.ts           # HMAC for QR
│   └── messages/
│       ├── en.json                 # English translations
│       └── es.json                 # Spanish translations
│
├── supabase/
│   ├── functions/                  # Edge Functions (Deno)
│   │   ├── ai-process/             # Extraction with Claude
│   │   ├── odoo-sync/              # Sync to Odoo 19
│   │   ├── ingest/                 # Document pipeline
│   │   ├── email-ingest/           # Email webhooks
│   │   ├── odoo-sync-catalog/      # Sync Odoo catalog
│   │   └── janitor-uploads/        # Storage cleanup
│   └── migrations/                 # 25+ SQL migrations
│
├── e2e/                            # Playwright tests
├── spec/                           # Product specifications
└── package.json
```

---

## Quick start

### Prerequisites

- Node.js ≥ 22, pnpm ≥ 9
- A Supabase project
- An Anthropic API key
- An Odoo 19 instance reachable over XML-RPC

### Setup

```bash
# 1. Clone
git clone https://github.com/moises-arch/docflow.git && cd docflow

# 2. Install
pnpm install --frozen-lockfile

# 3. Environment variables
cp .env.example .env.local
# edit .env.local with your values

# 4. Database
npx supabase link --project-ref <project-id>
npx supabase db push
pnpm db:types

# 5. Edge Function secrets
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase secrets set INTAKE_SECRETS_KEY=$(openssl rand -hex 32)

# 6. Deploy Edge Functions
npx supabase functions deploy ai-process odoo-sync ingest email-ingest janitor-uploads

# 7. Local server
pnpm dev   # → http://localhost:3001
```

---

## Environment variables

| Variable | Required | Description |
|---|:-:|---|
| `NEXT_PUBLIC_APP_URL` | ✅ | Public app URL |
| `NEXT_PUBLIC_ERP_BASE_URL` | ⬜ | Odoo 19 base URL for deep links |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (server only) |
| `CRON_SECRET` | ✅ | `openssl rand -hex 32` |
| `SCAN_TOKEN_SECRET` | ✅ | `openssl rand -hex 32` |
| `NEXT_PUBLIC_SENTRY_DSN` | ⬜ | Error reporting with Sentry |

> ⚠️ `ANTHROPIC_API_KEY` and `INTAKE_SECRETS_KEY` go in **Supabase Secrets only**, never on the web host.

See [`.env.example`](.env.example) for the full list with descriptions.

---

## Commands

```bash
pnpm dev          # Local server :3001 (turbopack)
pnpm build        # Production build
pnpm typecheck    # TypeScript check (required before deploy)
pnpm test         # Vitest unit tests
pnpm test:e2e     # Playwright e2e tests
pnpm db:types     # Regenerate database.types.ts from Supabase
pnpm format       # Prettier across the repo
```

---

## Use cases & keywords

DocFlow is built for teams that receive a high volume of inbound purchase orders
and want them in **Odoo 19** without manual data entry:

- **Odoo 19 purchase order automation** / **Odoo 19 sales order automation**
- **AI document extraction for Odoo** — PDF, image and email to `sale.order`
- **Odoo 19 EDI / PO ingestion** from supplier portals and marketplaces
- **PDF to Odoo 19** sales order converter with human review
- **Odoo 19 AI integration** powered by Anthropic Claude
- **B2B order automation** and **purchase order OCR** for distributors and resellers
- **Odoo 19 connector** for invoices, purchase orders and product catalogs

Topics: `odoo` · `odoo-19` · `odoo-integration` · `purchase-order-automation` ·
`document-ai` · `sales-order` · `nextjs` · `supabase` · `anthropic-claude` ·
`erp-integration` · `ocr` · `b2b`

---

## License

MIT — see [LICENSE](LICENSE).

---

*⚡ Built by [Mojo Dev](https://github.com/moises-arch)*
