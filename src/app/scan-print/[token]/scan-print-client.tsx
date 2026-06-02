"use client";

import { Printer, AlertCircle } from "lucide-react";

interface Props {
  qrSvg: string;
  scanUrl: string;
  tenantName: string;
  pin: string | null;
  pinRequired: boolean;
}

export function ScanPrintClient({
  qrSvg,
  scanUrl,
  tenantName,
  pin,
  pinRequired,
}: Props) {
  const cleanedSvg = qrSvg
    .replace(/<svg([^>]*)\swidth="[^"]*"/, "<svg$1")
    .replace(/<svg([^>]*)\sheight="[^"]*"/, "<svg$1");

  const host = (() => {
    try {
      return new URL(scanUrl).host;
    } catch {
      return "app.example.com";
    }
  })();

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 12mm; }
          body { background: #ffffff !important; }
          .pin-watermark { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
        .qr-svg svg { width: 100%; height: auto; display: block; }
      `}</style>

      <div className="min-h-[100dvh] bg-zinc-50 text-zinc-900">
        {/* Screen-only toolbar */}
        <div className="no-print sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3.5">
            <div>
              <p className="text-[13px] font-semibold tracking-tight">Flyer del QR</p>
              <p className="text-[11px] text-zinc-500">
                A4 · pegalo donde el equipo pueda escanearlo
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="
                inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-2.5
                text-[13px] font-semibold text-white shadow-sm
                transition-all hover:bg-zinc-800 active:scale-[0.98]
              "
            >
              <Printer size={14} strokeWidth={2} />
              Imprimir
            </button>
          </div>
        </div>

        {/* PIN missing warning */}
        {pinRequired && !pin && (
          <div className="no-print mx-auto max-w-3xl px-5 pt-4">
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600" strokeWidth={2} />
              <div>
                <p className="text-[12.5px] font-semibold text-amber-900">
                  Este tenant tiene PIN configurado
                </p>
                <p className="mt-0.5 text-[11px] text-amber-800/90">
                  Volvé al app y abrí el dialog del QR — escribí el PIN para incluirlo en este
                  flyer. Por seguridad no podemos leerlo de la base.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Printable poster — A4 layout */}
        <div className="mx-auto max-w-3xl px-6 py-10 print:py-0">
          <div className="rounded-3xl bg-white p-10 shadow-[0_2px_24px_-12px_rgba(0,0,0,0.08)] print:rounded-none print:shadow-none print:p-0">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-2.5 rounded-full bg-emerald-500" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  DocFlow Capture
                </span>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                {tenantName}
              </span>
            </div>

            {/* Hero text */}
            <div className="mt-12">
              <h1 className="text-[42px] font-semibold tracking-tight leading-[1.02] text-zinc-950">
                Subí órdenes desde tu celular
              </h1>
              <p className="mt-3 max-w-[40ch] text-[14px] leading-relaxed text-zinc-600">
                Escaneá el código, tomá fotos de las órdenes y se procesan automáticamente.
                Aparecen en ERP como sales orders.
              </p>
            </div>

            {/* QR + PIN side by side */}
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-8 items-center">
              <div className="rounded-2xl border-2 border-zinc-200 bg-white p-6">
                <div
                  className="qr-svg mx-auto"
                  style={{ width: 380, maxWidth: "100%" }}
                  dangerouslySetInnerHTML={{ __html: cleanedSvg }}
                />
              </div>

              {pin && (
                <div className="pin-watermark flex flex-col items-center justify-center rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-8 py-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-700">
                    PIN de acceso
                  </p>
                  <p className="mt-3 font-mono text-[56px] font-semibold tabular-nums tracking-[0.15em] leading-none text-zinc-950">
                    {pin}
                  </p>
                  <p className="mt-3 max-w-[18ch] text-center text-[10px] leading-snug text-emerald-800/80">
                    Ingresalo después de escanear el QR
                  </p>
                </div>
              )}
            </div>

            {/* URL fallback */}
            <div className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-3 text-center">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-zinc-500">
                ¿No escanea? abrí esta URL
              </p>
              <p className="mt-1.5 font-mono text-[12px] text-zinc-900 break-all">
                {scanUrl}
              </p>
            </div>

            {/* Steps */}
            <div className="mt-10">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                Cómo se usa
              </p>
              <ol className="mt-4 grid gap-3 sm:grid-cols-2">
                <Step n={1} title="Escaneá el QR">
                  Apuntá la cámara del celular al código. Se abre el DocFlow Capture.
                </Step>
                {pin ? (
                  <Step n={2} title="Ingresá el PIN">
                    Escribí los 4 dígitos de arriba. Se guarda por 12 horas.
                  </Step>
                ) : (
                  <Step n={2} title="Tocá Tomar foto">
                    El botón abre la cámara del celular directamente.
                  </Step>
                )}
                <Step n={pin ? 3 : 3} title="Capturá la orden">
                  Tomá la foto o subí un PDF. PDF, JPG, PNG, WEBP hasta 25MB.
                </Step>
                <Step n={pin ? 4 : 4} title="Listo">
                  La IA lee la orden y genera el sales order en ERP automáticamente.
                </Step>
              </ol>
            </div>

            {/* Notes */}
            <div className="mt-10 border-t border-zinc-200 pt-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                Notas
              </p>
              <ul className="mt-3 space-y-1.5 text-[11.5px] leading-relaxed text-zinc-600">
                <li>
                  <span className="font-semibold text-zinc-900">·</span> Buena iluminación =
                  mejor lectura. Evitá sombras sobre la orden.
                </li>
                <li>
                  <span className="font-semibold text-zinc-900">·</span> Si la foto sale movida,
                  tirá otra. Se procesan en orden de captura.
                </li>
                <li>
                  <span className="font-semibold text-zinc-900">·</span> Podés ver el archivo
                  original y el SO# directo desde el celular.
                </li>
                <li>
                  <span className="font-semibold text-zinc-900">·</span> Si una orden no genera
                  el SO sola, tocá <em>Generar ERP SO</em> en la app.
                </li>
              </ul>
            </div>

            {/* Footer */}
            <div className="mt-10 flex items-center justify-between border-t border-zinc-200 pt-4">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-zinc-400">
                {host}
              </p>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-zinc-400">
                {pinRequired ? "Acceso protegido por PIN" : "No requiere login"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex size-7 items-center justify-center rounded-full bg-zinc-950 font-mono text-[12px] font-semibold tabular-nums text-white">
        {n}
      </div>
      <p className="mt-2.5 text-[13px] font-semibold tracking-tight text-zinc-950">
        {title}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">{children}</p>
    </div>
  );
}
