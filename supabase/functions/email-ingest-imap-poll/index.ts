// IMAP polling counterpart of `email-ingest`. Triggered by pg_cron every few
// minutes. Reads `email_ingest_sources` rows where settings.adapter='imap',
// connects to the configured mailbox, downloads new messages and feeds the
// shared persistence pipeline so the same downstream behaviour applies as
// for webhook adapters.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { ImapFlow } from "npm:imapflow@1.0.171";
import PostalMime, { type Email as PostalEmail } from "npm:postal-mime@2.4.5";
import { createServiceClient } from "../_shared/supabase.ts";
import { decrypt } from "../_shared/crypto.ts";
import { secrets } from "../_shared/secrets.ts";
import {
  type EmailSource,
  type ParsedAttachment,
  type ParsedEmail,
  domainOf,
  normalizeEmail,
  persistInboundEmail,
  recordEvent,
  senderAllowed,
} from "../_shared/email-pipeline.ts";

const ADAPTER = "imap" as const;
const DEFAULT_MAILBOX = "INBOX";
const DEFAULT_LOOKBACK_DAYS = 3;
const PER_RUN_MESSAGE_CAP = 50;
const SOURCE_CONCURRENCY = 4;

type ImapSettings = {
  adapter: "imap";
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  imap_username: string;
  imap_password_enc: string;
  imap_mailbox?: string;
  imap_mark_seen?: boolean;
  imap_last_uid?: number;
  imap_last_synced_at?: string;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

function readImapSettings(source: EmailSource): ImapSettings | null {
  const s = source.settings ?? {};
  if (s.adapter !== "imap") return null;
  if (typeof s.imap_host !== "string" || !s.imap_host) return null;
  if (typeof s.imap_username !== "string" || !s.imap_username) return null;
  if (typeof s.imap_password_enc !== "string" || !s.imap_password_enc) return null;
  return {
    adapter: "imap",
    imap_host: s.imap_host as string,
    imap_port: typeof s.imap_port === "number" ? (s.imap_port as number) : 993,
    imap_secure: s.imap_secure !== false,
    imap_username: s.imap_username as string,
    imap_password_enc: s.imap_password_enc as string,
    imap_mailbox: typeof s.imap_mailbox === "string" ? (s.imap_mailbox as string) : DEFAULT_MAILBOX,
    imap_mark_seen: s.imap_mark_seen !== false,
    imap_last_uid: typeof s.imap_last_uid === "number" ? (s.imap_last_uid as number) : 0,
    imap_last_synced_at:
      typeof s.imap_last_synced_at === "string" ? (s.imap_last_synced_at as string) : undefined,
  };
}

function uint8ToArrayBuffer(u8: Uint8Array): ArrayBuffer {
  if (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength) {
    return u8.buffer;
  }
  return u8.slice().buffer;
}

function attachmentBytes(att: PostalEmail["attachments"][number]): ArrayBuffer | undefined {
  const content = att.content as unknown;
  if (content instanceof Uint8Array) return uint8ToArrayBuffer(content);
  if (content instanceof ArrayBuffer) return content;
  if (typeof content === "string") {
    // postal-mime returns base64 strings when contentBuffer mode is off
    try {
      const binary = atob(content);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function buildParsedEmail(parsed: PostalEmail, fallbackMessageId: string): ParsedEmail {
  const fromAddr = parsed.from?.address ?? "";
  const fromName = parsed.from?.name ?? null;
  const recipients = [
    ...(parsed.to ?? []),
    ...(parsed.cc ?? []),
    ...(parsed.bcc ?? []),
  ]
    .map((addr) => normalizeEmail(addr.address ?? ""))
    .filter(Boolean);

  const attachments: ParsedAttachment[] = (parsed.attachments ?? []).map((att) => ({
    filename: att.filename || "attachment",
    contentType: att.mimeType || "application/octet-stream",
    size:
      att.content instanceof Uint8Array
        ? att.content.byteLength
        : typeof att.content === "string"
          ? att.content.length
          : 0,
    disposition: att.disposition ?? null,
    contentId: att.contentId ?? null,
    bytes: attachmentBytes(att),
    externalId: null,
  }));

  return {
    adapter: ADAPTER,
    eventId: null,
    messageId: parsed.messageId || fallbackMessageId,
    fromEmail: normalizeEmail(fromAddr),
    fromName,
    recipients,
    subject: parsed.subject ?? null,
    text: parsed.text ?? null,
    html: parsed.html ?? null,
    raw: {
      headers: parsed.headers ?? [],
      messageId: parsed.messageId ?? null,
      date: parsed.date ?? null,
    },
    attachments,
  };
}

async function loadImapSources(supabase: ReturnType<typeof createServiceClient>) {
  const { data, error } = await supabase
    .from("email_ingest_sources")
    .select("id, tenant_id, provider_id, address, allowed_senders, settings")
    .eq("status", "active")
    .eq("settings->>adapter", "imap");
  if (error) throw error;
  return ((data ?? []) as EmailSource[]).filter((s) => readImapSettings(s) !== null);
}

async function processSource(
  supabase: ReturnType<typeof createServiceClient>,
  source: EmailSource,
): Promise<{ source_id: string; processed: number; duplicates: number; errors: number }> {
  const settings = readImapSettings(source)!;
  const password = await decrypt(settings.imap_password_enc, secrets.intakeSecretsKey);
  const mailbox = settings.imap_mailbox ?? DEFAULT_MAILBOX;

  const client = new ImapFlow({
    host: settings.imap_host,
    port: settings.imap_port,
    secure: settings.imap_secure,
    auth: { user: settings.imap_username, pass: password },
    logger: false,
    emitLogs: false,
  });

  let processed = 0;
  let duplicates = 0;
  let errors = 0;
  let highestUid = settings.imap_last_uid ?? 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailbox);
    try {
      // Build search range. Prefer UID-based incremental polling once we have a
      // baseline; on first run fall back to "since N days ago" so we don't
      // re-ingest the entire mailbox.
      let uids: number[];
      if (settings.imap_last_uid && settings.imap_last_uid > 0) {
        const range = `${settings.imap_last_uid + 1}:*`;
        uids = (await client.search({ uid: range }, { uid: true })) as number[];
      } else {
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - DEFAULT_LOOKBACK_DAYS);
        uids = (await client.search({ since }, { uid: true })) as number[];
      }
      uids = (uids ?? []).filter((u) => u > (settings.imap_last_uid ?? 0)).slice(
        0,
        PER_RUN_MESSAGE_CAP,
      );

      for (const uid of uids) {
        try {
          const message = await client.fetchOne(
            String(uid),
            { source: true, uid: true, flags: true },
            { uid: true },
          );
          if (!message?.source) continue;

          const sourceBuffer = message.source as Uint8Array;
          const parsedMime = await PostalMime.parse(sourceBuffer);
          const parsed = buildParsedEmail(
            parsedMime,
            `<imap-${source.id}-${uid}@${settings.imap_host}>`,
          );

          if (!parsed.fromEmail) {
            await recordEvent(supabase, {
              adapter: ADAPTER,
              source,
              state: "rejected",
              statusCode: 422,
              errorCode: "missing_sender",
              parsed,
              meta: { uid },
            });
            highestUid = Math.max(highestUid, uid);
            continue;
          }

          if (!senderAllowed(source, parsed.fromEmail)) {
            await recordEvent(supabase, {
              adapter: ADAPTER,
              source,
              state: "rejected",
              statusCode: 406,
              errorCode: "sender_not_allowed",
              parsed,
              meta: { uid, from_domain: domainOf(parsed.fromEmail) },
            });
            highestUid = Math.max(highestUid, uid);
            continue;
          }

          const result = await persistInboundEmail(supabase, source, parsed);

          if (result.duplicate) {
            duplicates += 1;
            await recordEvent(supabase, {
              adapter: ADAPTER,
              source,
              inboundEmailId: result.inboundEmailId,
              state: "duplicate",
              statusCode: 200,
              parsed,
              meta: { uid },
            });
          } else {
            processed += 1;
            await recordEvent(supabase, {
              adapter: ADAPTER,
              source,
              inboundEmailId: result.inboundEmailId,
              state: "accepted",
              statusCode: 200,
              parsed,
              meta: { uid, document_count: result.documentIds.length },
            });
          }

          if (settings.imap_mark_seen) {
            try {
              await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
            } catch {
              // best-effort; don't fail the run
            }
          }
          highestUid = Math.max(highestUid, uid);
        } catch (err) {
          errors += 1;
          const message = err instanceof Error ? err.message : String(err);
          await recordEvent(supabase, {
            adapter: ADAPTER,
            source,
            state: "failed",
            statusCode: 500,
            errorCode: "imap_message_failed",
            meta: { uid, message },
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore close errors
    }
  }

  // Persist watermark so next run picks up where we left off
  if (highestUid > (settings.imap_last_uid ?? 0)) {
    const nextSettings = {
      ...source.settings,
      imap_last_uid: highestUid,
      imap_last_synced_at: new Date().toISOString(),
    };
    await supabase
      .from("email_ingest_sources")
      .update({ settings: nextSettings })
      .eq("id", source.id);
  }

  return { source_id: source.id, processed, duplicates, errors };
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createServiceClient();
  const startedAt = performance.now();

  try {
    const sources = await loadImapSources(supabase);
    if (sources.length === 0) {
      return json({ ok: true, sources: 0, processed: 0 });
    }

    const summaries = await runWithConcurrency(sources, SOURCE_CONCURRENCY, async (source) => {
      try {
        return await processSource(supabase, source);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await recordEvent(supabase, {
          adapter: ADAPTER,
          source,
          state: "failed",
          statusCode: 500,
          errorCode: "imap_source_failed",
          meta: { message },
        });
        return { source_id: source.id, processed: 0, duplicates: 0, errors: 1 };
      }
    });

    return json({
      ok: true,
      sources: sources.length,
      duration_ms: Math.round(performance.now() - startedAt),
      summaries,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: "imap_poll_failed", detail: message }, 500);
  }
});
