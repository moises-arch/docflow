# Setup — Pre-code checklist

## Goal

Work through this file **top to bottom**. At the end you have:

- Repo scaffolded with Next.js 16.2 + TypeScript + Tailwind v4 + shadcn/ui.
- Supabase project linked, schema from [data.md](./data.md) migrated, RLS enabled.
- Auth middleware wired; a placeholder `/sign-in` page works.
- `next-intl` with `en` + `es` locales bootstrapped.
- Edge Functions folder scaffolded (empty stubs).
- Sentry connected.
- ESLint + Prettier + stylelint enforcing the rules from [design-system.md](./design-system.md).
- GitHub repo + CI green on PR.
- First Vercel deploy succeeds.

Then — and only then — you start writing the actual product (Inbox, Review, AI pipeline, ERP sync).

This is **plumbing**, not product. Don't skip sections; each downstream section assumes the prior ones are done.

---

## 0. Machine prereqs

Check each:

```bash
node --version          # must be 24.x (LTS)
pnpm --version          # 9.x+
git --version           # any recent
docker --version        # needed for supabase local dev
```

Missing anything? Install:

```bash
# Node 24 via fnm (recommended)
brew install fnm
fnm install 24 && fnm default 24

# pnpm
corepack enable && corepack prepare pnpm@latest --activate

# Supabase CLI
brew install supabase/tap/supabase

# GitHub CLI (for repo + PRs)
brew install gh && gh auth login

# Docker Desktop (for supabase local)
brew install --cask docker
```

**Editor**: VS Code or Cursor. Install extensions: ESLint, Prettier, Tailwind CSS IntelliSense, Error Lens.

---

## 1. Accounts & provisioning

You said you already have all of these except the domain. Double-check you have access to each **now**, before writing code:

- [ ] **GitHub** organization or personal account with private repo quota
- [ ] **Supabase** — 3 projects: `docflow-dev`, `docflow-staging`, `docflow-prod` (pick region nearest your clients — ask this week if you haven't)
- [ ] **Vercel** — 1 team, 1 project (create at end of setup, not now)
- [ ] **Google Cloud** — project with billing enabled; Document AI API enabled; a **processor** provisioned (`OCR_PROCESSOR`, general); service account JSON key downloaded
- [ ] **Gemini** — API key from Google AI Studio
- [ ] **Sentry** — project created (Node + Next.js), DSN copied
- [ ] **1Password Secrets Automation** or **Doppler** — for `INTAKE_SECRETS_KEY` backup and team sharing
- [ ] **ERP 19** test instance — URL, DB name, admin user with an API key
- [ ] **Domain** — deferred. Use `intake` as internal name in code. Decide before inviting the first client.

Write every credential into your password manager now. Do not rely on email search later.

---

## 2. Repo + Next.js scaffold

### 2.1 Create the repo

```bash
cd /Users/moisesmoreno/Documents/DocFlow

# Create Next.js 16.2 scaffold
pnpm create next-app@latest app \
  --typescript --tailwind --eslint \
  --app --turbopack \
  --src-dir --import-alias "@/*"

cd app
```

Move the `spec/` folder inside the repo so it's versioned alongside code:

```bash
cd ..
mv spec app/spec
cd app
```

### 2.2 Git init + first commit

```bash
git init
git branch -M main

# Create GitHub repo (adjust org/name)
gh repo create intake --private --source=. --remote=origin

# First commit
git add .
git commit -m "chore: initial Next.js 16 scaffold + specs"
git push -u origin main
```

### 2.3 Root files

Create these at the repo root:

**`.nvmrc`**

```
24
```

**`.npmrc`**

```
save-exact=true
engine-strict=true
```

Pin versions exactly (no `^`) until you've earned stability.

**`package.json`** — add `engines`:

```json
{
  "engines": {
    "node": ">=24.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

**`.gitignore`** — verify these are listed (Next's default covers most; add):

```
.env*.local
.env
!.env.example
.vercel
.vscode/
.idea/
*.log
coverage/
playwright-report/
test-results/
supabase/.temp/
supabase/.branches/
```

### 2.4 Folder structure

Create the target layout now so everyone commits in the same places:

```bash
mkdir -p src/app/\[locale\]/{inbox,review/\[documentId\],processed,settings,\(auth\)/sign-in}
mkdir -p src/app/api
mkdir -p src/components/{ui,app}
mkdir -p src/lib/{supabase,odoo,ai,i18n,credits,events}
mkdir -p src/messages
mkdir -p supabase/{migrations,functions,tests}
mkdir -p .github/workflows
mkdir -p prompts
```

Brief convention:

- `src/components/ui/*` — design-system primitives (`Button`, `Input`, `StatusBadge`, `Avatar`, etc). Copied/adapted from shadcn-ui.
- `src/components/app/*` — product components (`DocumentsTable`, `ReviewShell`, `UploadDropzone`).
- `src/lib/*` — domain modules; each maps to a spec.
- `src/messages/*` — next-intl JSON (`en.json`, `es.json`).
- `prompts/*` — versioned Gemini prompts (`classify.v1.md`, `extract.v1.md`).

### 2.5 Install core dependencies

```bash
# Core stack
pnpm add next@16.2.0 react@19.2.0 react-dom@19.2.0

# Supabase
pnpm add @supabase/supabase-js @supabase/ssr

# i18n
pnpm add next-intl

# UI foundation
pnpm add lucide-react class-variance-authority clsx tailwind-merge
pnpm add @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
        @radix-ui/react-popover @radix-ui/react-tooltip \
        @radix-ui/react-tabs @radix-ui/react-avatar \
        @radix-ui/react-slot @radix-ui/react-label
pnpm add cmdk sonner

# Tables + forms
pnpm add @tanstack/react-table
pnpm add react-hook-form @hookform/resolvers zod

# PDF
pnpm add react-pdf

# Fonts (Geist Mono — Inter is in next/font/google)
pnpm add geist

# Observability
pnpm add @sentry/nextjs

# Dev
pnpm add -D @types/node @types/react @types/react-dom
pnpm add -D prettier prettier-plugin-tailwindcss
pnpm add -D stylelint stylelint-config-standard stylelint-declaration-strict-value
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
pnpm add -D @playwright/test
pnpm add -D husky lint-staged
```

---

## 3. Design system wiring

Implements [design-system.md](./design-system.md) at the plumbing level.

### 3.1 Tailwind v4 configuration

Next 16 + Tailwind v4 means the config lives in CSS, not a JS file. Replace `src/app/globals.css`:

**`src/app/globals.css`**

```css
@import "tailwindcss";

@theme {
  /* Neutral palette */
  --color-bg: #fafaf9;
  --color-surface: #ffffff;
  --color-surface-mute: #f5f5f4;
  --color-border: #e4e4e3;
  --color-border-hv: #a8a8a6;
  --color-fg: #1a1a1a;
  --color-fg-mute: #6b6b6b;
  --color-fg-subtle: #9b9b99;

  /* Accent palette (Attio-style, muted) */
  --color-slate: #64748b;
  --color-sand: #a8a29e;
  --color-amber: #b45309;
  --color-teal: #0f766e;
  --color-rose: #e11d48;
  --color-pink: #db2777;
  --color-violet: #7c3aed;
  --color-blue: #2563eb;

  /* Typography */
  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;

  /* Type scale */
  --text-xs: 12px;
  --text-sm: 13px;
  --text-base: 14px;
  --text-md: 16px;
  --text-lg: 20px;
  --text-xl: 24px;

  /* Radii */
  --radius-sm: 4px;
  --radius-md: 6px;

  /* Motion */
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
}

/* Global resets */
html,
body {
  background: var(--color-bg);
  color: var(--color-fg);
  font-family: var(--font-sans);
  font-feature-settings:
    "tnum" 1,
    "ss01" 1; /* tabular numbers + Inter dotless i */
}

/* Explicit: we don't use shadows */
* {
  box-shadow: none !important;
}
/* Remove the !important if it fights a 3rd-party lib; enforce via stylelint instead */
```

Note: the `box-shadow: none` blanket is nuclear. For Phase 1, **don't** use `!important`. Use stylelint (section 10.3) as the enforcement mechanism.

### 3.2 Fonts

**`src/app/layout.tsx`** — wire Inter + Geist Mono:

```tsx
import { Inter } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

Adjust the `<html lang>` dynamically when `next-intl` is wired in section 6.

### 3.3 shadcn/ui initialization

```bash
pnpm dlx shadcn@latest init
# - Style: new-york
# - Base color: neutral
# - CSS variables: yes
# - Location: src/components/ui
```

Install only the components we need (per [design-system.md](./design-system.md#components-we-install-from-shadcn)):

```bash
pnpm dlx shadcn@latest add \
  button input textarea select checkbox switch radio-group label \
  dialog alert-dialog drawer sheet \
  dropdown-menu popover tooltip context-menu \
  tabs separator badge avatar \
  skeleton command toast table form
```

Replace each default with the token-aware version as you build the screen that uses it. **Do not** ship the default shadcn look — override to match [design-system.md](./design-system.md#component-specs).

### 3.4 First design-system primitives

Create minimal wrappers now so the rest of setup can use them:

**`src/components/ui/status-badge.tsx`** — single source of truth for status pills. Implement per [design-system.md — Status pill system](./design-system.md#status-pill-system).

**`src/components/ui/avatar.tsx`** — with deterministic hash-to-color per [design-system.md — Avatar](./design-system.md#avatar).

Keep bodies as `// TODO(setup): implement per design-system.md` stubs if you want — the goal right now is file layout, not logic.

---

## 4. Supabase setup

### 4.1 Local stack

```bash
cd /Users/moisesmoreno/Documents/DocFlow/app
supabase init
supabase start    # spins up local Postgres, Auth, Storage, Studio
```

Studio at `http://localhost:54323` — verify it loads.

### 4.2 Link to dev project

```bash
supabase link --project-ref <your-docflow-dev-project-ref>
```

(Find the project ref in Supabase dashboard → Project Settings → General.)

### 4.3 First migration — schema from `data.md`

Create the initial migration with every table, index, and RLS policy from [data.md](./data.md):

```bash
supabase migration new init_schema
```

Paste the SQL from [data.md](./data.md) into the generated file — all tables, indexes, and policies, in dependency order:

```
1. tenants
2. tenant_members (depends on tenants, auth.users)
3. odoo_connections (depends on tenants)
4. documents (depends on tenants)
5. document_pages (depends on documents)
6. extractions (depends on documents)
7. customer_mappings (depends on tenants)
8. product_mappings (depends on tenants)
9. order_drafts (depends on documents, extractions, customer_mappings)
10. order_draft_lines (depends on order_drafts, product_mappings)
11. odoo_sync_attempts (depends on order_drafts)
12. credit_ledger (depends on tenants, documents)
13. workflow_events (depends on tenants, documents)
14. View: credit_balances
15. Helper functions: is_tenant_member(uuid), is_tenant_owner(uuid)
16. RLS policies per table
17. updated_at triggers
```

Create a second migration for the `updated_at` trigger helper:

```bash
supabase migration new updated_at_trigger
```

```sql
create or replace function set_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply to every table that has updated_at
create trigger set_updated_at before update on tenants
  for each row execute function set_updated_at();
-- ... repeat for each table with updated_at
```

Apply locally:

```bash
supabase db reset   # runs all migrations against local
```

Verify in Studio: all tables exist, RLS enabled on all of them.

### 4.4 pgTAP tests for RLS

Install pgTAP in the local container:

```bash
supabase db push --include-seed false
# in a psql session against local:
# CREATE EXTENSION IF NOT EXISTS pgtap;
```

Create `supabase/tests/rls_isolation.sql` — one test per tenant-scoped table asserting tenant-A user cannot read tenant-B rows. This is the CI gate from [data.md](./data.md#rls-summary).

Minimum starter test (expand to every table):

```sql
begin;
select plan(1);

-- setup: create tenant A, tenant B, user A member of A
-- ... insert helpers

set role authenticated;
-- as user A, query documents where tenant_id = B ⇒ expect 0 rows

select is(
  (select count(*) from documents where tenant_id = 'b-tenant-id'),
  0::bigint,
  'user A cannot read tenant B documents'
);

select * from finish();
rollback;
```

Run: `supabase test db`.

### 4.5 Types generation

```bash
supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

Add a `pnpm` script for this:

```json
"scripts": {
  "db:types": "supabase gen types typescript --local > src/lib/supabase/database.types.ts"
}
```

Re-run whenever the schema changes.

### 4.6 Supabase client helpers

**`src/lib/supabase/server.ts`** — server-side client (cookies-based). Use `@supabase/ssr`. Standard pattern — see Supabase docs for Next 16.

**`src/lib/supabase/browser.ts`** — browser client.

**`src/lib/supabase/service.ts`** — service-role client (Edge Functions only, never imported by React).

---

## 5. Auth middleware

Implements [tenancy-auth.md](./tenancy-auth.md#tenant-resolution).

**`src/middleware.ts`**

- Reads Supabase session via `@supabase/ssr`.
- If unauthenticated and not on `/sign-in` or `/[locale]/sign-in` → redirect to sign-in.
- Reads `active_tenant_id` cookie.
- If missing or invalid → redirect to `/select-tenant` (you'll build this later; for setup, a stub page is fine).
- Sets `x-tenant-id` header for downstream server components.
- Skip middleware for `/_next`, `/api/health`, static assets.

**Placeholder pages to create now** (content: `TODO`):

- `src/app/[locale]/(auth)/sign-in/page.tsx`
- `src/app/[locale]/select-tenant/page.tsx`
- `src/app/[locale]/inbox/page.tsx`

Goal: middleware + routing work end-to-end before you write real UI.

---

## 6. i18n (next-intl)

### 6.1 Routing config

**`src/i18n/routing.ts`**

```ts
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  localePrefix: "always",
});
```

### 6.2 Middleware — combine with auth

Compose `next-intl` middleware with the auth middleware. Reference the next-intl docs for the App Router setup; chain them so `/[locale]/*` resolves before auth checks cookies.

### 6.3 Base message files

**`src/messages/en.json`** and **`src/messages/es.json`** — start with just:

```json
{
  "common": {
    "loading": "Loading…",
    "retry": "Retry",
    "cancel": "Cancel",
    "save": "Save",
    "yes": "Yes",
    "no": "No"
  },
  "nav": {
    "inbox": "Inbox",
    "review": "Review",
    "processed": "Processed",
    "settings": "Settings"
  }
}
```

(Spanish variant: `"loading": "Cargando…"` etc.)

Expand per screen as you build. Every new string → key in both files.

### 6.4 i18n lint rule

Add an ESLint rule to fail on JSX string literals without wrapping in `useTranslations()` / `<Trans>`. Use `eslint-plugin-formatjs` or a custom rule — your call. Non-negotiable: catch hardcoded strings in CI.

---

## 7. Secrets & environment

### 7.1 `.env.example` (committed)

```bash
# Next.js public
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Supabase server
SUPABASE_SERVICE_ROLE_KEY=

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=

# Edge Function secrets (set via `supabase secrets set`, not .env)
# GEMINI_API_KEY
# GCP_DOCAI_PROJECT_ID
# GCP_DOCAI_PROCESSOR_ID
# GCP_DOCAI_KEY_JSON
# INTAKE_SECRETS_KEY

# Node env
NODE_ENV=development
```

### 7.2 `.env.local` (NOT committed)

Copy `.env.example` and fill values for dev Supabase project.

### 7.3 Generate `INTAKE_SECRETS_KEY`

This is the master key for encrypting per-tenant ERP credentials. See [tenancy-auth.md](./tenancy-auth.md#encryption).

```bash
# 32 bytes base64
openssl rand -base64 32
```

**Store it in 3 places**:

1. Supabase Edge Function secrets (prod, staging, dev each get their own):
   ```bash
   supabase secrets set INTAKE_SECRETS_KEY=<base64-key>
   ```
2. Your password manager (1Password / Doppler).
3. A sealed envelope in physical storage (seriously — if you lose this and the password manager goes down, every tenant's ERP credentials become unreadable).

**Never** put it in `.env.local` or commit it anywhere.

### 7.4 Upload other Edge Function secrets

```bash
supabase secrets set GEMINI_API_KEY=...
supabase secrets set GCP_DOCAI_PROJECT_ID=...
supabase secrets set GCP_DOCAI_PROCESSOR_ID=...
supabase secrets set GCP_DOCAI_KEY_JSON="$(cat path/to/service-account.json)"
```

Verify with `supabase secrets list`.

---

## 8. Edge Functions scaffold

Create empty stubs — no logic yet.

```bash
supabase functions new ingest
supabase functions new ai-process
supabase functions new odoo-sync
supabase functions new janitor-uploads
supabase functions new save-odoo-connection
```

Each gets a boilerplate file. For now, make each return `{ ok: true, stub: true }` so deploys succeed.

**`supabase/functions/_shared/`** — create for cross-function helpers:

- `supabase.ts` — service-role client factory
- `secrets.ts` — wraps `Deno.env` access
- `events.ts` — `emitWorkflowEvent()` helper
- `tenant.ts` — membership verification

Deploy to dev to verify:

```bash
supabase functions deploy ingest ai-process odoo-sync janitor-uploads save-odoo-connection
```

### 8.1 Scheduled functions

[workflows/upload.md](./workflows/upload.md#janitor-job) and [workflows/odoo-sync.md](./workflows/odoo-sync.md#retry-policy) both need cron. Wire them now using Supabase `pg_cron`:

```sql
-- in a new migration
select cron.schedule('janitor-uploads', '0 * * * *',
  $$ select net.http_post(
    'https://<project>.supabase.co/functions/v1/janitor-uploads',
    '{}',
    'application/json',
    ARRAY[('Authorization', 'Bearer ' || current_setting('app.service_key'))]::net.http_header[]
  ) $$);

select cron.schedule('janitor-sync', '*/5 * * * *',
  $$ ... $$);
```

(Adjust pattern to your Supabase env — the project ref + service key go in Vault, not hardcoded.)

---

## 9. Observability — Sentry

### 9.1 Install

```bash
pnpm dlx @sentry/wizard@latest -i nextjs
```

Follow the wizard. It creates `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`.

### 9.2 Configure tags

In each Sentry config, add:

```ts
Sentry.setTag("service", "intake-web");
// Later, at request time, setTag("tenant_id", ...) once resolved
```

### 9.3 Edge Functions — Sentry for Deno

Sentry has a Deno SDK. Install in `_shared/` and initialize per function:

```ts
import * as Sentry from "npm:@sentry/deno";
Sentry.init({ dsn: Deno.env.get("SENTRY_DSN"), tracesSampleRate: 0.1 });
```

### 9.4 PII guard

`workflow_events.meta` and Sentry scopes **must not** contain PO text, buyer names, or line items. Add a scrub rule in Sentry config. See [architecture.md](./architecture.md#event-shape-internal).

---

## 10. Lint + format + design-rule enforcement

### 10.1 ESLint

Create `eslint.config.mjs`:

```js
import next from "eslint-config-next";
import tailwind from "eslint-plugin-tailwindcss";

export default [
  ...next(),
  {
    plugins: { tailwindcss: tailwind },
    rules: {
      // Block design-system violations
      "tailwindcss/no-custom-classname": ["warn"],
      "tailwindcss/classnames-order": ["warn"],
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/rounded-(lg|xl|2xl|3xl|full)/]",
          message:
            "No rounded-lg or larger. Use rounded-sm or rounded-md. (rounded-full only on avatars — add eslint-disable locally.)",
        },
      ],
      // Block hardcoded user-facing strings — set up formatjs/i18n rule
    },
  },
];
```

### 10.2 Prettier

**`.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "tabWidth": 2,
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

### 10.3 stylelint — enforce no-shadow, no-gradient

**`.stylelintrc.json`**

```json
{
  "extends": "stylelint-config-standard",
  "rules": {
    "declaration-property-value-disallowed-list": {
      "box-shadow": [".*"],
      "background-image": ["/gradient/"]
    },
    "color-no-hex": [
      true,
      {
        "ignore": ["named", "inside-function"],
        "message": "Use CSS custom properties from globals.css, not hex."
      }
    ]
  },
  "ignoreFiles": ["src/app/globals.css"]
}
```

The `color-no-hex` rule permits hex inside `@theme { ... }` but blocks it elsewhere.

### 10.4 Husky + lint-staged

```bash
pnpm dlx husky init
echo "pnpm lint-staged" > .husky/pre-commit
```

**`package.json`**

```json
"lint-staged": {
  "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
  "*.{css}": ["stylelint --fix", "prettier --write"],
  "*.{json,md}": ["prettier --write"]
}
```

### 10.5 Scripts

**`package.json`** scripts block:

```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "lint": "eslint . && stylelint 'src/**/*.css'",
  "format": "prettier --write .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "db:types": "supabase gen types typescript --local > src/lib/supabase/database.types.ts",
  "db:reset": "supabase db reset",
  "db:test": "supabase test db"
}
```

---

## 11. Testing harness

### 11.1 Vitest

**`vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

### 11.2 Playwright

```bash
pnpm dlx playwright install --with-deps
```

**`playwright.config.ts`** — standard config, baseURL `http://localhost:3000`, one project `chromium`.

### 11.3 First smoke test

**`e2e/health.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("app loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/intake/i);
});
```

Run: `pnpm test:e2e`. Passes → your scaffold is wired.

---

## 12. CI/CD

### 12.1 GitHub Actions — PR checks

**`.github/workflows/ci.yml`**

```yaml
name: CI
on: { pull_request: {}, push: { branches: [main] } }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test

  db:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase db start
      - run: supabase db reset
      - run: supabase test db
```

### 12.2 Vercel — deploy on main

Connect the GitHub repo to Vercel (step 13).

Vercel auto-deploys:

- Preview per PR
- Production on `main`

Add env vars in Vercel dashboard (copy from `.env.local`, same names).

---

## 13. First deploy

### 13.1 Vercel link

```bash
pnpm dlx vercel@latest login
pnpm dlx vercel@latest link
pnpm dlx vercel@latest env pull  # populates .env.local from Vercel if you set env there first
```

### 13.2 Set production env

In Vercel dashboard → Project → Settings → Environment Variables, add every key from `.env.example` (production values, pointing at `docflow-prod` Supabase). Repeat for `preview` (pointing at `docflow-staging`).

### 13.3 Push to main

```bash
git checkout -b feat/scaffold-setup
git add .
git commit -m "feat: complete setup per spec/setup.md"
git push -u origin feat/scaffold-setup
gh pr create --fill
```

CI should pass. Merge to `main`. Vercel deploys.

### 13.4 Smoke-test the live URL

- `/` redirects to `/en/sign-in` (or wherever middleware sends)
- No 500s in Sentry
- No cookie errors in browser devtools
- `/api/health` (create a dumb 200 endpoint) returns `{ ok: true }`

---

## 14. Verification checklist

Work through this with your laptop open. Check each:

**Local dev**

- [ ] `pnpm dev` starts on `:3000` with Turbopack
- [ ] `/en` and `/es` both render (even stub content)
- [ ] `/en/sign-in` renders, can sign in with a Supabase test user
- [ ] Signed-in session survives refresh
- [ ] Supabase Studio (`:54323`) shows all 13 tables
- [ ] `pnpm db:test` → pgTAP RLS tests pass
- [ ] `pnpm lint` → clean
- [ ] `pnpm typecheck` → clean
- [ ] `pnpm test` → clean
- [ ] `pnpm test:e2e` → health test passes

**Remote**

- [ ] GitHub repo is private, main branch protected (require PR, require CI)
- [ ] Vercel preview deploy on PR works
- [ ] Vercel prod on `main` works
- [ ] Sentry receives a test error (`Sentry.captureException(new Error("hello"))`)
- [ ] Supabase Edge Function `ingest` returns `{ ok: true, stub: true }` when invoked

**Secrets**

- [ ] `INTAKE_SECRETS_KEY` generated, in Supabase secrets, in password manager, in physical backup
- [ ] `GCP_DOCAI_KEY_JSON`, `GEMINI_API_KEY`, `GCP_DOCAI_PROJECT_ID`, `GCP_DOCAI_PROCESSOR_ID` all in Supabase secrets for dev
- [ ] No secret appears in any commit (`gh search code --owner <you> secret_key` returns nothing)

**Process**

- [ ] A teammate (or future you) can `git clone`, `pnpm install`, `supabase start`, `pnpm dev`, and have a working local app within 15 minutes following only this file

---

## What's explicitly NOT in setup

These belong to **Week 3+**, not to this file:

- Any real Inbox / Review / Processed / Settings UI
- Any AI pipeline code (Document AI, Gemini)
- Any ERP client logic
- The actual sign-up / invite flows (beyond stub)
- Product-level tests

Keep setup ruthlessly about plumbing. Feature work starts after `✓` on every box above.

---

## Dependencies

- [README.md](./README.md) — conventions this setup honors
- [data.md](./data.md) — source for the initial schema migration
- [design-system.md](./design-system.md) — source for Tailwind tokens and lint rules
- [tenancy-auth.md](./tenancy-auth.md) — source for middleware and encryption approach
- [architecture.md](./architecture.md) — runtime topology reflected in folder layout
