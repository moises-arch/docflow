# Email provider Email Ingest — Setup Guide

Step-by-step guide for connecting an Outlook / Email provider mailbox (e.g.
`orders@example.com`) to DocFlow. This is the **recommended** ingest method
for any mailbox hosted on M365, because it uses OAuth2 (no passwords) and
delivers in real time via Email provider webhooks.

> If your mailbox is **not** on M365 (Gmail, Zoho, cPanel, etc.), use the
> **IMAP** tab instead — see `email-ingest-imap.md`.

## Architecture in 30 seconds

```
Outlook 365 mailbox
    │  (new message arrives)
    ▼
Email provider subscription  ──webhook──▶  Edge Function `email-ingest`
                                                │
                                                ▼
                                          Pipeline IA scan
                                                │
                                                ▼
                                            Order draft → ERP
```

A pg_cron job (`intake-graph-subscription-renew-every-6h`) keeps the Graph
subscription alive automatically (Graph mailbox subscriptions cap at ~70.5 h).

## One-time Azure AD setup (~5 min)

You only do this once per tenant. After that, you can add as many mailboxes as
you want from the UI without going back to Azure.

### 1. Register an application

1. Sign in at <https://portal.azure.com> with a tenant admin account.
2. **Microsoft Entra ID** → **App registrations** → **New registration**.
3. Fill in:
   - **Name:** `DocFlow Email Ingest`
   - **Supported account types:** *Accounts in this organizational directory only (Single tenant)*
   - **Redirect URI:** leave empty
4. Click **Register**.
5. From the **Overview** page, copy:
   - **Application (client) ID** → goes into `MICROSOFT_GRAPH_CLIENT_ID`
   - **Directory (tenant) ID** → goes into `MICROSOFT_GRAPH_TENANT_ID`

### 2. Create a client secret

1. App page → **Certificates & secrets** → **Client secrets** → **New client secret**.
2. Description: `DocFlow prod`. Expires: `24 months` (or longer if your policy allows).
3. Click **Add**.
4. **Copy the `Value` immediately** — it is shown only once.
   This is `MICROSOFT_GRAPH_CLIENT_SECRET`.

### 3. Grant API permissions

1. App page → **API permissions** → **Add a permission** → **Email provider** → **Application permissions**.
2. Add:
   - `Mail.Read`
   - `Mail.ReadBasic`
3. Back on the API permissions page, click **Grant admin consent for <tenant>**
   (the blue button at the top). Status should turn green.

### 4. Set environment variables

**Vercel** (Production environment):

```bash
cd ~/Documents/DocFlow/app
pnpm exec vercel env add MICROSOFT_GRAPH_TENANT_ID production
pnpm exec vercel env add MICROSOFT_GRAPH_CLIENT_ID production
pnpm exec vercel env add MICROSOFT_GRAPH_CLIENT_SECRET production
pnpm exec vercel deploy --prod
```

**Supabase Edge Function secrets** (`email-ingest` and
`graph-subscription-renew` both read these):

```bash
pnpm exec supabase secrets set \
  MICROSOFT_GRAPH_TENANT_ID=<tenant-id> \
  MICROSOFT_GRAPH_CLIENT_ID=<client-id> \
  MICROSOFT_GRAPH_CLIENT_SECRET=<client-secret-value>
```

### 5. Apply the renewal cron migration (one-time)

```bash
pnpm exec supabase db push
pnpm exec supabase functions deploy graph-subscription-renew
```

That's it for the global setup.

## Adding a mailbox (UI)

1. Sign into the app, navigate to **Ingest hub → Email → Email provider**.
2. The banner should now read "Listo" — if it still says "Falta configurar
   Azure AD", verify the env vars deployed successfully.
3. Type the mailbox address (e.g. `orders@example.com`).
4. Optionally select a default Provider (if all incoming orders come from a
   single supplier).
5. Optionally restrict allowed senders (e.g. `*@walmart.com`).
6. Click **Agregar y conectar**. The UI:
   - Inserts the row in `email_ingest_sources` with `adapter='microsoft_graph'`.
   - Calls Email provider to create a subscription pointed at the
     `email-ingest` Edge Function.
   - Stores `graph_subscription_id` and `graph_subscription_expires_at` in the
     source's `settings`.

## How renewal works

- Cron job `intake-graph-subscription-renew-every-6h` runs `*/17 * * * *`-style
  every 6 hours and POSTs to the `graph-subscription-renew` Edge Function.
- The function lists all `email_ingest_sources` with
  `settings->>adapter = 'microsoft_graph'` and `status = 'active'`.
- For each source whose subscription expires within 24 hours, it `PATCH`es the
  Graph subscription with a new expiry of *now + 60 hours*.
- If the subscription was already deleted/expired (404 from Graph), it
  recreates one in place using the same source row.

## Receiving emails

1. Send a test email with a PDF attachment to the configured mailbox.
2. Within seconds, you should see:
   - A row in `inbound_emails` (`tenant_id`, `meta->>adapter='microsoft_graph'`,
     `state='processed'`).
   - One or more `documents` linked via `inbound_email_attachments`.
   - The document moving through `state`: `uploaded` → `processing` →
     `needs_review`.
   - An entry in `email_ingest_events` with `state='accepted'` and
     `adapter='microsoft_graph'`.
3. Approve the resulting `order_draft` to push it to ERP.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| UI still shows "Falta configurar Azure AD" | Env vars not in Next.js runtime | Redeploy after `vercel env add` |
| **Connect** returns 401 | Bad client secret or admin consent not granted | Re-check step 3 in Azure |
| **Connect** returns 403 | Missing `Mail.Read` Application permission | Add it and grant admin consent |
| **Connect** returns 400 with "InvalidNotificationUrl" | `NEXT_PUBLIC_SUPABASE_URL` is not publicly reachable | Verify Supabase URL is correct (must be HTTPS, public) |
| Subscription created but no emails arrive | `clientState` mismatch | Recreate the source (delete and add again) |
| Subscription expired silently | Renewal cron not deployed | `supabase db push && supabase functions deploy graph-subscription-renew` |

## Security notes

- **No passwords** are stored. The OAuth2 client credentials flow uses the app
  registration's client secret, which is held only in Vercel + Supabase
  secrets.
- The Edge Function verifies each incoming notification with two layers:
  1. `webhook_secret` query parameter (per-source, random 24-byte token).
  2. `clientState` field on the notification body (per-source, random 24-byte
     token).
- Both must match what's stored in `email_ingest_sources.settings` or the
  notification is rejected.

## Files involved

| Path | Role |
|---|---|
| `src/app/[locale]/ingest/email/microsoft-365/page.tsx` | Server component, queries sources |
| `src/app/[locale]/ingest/email/microsoft-365/email-microsoft-client.tsx` | UI wizard |
| `src/app/api/ingest/email-sources/route.ts` | POST creates source row |
| `src/app/api/ingest/microsoft-graph/subscriptions/route.ts` | POST creates Graph subscription |
| `supabase/functions/email-ingest/index.ts` | Webhook receiver, parses Graph notifications |
| `supabase/functions/graph-subscription-renew/index.ts` | Cron-driven renewal |
| `supabase/functions/_shared/email-pipeline.ts` | Shared persistence pipeline |
| `supabase/migrations/20260507000005_graph_subscription_renew_cron.sql` | pg_cron schedule |
