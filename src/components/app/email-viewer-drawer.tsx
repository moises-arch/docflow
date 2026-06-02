"use client";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Download,
  FileText,
  ImageIcon,
  Loader2,
  Mail,
  Paperclip,
  Code2,
  ExternalLink,
} from "lucide-react";
import { useEffect, useState } from "react";

type Attachment = {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  disposition: string | null;
  state: string;
  document_id: string | null;
  download_url: string | null;
};

type EmailDetail = {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  received_at: string;
  state: string;
  adapter: string | null;
  recipients: string[];
  html_url: string | null;
  text_url: string | null;
  raw_url: string | null;
  attachments: Attachment[];
};

type Props = {
  inboundEmailId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EmailViewerDrawer({ inboundEmailId, open, onOpenChange }: Props) {
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"rendered" | "text" | "raw">("rendered");
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [rawContent, setRawContent] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !inboundEmailId) {
      setEmail(null);
      setError(null);
      setHtmlContent(null);
      setTextContent(null);
      setRawContent(null);
      setView("rendered");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/inbound-emails/${inboundEmailId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as EmailDetail;
      })
      .then((data) => {
        if (cancelled) return;
        setEmail(data);
        setView(data.html_url ? "rendered" : data.text_url ? "text" : "rendered");
        // Pre-fetch all three so switching views is instant
        if (data.html_url) {
          fetch(data.html_url)
            .then((r) => r.text())
            .then((t) => !cancelled && setHtmlContent(t))
            .catch(() => !cancelled && setHtmlContent("<p>Error cargando HTML</p>"));
        }
        if (data.text_url) {
          fetch(data.text_url)
            .then((r) => r.text())
            .then((t) => !cancelled && setTextContent(t))
            .catch(() => !cancelled && setTextContent("(error)"));
        }
        if (data.raw_url) {
          fetch(data.raw_url)
            .then((r) => r.text())
            .then((t) => !cancelled && setRawContent(t))
            .catch(() => !cancelled && setRawContent("(error)"));
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, inboundEmailId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-hidden p-0 sm:!max-w-[min(95vw,1200px)]"
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Mail size={16} className="text-muted-foreground" />
            Detalle del correo
          </SheetTitle>
          <SheetDescription className="sr-only">
            Visualización completa del correo recibido y sus adjuntos
          </SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="flex h-[60vh] items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="px-6 py-8 text-sm text-destructive">No se pudo cargar: {error}</div>
        )}

        {!loading && !error && email && (
          <div className="flex h-[calc(100vh-65px)] flex-col overflow-y-auto">
            {/* ── Header con metadata estilo cliente de correo ──────────────── */}
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold leading-tight text-foreground">
                {email.subject || <span className="italic text-muted-foreground">(sin asunto)</span>}
              </h2>
              <div className="mt-3 grid gap-1.5 text-xs">
                <Row label="De">
                  <span className="font-medium text-foreground">
                    {email.from_name || email.from_email}
                  </span>
                  {email.from_name && (
                    <span className="ml-1.5 text-muted-foreground">&lt;{email.from_email}&gt;</span>
                  )}
                </Row>
                {email.recipients.length > 0 && (
                  <Row label="Para">
                    <span className="text-foreground">{email.recipients.join(", ")}</span>
                  </Row>
                )}
                <Row label="Fecha">
                  <span className="text-foreground">
                    {new Date(email.received_at).toLocaleString("es-MX", {
                      dateStyle: "long",
                      timeStyle: "short",
                    })}
                  </span>
                </Row>
                {email.adapter && (
                  <Row label="Vía">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {email.adapter}
                    </span>
                  </Row>
                )}
              </div>
            </div>

            {/* ── Attachments ────────────────────────────────────────────────── */}
            {email.attachments.length > 0 && (
              <div className="border-b px-6 py-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Paperclip size={12} />
                  {email.attachments.length}{" "}
                  {email.attachments.length === 1 ? "adjunto" : "adjuntos"}
                </div>
                <ul className="grid gap-1.5">
                  {email.attachments.map((a) => (
                    <li key={a.id}>
                      <AttachmentItem attachment={a} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ── View tabs ──────────────────────────────────────────────────── */}
            <div className="flex items-center gap-1 border-b px-6 py-2">
              <ViewTab
                active={view === "rendered"}
                disabled={!email.html_url && !email.text_url}
                onClick={() => setView("rendered")}
                icon={<Mail size={12} />}
                label="Vista"
              />
              {email.text_url && (
                <ViewTab
                  active={view === "text"}
                  onClick={() => setView("text")}
                  icon={<FileText size={12} />}
                  label="Texto plano"
                />
              )}
              {email.raw_url && (
                <ViewTab
                  active={view === "raw"}
                  onClick={() => setView("raw")}
                  icon={<Code2 size={12} />}
                  label="JSON crudo"
                />
              )}
              {email.raw_url && (
                <a
                  href={email.raw_url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink size={11} />
                  abrir crudo
                </a>
              )}
            </div>

            {/* ── Body ───────────────────────────────────────────────────────── */}
            <div className="min-h-[60vh] flex-1 overflow-hidden bg-muted/30">
              {view === "rendered" ? (
                htmlContent !== null ? (
                  <iframe
                    srcDoc={wrapHtml(htmlContent)}
                    sandbox="allow-same-origin"
                    referrerPolicy="no-referrer"
                    className="h-full w-full bg-white"
                    title="Cuerpo del correo"
                  />
                ) : textContent !== null ? (
                  <pre className="h-full overflow-auto whitespace-pre-wrap break-words bg-white p-6 text-sm text-foreground">
                    {textContent}
                  </pre>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                )
              ) : view === "text" ? (
                textContent === null ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <pre className="h-full overflow-auto whitespace-pre-wrap break-words bg-background p-4 font-mono text-xs text-foreground">
                    {textContent}
                  </pre>
                )
              ) : view === "raw" ? (
                rawContent === null ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <pre className="h-full overflow-auto whitespace-pre-wrap break-words bg-background p-4 font-mono text-[11px] text-foreground">
                    {prettyJson(rawContent)}
                  </pre>
                )
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Este correo no tiene cuerpo guardado.
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[60px_1fr] items-baseline gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="truncate">{children}</span>
    </div>
  );
}

function ViewTab({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function AttachmentItem({ attachment }: { attachment: Attachment }) {
  const Icon = attachment.mime_type.startsWith("image/")
    ? ImageIcon
    : attachment.mime_type === "application/pdf"
      ? FileText
      : Paperclip;
  const sizeLabel =
    attachment.size_bytes > 1024 * 1024
      ? `${(attachment.size_bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(attachment.size_bytes / 1024))} KB`;
  const skipped = attachment.state === "skipped_inline";
  return (
    <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs">
      <Icon size={14} className="shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground">{attachment.original_name}</div>
        <div className="text-[10px] text-muted-foreground">
          {attachment.mime_type} · {sizeLabel}
          {skipped && (
            <span className="ml-2 rounded-sm bg-amber-500/10 px-1.5 py-px text-[9px] font-medium text-amber-700 dark:text-amber-400">
              firma · ignorado
            </span>
          )}
          {attachment.document_id && (
            <span className="ml-2 rounded-sm bg-emerald-500/10 px-1.5 py-px text-[9px] font-medium text-emerald-700 dark:text-emerald-400">
              procesado
            </span>
          )}
        </div>
      </div>
      {attachment.download_url && (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          aria-label={`Descargar ${attachment.original_name}`}
        >
          <a href={attachment.download_url} target="_blank" rel="noreferrer" download>
            <Download size={13} />
          </a>
        </Button>
      )}
    </div>
  );
}

// Wrap raw email HTML with a minimal styling shell so it renders cleanly
// regardless of whether the source includes <html><head> tags. We use
// sandbox="allow-same-origin" (only) so the iframe can resolve URLs but no
// scripts run — safe against email-borne XSS.
function wrapHtml(html: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <base target="_blank">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
           color: #111; padding: 16px 20px; margin: 0; line-height: 1.5;
           font-size: 14px; word-wrap: break-word; }
    img, video { max-width: 100%; height: auto; }
    table { max-width: 100%; border-collapse: collapse; }
    a { color: #2563eb; }
    pre { white-space: pre-wrap; word-wrap: break-word; }
    blockquote { margin: 8px 0; padding-left: 12px; border-left: 3px solid #e5e7eb;
                 color: #4b5563; }
  </style>
</head>
<body>${html}</body>
</html>`;
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
