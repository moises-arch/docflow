# Deploy a Vercel — DocFlow

Guía paso a paso para llevar la app a producción en Vercel.

---

## 1. Pre-flight checklist (local)

```bash
cd app
pnpm install --frozen-lockfile
pnpm typecheck   # debe pasar limpio
pnpm build       # debe construir sin errores
```

Si todo pasa, estás listo para deploy.

> `pnpm lint` tiene errores conocidos en componentes de tercerros (`reui/data-grid`, `ui/drawer`). El build NO los ejecuta porque `next.config.ts` tiene `eslint.ignoreDuringBuilds: true`. Estos warnings se limpian aparte.

---

## 2. Configurar Supabase (una sola vez)

Antes del primer deploy en Vercel, asegúrate que Supabase tenga:

### Migrations aplicadas
```bash
npx supabase db push
```

### Edge Function secrets
```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase secrets set INTAKE_SECRETS_KEY=$(openssl rand -hex 32)
# Opcionales (solo si se usan):
npx supabase secrets set MAILGUN_SIGNING_KEY=...
```

### Edge Functions deployadas
```bash
npx supabase functions deploy ai-process odoo-sync ingest email-ingest janitor-uploads
```

---

## 3. Crear proyecto en Vercel

### Vía dashboard
1. Vercel → **New Project** → importar repo de GitHub.
2. **Root Directory**: `app` (la app está en monorepo).
3. **Framework Preset**: Next.js (autodetectado).
4. **Build Command**: `pnpm build` (preset).
5. **Install Command**: `pnpm install --frozen-lockfile` (preset).

### Vía CLI
```bash
npm i -g vercel
cd app
vercel link
vercel --prod
```

---

## 4. Variables de entorno en Vercel

**Settings → Environment Variables** → añadir las siguientes (Production + Preview):

### Críticas — sin esto la app no arranca

| Variable | Origen | Notas |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | tu dominio | `https://app.example.com` o el dominio Vercel |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | publicable |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API | publicable (key `anon`/`publishable`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API | **server-only**, marcar como sensitive |

### Cron y scanner público

| Variable | Cómo generar |
|---|---|
| `CRON_SECRET` | `openssl rand -hex 32` |
| `SCAN_TOKEN_SECRET` | `openssl rand -hex 32` |

### Opcionales — solo si se usan

| Variable | Cuándo |
|---|---|
| `MICROSOFT_GRAPH_TENANT_ID` / `_CLIENT_ID` / `_CLIENT_SECRET` | Si usarás email-ingest con Email provider |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | Si activas reporting de errores |

> **Nunca** pongas las claves de Edge Functions (`ANTHROPIC_API_KEY`, `INTAKE_SECRETS_KEY`) en Vercel — esas viven en Supabase.

---

## 5. Configurar el dominio

1. **Settings → Domains** → añadir `example.com` (o el dominio que quieras).
2. Apuntar el DNS a `cname.vercel-dns.com`.
3. Una vez activo, actualizar `NEXT_PUBLIC_APP_URL` para que coincida.

---

## 6. Vercel Cron

`vercel.json` ya define un cron horario para `/api/cron/browser-ingest`.

El endpoint requiere el header `Authorization: Bearer <CRON_SECRET>`. Vercel Cron lo añade automáticamente cuando declaras la variable `CRON_SECRET` en env vars.

Verifica en **Settings → Cron Jobs** que el cron aparece después del primer deploy.

---

## 7. Configurar el redirect a Supabase Auth

En Supabase → **Authentication → URL Configuration**:

- **Site URL**: tu `NEXT_PUBLIC_APP_URL` (ej. `https://app.example.com`)
- **Redirect URLs**: añadir tu dominio + `/auth/callback`

---

## 8. Smoke test post-deploy

Después de que el primer deploy termine:

1. Visita la home: debe redirigir a `/sign-in` o al locale.
2. Login con un usuario existente.
3. Sube un PDF de prueba en Inbox.
4. Verifica que llega al estado `needs_review` o `synced` (si auto-sync ON).
5. Revisa **Vercel → Logs** y **Supabase → Edge Function Logs** por errores.

### Endpoints clave para healthcheck
- `GET /api/health` → `{ ok: true }`
- `GET /api/cron/browser-ingest` con `Authorization: Bearer <CRON_SECRET>` → 200

---

## 9. Después del primer deploy

- **Auto-deploys**: Vercel re-deploya en cada push a `main` (o la branch que configures).
- **Preview deploys**: cada PR genera un preview con su propia URL temporal.
- **Promote**: si quieres promover un preview a prod sin push, usa `vercel promote <url>`.

---

## 10. Rollback rápido

Si algo se rompe:

```bash
# Listar deploys recientes
vercel ls

# Promover uno previo a prod
vercel promote <deployment-url>
```

O en el dashboard: **Deployments → ⋮ → Promote to Production**.

---

## Troubleshooting

### Build falla con "Cannot find module 'tw-animate-css'"
Asegúrate de que `pnpm install --frozen-lockfile` corrió OK y que `pnpm-lock.yaml` está commiteado.

### Build pasa pero la app crashea con "fetch failed"
Verifica `NEXT_PUBLIC_SUPABASE_URL` — debe incluir `https://` y NO debe terminar en `/`.

### Cron no se ejecuta
- Verifica `CRON_SECRET` está en env vars
- Vercel Cron solo está disponible en planes Pro+
- Mira **Settings → Cron Jobs → View Logs**

### Edge functions retornan 404
Las Edge Functions de Supabase NO son las API routes de Vercel — viven en Supabase y se deployean con `npx supabase functions deploy`.
