"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  QrCode,
  Copy,
  Check,
  Link2,
  RefreshCw,
  ScanLine,
  Camera as CameraIcon,
  Inbox,
  Lock,
  ExternalLink,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props { children: ReactNode }
interface ScanLink { url: string; token: string; expiresAt: string }

const LS_KEY = "docflow.scan_link";

export function QrScannerDialog({ children }: Props) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<ScanLink | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Cargar o generar el link al abrir.
  useEffect(() => {
    if (!open) return;
    const cached = localStorage.getItem(LS_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as ScanLink;
        if (new Date(parsed.expiresAt).getTime() > Date.now()) {
          setLink(parsed); return;
        }
      } catch { /* ignore */ }
    }
    fetch("/api/scan-links", { method: "POST" })
      .then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return (await r.json()) as ScanLink; })
      .then(data => { setLink(data); localStorage.setItem(LS_KEY, JSON.stringify(data)); })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`No se pudo generar el link: ${msg}`);
      });
  }, [open]);

  // Fetch del SVG y inject inline.
  useEffect(() => {
    if (!open || !link?.url) {
      setQrSvg(null); setQrError(null);
      return;
    }
    let cancelled = false;
    setQrError(null);
    fetch(`/api/scan-links/qr?url=${encodeURIComponent(link.url)}`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(svg => {
        if (!cancelled) {
          const sized = svg
            .replace(/<svg([^>]*)\swidth="[^"]*"/, "<svg$1")
            .replace(/<svg([^>]*)\sheight="[^"]*"/, "<svg$1")
            .replace(/<svg /, '<svg width="220" height="220" ');
          setQrSvg(sized);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setQrError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, [open, link?.url]);

  function regenerate() {
    localStorage.removeItem(LS_KEY);
    setLink(null);
    fetch("/api/scan-links", { method: "POST" })
      .then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return (await r.json()) as ScanLink; })
      .then(data => { setLink(data); localStorage.setItem(LS_KEY, JSON.stringify(data)); toast.success("Link regenerado"); })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`No se pudo regenerar: ${msg}`);
      });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      toast.success("Link copiado");
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("No se pudo copiar el link"); }
  }

  // Mint a long-lived (100 años) token y abrir la página imprimible en
  // nueva pestaña. Si el tenant tiene PIN configurado, pedimos que lo
  // escriba acá para imprimirlo en el flyer (el hash en DB es irreversible).
  async function openPrintable() {
    try {
      // Check PIN config first.
      let printPin: string | null = null;
      const cfgRes = await fetch("/api/settings/scan-pin");
      if (cfgRes.ok) {
        const cfg = (await cfgRes.json()) as { hasPin?: boolean };
        if (cfg.hasPin) {
          const entered = window.prompt(
            "Este tenant tiene PIN. Escribí los 4 dígitos para incluirlos en el flyer (sólo display — no se guarda):",
          );
          if (entered === null) return; // cancel
          if (!/^\d{4}$/.test(entered)) {
            toast.error("PIN inválido (4 dígitos)");
            return;
          }
          printPin = entered;
        }
      }

      const res = await fetch("/api/scan-links/permanent", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { printUrl: string };
      if (!data.printUrl) throw new Error("missing printUrl");
      const url = printPin
        ? `${data.printUrl}?pin=${encodeURIComponent(printPin)}`
        : data.printUrl;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`No se pudo generar el QR imprimible: ${msg}`);
    }
  }

  // URL preview — solo dominio + path corto para mostrar (no el token completo).
  function shortUrlPreview(url: string | undefined): string {
    if (!url) return "";
    try {
      const u = new URL(url);
      const pathParts = u.pathname.split("/").filter(Boolean);
      const lastPart = pathParts[pathParts.length - 1] ?? "";
      const truncatedLast = lastPart.length > 12 ? `${lastPart.slice(0, 8)}…` : lastPart;
      const prefix = pathParts.slice(0, -1).join("/");
      return `${u.host}/${prefix ? prefix + "/" : ""}${truncatedLast}`;
    } catch {
      return url.slice(0, 40) + "…";
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[420px] gap-0 p-0 overflow-hidden">

        {/* Header con gradiente sutil */}
        <DialogHeader className="border-b border-border bg-gradient-to-br from-violet-50 via-card to-card px-5 py-4 dark:from-violet-950/30">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500 text-white shadow-sm shadow-violet-500/30">
              <QrCode size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[14px] font-semibold">
                Escanear desde el celular
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-[11px] text-muted-foreground">
                Tomá fotos de órdenes — aparecen en tu Inbox automáticamente.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* QR card */}
        <div className="flex flex-col items-center gap-4 px-5 py-6 bg-gradient-to-b from-muted/20 to-card">
          <div className="relative">
            {/* Esquinas decorativas tipo "viewfinder" */}
            <div aria-hidden className="pointer-events-none absolute -inset-1.5">
              <div className="absolute left-0 top-0 size-4 border-l-2 border-t-2 border-violet-400 dark:border-violet-500 rounded-tl-md" />
              <div className="absolute right-0 top-0 size-4 border-r-2 border-t-2 border-violet-400 dark:border-violet-500 rounded-tr-md" />
              <div className="absolute left-0 bottom-0 size-4 border-l-2 border-b-2 border-violet-400 dark:border-violet-500 rounded-bl-md" />
              <div className="absolute right-0 bottom-0 size-4 border-r-2 border-b-2 border-violet-400 dark:border-violet-500 rounded-br-md" />
            </div>

            {/* QR container */}
            <div className="rounded-2xl border border-border bg-white p-4 shadow-md shadow-black/5">
              {qrSvg ? (
                <div
                  className="size-[220px] [&>svg]:size-[220px]"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : qrError ? (
                <div className="flex size-[220px] flex-col items-center justify-center gap-2 rounded-lg bg-red-50 p-4 text-center dark:bg-red-950/30">
                  <p className="text-[11px] font-semibold text-red-700 dark:text-red-400">
                    Error generando QR
                  </p>
                  <p className="text-[10px] text-red-600 dark:text-red-500 break-all">
                    {qrError}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={regenerate}
                    className="mt-2 h-7 text-[11px]"
                  >
                    <RefreshCw className="size-3" />
                    Reintentar
                  </Button>
                </div>
              ) : (
                <div className="flex size-[220px] flex-col items-center justify-center gap-2.5">
                  <div className="size-7 animate-spin rounded-full border-[2.5px] border-violet-200 border-t-violet-500" />
                  <p className="text-[10px] text-muted-foreground">
                    {!link ? "Generando link…" : "Generando QR…"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Pill de estado */}
          {qrSvg && (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Listo para escanear
            </div>
          )}
        </div>

        {/* Link section */}
        <div className="px-5 pb-4 space-y-2">
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <Link2 size={11} className="text-violet-500 dark:text-violet-400" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Link de escaneo
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground" title={link?.url ?? ""}>
                {shortUrlPreview(link?.url)}
              </span>
            </div>
            <details className="group">
              <summary className="cursor-pointer list-none text-[10px] text-violet-600 hover:text-violet-700 hover:underline dark:text-violet-400 select-none">
                <span className="group-open:hidden">Ver URL completa ↓</span>
                <span className="hidden group-open:inline">Ocultar URL ↑</span>
              </summary>
              <p className="mt-2 break-all rounded-md bg-background border border-border/50 p-2 font-mono text-[9.5px] leading-relaxed text-foreground">
                {link?.url ?? "Generando…"}
              </p>
            </details>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={copy}
              disabled={!link}
              className="h-8 text-[11px]"
            >
              {copied ? (
                <><Check size={12} className="text-emerald-500" />Copiado</>
              ) : (
                <><Copy size={12} />Copiar link</>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={regenerate}
              className="h-8 text-[11px]"
            >
              <RefreshCw size={12} />
              Regenerar
            </Button>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={openPrintable}
            className="h-8 w-full text-[11px] border-violet-500/30 text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40"
          >
            <Printer size={12} />
            QR permanente para imprimir
          </Button>

          {link?.url && (
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-md py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink size={10} />
              Abrir link en otra pestaña
            </a>
          )}
        </div>

        {/* Cómo funciona — pasos con iconos */}
        <div className="border-t border-border bg-muted/20 px-5 py-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Cómo funciona
          </p>
          <ol className="space-y-2.5">
            <Step n={1} icon={ScanLine}>
              Escaneá el QR con la cámara del celular
            </Step>
            <Step n={2} icon={CameraIcon}>
              Tomá fotos de uno o más documentos
            </Step>
            <Step n={3} icon={Inbox}>
              Aparecen en tu Inbox listos para revisar
            </Step>
          </ol>
          <div className="mt-3 flex items-center gap-1.5 rounded-md bg-emerald-500/5 border border-emerald-500/15 px-2.5 py-1.5">
            <Lock size={10} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
              Link privado — no requiere login.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-card px-5 py-3 flex justify-end">
          <DialogClose asChild>
            <Button size="sm">Listo</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Step({
  n,
  icon: Icon,
  children,
}: {
  n: number;
  icon: typeof Inbox;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3">
      <div className="relative flex shrink-0">
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-lg",
            "bg-violet-500/10 text-violet-600 dark:text-violet-400",
          )}
        >
          <Icon size={12} />
        </span>
        <span className="absolute -right-1 -top-1 inline-flex size-3.5 items-center justify-center rounded-full bg-violet-500 text-[8px] font-bold tabular-nums text-white">
          {n}
        </span>
      </div>
      <span className="text-[11.5px] text-foreground">{children}</span>
    </li>
  );
}
