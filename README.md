# DocFlow — AI Document Processing

> Convierte órdenes de compra en papel, PDF o email en registros de venta
> estructurados y sincronizados a tu ERP — sin re-tipeo manual.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![Anthropic](https://img.shields.io/badge/Claude-Sonnet-D97706?style=flat-square)](https://anthropic.com)
[![License](https://img.shields.io/badge/license-MIT-8b5cf6?style=flat-square)](LICENSE)

> **Nota:** versión pública y auditable de un producto interno. Las credenciales,
> dominios y nombres de proveedores reales han sido reemplazados por
> placeholders. El código es funcional pero requiere tu propia configuración
> (Supabase, Anthropic, ERP) para correr de punta a punta.

---

## ¿Qué es DocFlow?

DocFlow convierte **órdenes de compra en papel o PDF** en registros de ventas
sincronizados en un ERP, sin re-tipeo manual. Un proveedor sube un PDF, Claude
extrae cada línea con precios y cantidades, un revisor aprueba en segundos, y el
pedido llega al ERP como orden de venta.

```
📄 PDF / Email / Foto    →    🤖 Claude AI extrae    →    👤 Revisor 1 clic    →    ✅ ERP sale order
```

---

## Características

### 📥 Ingestión multicanal

| Canal | Descripción |
|---|---|
| **Upload directo** | Drag & drop — PDF, imagen, JPEG, Excel |
| **Email** | Webhook (Mailgun · Resend) o un proveedor de correo vía OAuth |
| **IMAP** | Polling automático de cualquier buzón |
| **QR Scanner** | Código QR → foto desde celular, sin login |
| **Conectores de portal** | Conectores de portal de proveedor / marketplace, cron diario |

### 🤖 Extracción con IA

- **Claude Sonnet** — multimodal, lee PDFs e imágenes directamente
- Extrae proveedor, número de orden, fecha, líneas, SKU, cantidades, precios y totales
- **Review Profiles** — plantillas configurables por tipo de documento
- **Provider Templates** — anotaciones de campos específicas por proveedor
- **Auto-approve** — umbral de confianza configurable, sin revisión humana cuando la IA está segura
- Idempotencia por `processing_run_id` — los reintentos no duplican gasto de API

### ✅ Workflow de revisión

- Vista lado a lado: PDF original + campos extraídos
- Edición inline de cualquier campo antes de aprobar
- Rechazo con auditoría completa (`rejected_by`, `rejected_at`)
- Bulk actions para equipos de alto volumen
- Reseller mappings: SKU de proveedor → producto propio del ERP

### 🔄 Sincronización con el ERP

- XML-RPC nativo
- Crea la orden de venta con todas sus líneas automáticamente
- Mapeo de clientes y productos configurable por tenant
- Modo reseller (compra a proveedor, vende al cliente)
- Rate limiting (30 reintentos/h por tenant)
- Log completo de cada intento

### 🏢 Multi-tenant

- Aislamiento completo con RLS (Row Level Security) de PostgreSQL
- Cada tenant tiene su propia configuración de ERP, IA, proveedores y mappings
- Invitaciones por email al equipo

### 🛡️ Seguridad y observabilidad

- Rate limiting token-bucket en upload (100/h) y retry-sync (30/h)
- Replay protection en email-ingest (rechaza mensajes > 15 min)
- Tokens QR firmados con HMAC-SHA256, TTL 7 días
- `workflow_events` — timeline completo de cada documento

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│                        BROWSER                               │
│   Next.js 16 · React 19 · Tailwind v4 · shadcn/ui           │
│   next-intl (es/en) · Sonner · Recharts · TanStack Table    │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼───────────────────────────────┐
│                       WEB (serverless)                        │
│                                                              │
│  /api/upload          → valida, guarda en Supabase Storage   │
│  /api/scan-links      → genera QR firmado (HMAC-SHA256)      │
│  /api/order-drafts/*  → approve · reject · retry-sync       │
│  /api/settings/*      → erp · ai · team · mappings          │
│  /api/ingest/*        → webhooks de email                    │
│  /api/cron/*          → browser-ingest (diario 6am)         │
└──────────────┬───────────────────────────┬───────────────────┘
               │ Supabase JS SDK            │ XML-RPC
┌──────────────▼──────────────┐   ┌────────▼──────────────────┐
│          SUPABASE           │   │            ERP             │
│                             │   │                            │
│  PostgreSQL + RLS           │   │  sale order                │
│  Auth (magic link)          │   │  partner                   │
│  Storage (PDFs/imágenes)    │   │  product                   │
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

### Estado de un documento

```
uploaded → processing → needs_review → reviewed → synced
               ↓              ↓            ↓          ↓
            failed         rejected      failed    archived
```

---

## Stack tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| Framework | Next.js App Router | 16.x |
| UI | React | 19.x |
| Lenguaje | TypeScript | 5.x |
| Estilos | Tailwind CSS | v4 |
| Componentes | shadcn/ui + Radix UI | — |
| i18n | next-intl | 4.x |
| Base de datos | Supabase (PostgreSQL) | — |
| Auth | Supabase Auth (magic link) | — |
| Storage | Supabase Storage | — |
| Edge Functions | Supabase Functions (Deno) | — |
| IA / LLM | Anthropic Claude Sonnet | — |
| ERP | XML-RPC | — |
| Package manager | pnpm | 10.x |
| Tests unit | Vitest | 4.x |
| Tests e2e | Playwright | 1.x |

---

## Estructura del proyecto

```
docflow/
├── src/
│   ├── app/
│   │   ├── [locale]/               # Rutas con i18n (es / en)
│   │   │   ├── inbox/              # Documentos por procesar
│   │   │   ├── review/[id]/        # Workspace de revisión
│   │   │   ├── processed/          # Órdenes sincronizadas
│   │   │   ├── templates/          # Plantillas de extracción
│   │   │   ├── integrations/       # Conectores externos
│   │   │   ├── settings/           # ERP · IA · equipo · mappings
│   │   │   ├── help/               # Centro de ayuda bilingüe
│   │   │   └── dashboard/          # Métricas y resumen
│   │   └── api/                    # Route handlers (Node.js)
│   ├── components/
│   │   ├── app/                    # Componentes del producto
│   │   └── ui/                     # shadcn/ui base
│   ├── lib/
│   │   ├── supabase/               # Clients server · client · middleware
│   │   ├── rate-limit.ts           # Token bucket por tenant
│   │   └── scan-token.ts           # HMAC para QR
│   └── messages/
│       ├── en.json                 # Traducciones inglés
│       └── es.json                 # Traducciones español
│
├── supabase/
│   ├── functions/                  # Edge Functions (Deno)
│   │   ├── ai-process/             # Extracción con Claude
│   │   ├── odoo-sync/              # Sync al ERP
│   │   ├── ingest/                 # Pipeline de documentos
│   │   ├── email-ingest/           # Email webhooks
│   │   ├── odoo-sync-catalog/      # Sincroniza catálogo del ERP
│   │   └── janitor-uploads/        # Limpieza de storage
│   └── migrations/                 # 25+ migraciones SQL
│
├── e2e/                            # Tests Playwright
├── spec/                           # Especificaciones del producto
└── package.json
```

---

## Inicio rápido

### Prerrequisitos

- Node.js ≥ 22, pnpm ≥ 9
- Proyecto en Supabase
- API key de Anthropic
- Instancia de ERP accesible vía XML-RPC

### Setup

```bash
# 1. Clonar
git clone https://github.com/your-org/docflow.git && cd docflow

# 2. Instalar
pnpm install --frozen-lockfile

# 3. Variables de entorno
cp .env.example .env.local
# editar .env.local con tus valores

# 4. Base de datos
npx supabase link --project-ref <project-id>
npx supabase db push
pnpm db:types

# 5. Secrets de Edge Functions
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase secrets set INTAKE_SECRETS_KEY=$(openssl rand -hex 32)

# 6. Deploy Edge Functions
npx supabase functions deploy ai-process odoo-sync ingest email-ingest janitor-uploads

# 7. Servidor local
pnpm dev   # → http://localhost:3001
```

---

## Variables de entorno

| Variable | Requerida | Descripción |
|---|:-:|---|
| `NEXT_PUBLIC_APP_URL` | ✅ | URL pública de la app |
| `NEXT_PUBLIC_ERP_BASE_URL` | ⬜ | Base URL del ERP para deep links |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | Key anon de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (solo server) |
| `CRON_SECRET` | ✅ | `openssl rand -hex 32` |
| `SCAN_TOKEN_SECRET` | ✅ | `openssl rand -hex 32` |
| `NEXT_PUBLIC_SENTRY_DSN` | ⬜ | Error reporting con Sentry |

> ⚠️ `ANTHROPIC_API_KEY` e `INTAKE_SECRETS_KEY` van **solo en Supabase Secrets**, nunca en el host web.

Ver [`.env.example`](.env.example) para la lista completa con descripciones.

---

## Comandos

```bash
pnpm dev          # Servidor local :3001 (turbopack)
pnpm build        # Build de producción
pnpm typecheck    # Verificación TypeScript (obligatorio antes de deploy)
pnpm test         # Vitest unit tests
pnpm test:e2e     # Playwright e2e tests
pnpm db:types     # Regenera database.types.ts desde Supabase
pnpm format       # Prettier en todo el repo
```

---

## Licencia

MIT — ver [LICENSE](LICENSE).
