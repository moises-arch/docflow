# Deploy to Vercel — DocFlow

Step-by-step guide to ship the app to production on Vercel.

---

## 1. Pre-flight checklist (local)

```bash
cd app
pnpm install --frozen-lockfile
pnpm typecheck   # must pass cleanly
pnpm build       # must build without errors
```

If everything passes, you're ready to deploy.

> `pnpm lint` has known errors in third-party components (`reui/data-grid`, `ui/drawer`). The build does NOT run them because `next.config.ts` sets `eslint.ignoreDuringBuilds: true`. These warnings are cleaned up separately.

---

## 2. Configure Supabase (one time)

Before the first Vercel deploy, make sure Supabase has:

### Migrations applied
```bash
npx supabase db push
```

### Edge Function secrets
```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase secrets set INTAKE_SECRETS_KEY=$(openssl rand -hex 32)
# Optional (only if used):
npx supabase secrets set MAILGUN_SIGNING_KEY=...
```

### Edge Functions deployed
```bash
npx supabase functions deploy ai-process odoo-sync ingest email-ingest janitor-uploads
```

---

## 3. Create the project on Vercel

### Via dashboard
1. Vercel → **New Project** → import the GitHub repo.
2. **Root Directory**: `app` (the app lives in a monorepo).
3. **Framework Preset**: Next.js (auto-detected).
4. **Build Command**: `pnpm build` (preset).
5. **Install Command**: `pnpm install --frozen-lockfile` (preset).

### Via CLI
```bash
npm i -g vercel
cd app
vercel link
vercel --prod
```

---

## 4. Environment variables on Vercel

**Settings → Environment Variables** → add the following (Production + Preview):

### Critical — the app won't start without these

| Variable | Source | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | your domain | `https://app.example.com` or the Vercel domain |
| `NEXT_PUBLIC_ERP_BASE_URL` | your Odoo 19 URL | base URL for deep links to Odoo sales orders |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API | public (`anon`/`publishable` key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API | **server-only**, mark as sensitive |

### Cron and public scanner

| Variable | How to generate |
|---|---|
| `CRON_SECRET` | `openssl rand -hex 32` |
| `SCAN_TOKEN_SECRET` | `openssl rand -hex 32` |

### Optional — only if used

| Variable | When |
|---|---|
| `MICROSOFT_GRAPH_TENANT_ID` / `_CLIENT_ID` / `_CLIENT_SECRET` | If you use email ingestion via an email provider |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | If you enable error reporting |

> **Never** put Edge Function keys (`ANTHROPIC_API_KEY`, `INTAKE_SECRETS_KEY`) on Vercel — those live in Supabase.

---

## 5. Configure the domain

1. **Settings → Domains** → add `example.com` (or whatever domain you want).
2. Point DNS to `cname.vercel-dns.com`.
3. Once active, update `NEXT_PUBLIC_APP_URL` to match.

---

## 6. Vercel Cron

`vercel.json` already defines an hourly cron for `/api/cron/browser-ingest`.

The endpoint requires the header `Authorization: Bearer <CRON_SECRET>`. Vercel Cron adds it automatically when you declare the `CRON_SECRET` env var.

Check **Settings → Cron Jobs** to confirm the cron appears after the first deploy.

---

## 7. Configure the Supabase Auth redirect

In Supabase → **Authentication → URL Configuration**:

- **Site URL**: your `NEXT_PUBLIC_APP_URL` (e.g. `https://app.example.com`)
- **Redirect URLs**: add your domain + `/auth/callback`

---

## 8. Post-deploy smoke test

After the first deploy finishes:

1. Visit the home page: it should redirect to `/sign-in` or to the locale.
2. Log in with an existing user.
3. Upload a test PDF in the Inbox.
4. Confirm it reaches the `needs_review` or `synced` state (if auto-sync is ON).
5. Check **Vercel → Logs** and **Supabase → Edge Function Logs** for errors.

### Key healthcheck endpoints
- `GET /api/health` → `{ ok: true }`
- `GET /api/cron/browser-ingest` with `Authorization: Bearer <CRON_SECRET>` → 200

---

## 9. After the first deploy

- **Auto-deploys**: Vercel redeploys on every push to `main` (or the branch you configure).
- **Preview deploys**: each PR generates a preview with its own temporary URL.
- **Promote**: to promote a preview to production without a push, use `vercel promote <url>`.

---

## 10. Quick rollback

If something breaks:

```bash
# List recent deploys
vercel ls

# Promote a previous one to production
vercel promote <deployment-url>
```

Or from the dashboard: **Deployments → ⋮ → Promote to Production**.

---

## Troubleshooting

### Build fails with "Cannot find module 'tw-animate-css'"
Make sure `pnpm install --frozen-lockfile` ran OK and that `pnpm-lock.yaml` is committed.

### Build passes but the app crashes with "fetch failed"
Check `NEXT_PUBLIC_SUPABASE_URL` — it must include `https://` and must NOT end with `/`.

### Cron doesn't run
- Confirm `CRON_SECRET` is in the env vars
- Vercel Cron is only available on Pro+ plans
- Check **Settings → Cron Jobs → View Logs**

### Edge functions return 404
Supabase Edge Functions are NOT Vercel API routes — they live in Supabase and are deployed with `npx supabase functions deploy`.

---

*⚡ Built by [Mojo Dev](https://github.com/moises-arch)*
