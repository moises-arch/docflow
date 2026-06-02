import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PipelineInteractive } from "./pipeline-interactive";

export const dynamic = "force-dynamic";

interface Params { locale: string }

export default async function PipelinePage({ params }: { params: Promise<Params> }) {
  const { locale } = await params;
  const t = await getTranslations("help");

  return (
    <div className="h-full overflow-y-auto">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-3">
          <Link
            href={`/${locale}/help`}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={12} />
            {t("nav.backToIndex")}
          </Link>
          <span className="text-border">·</span>
          <span className="text-xs font-medium text-violet-500">{t("pipeline_page.header.categoryTag")}</span>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-10 md:px-10">
        {/* Header */}
        <header className="mb-10">
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {t("pipeline_page.header.title")}
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground max-w-2xl">
            {t("pipeline_page.header.subtitle")}
          </p>
          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <div className="size-1.5 rounded-full bg-primary/40" />
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>
        </header>

        {/* Interactive pipeline */}
        <PipelineInteractive />

        {/* App screenshots mockup */}
        <section className="mt-12 space-y-6">
          <h2 className="text-xl font-bold text-foreground">{t("pipeline_page.labels.screenshotsTitle")}</h2>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Inbox screenshot mockup */}
            <div className="overflow-hidden rounded-xl border border-border shadow-lg">
              <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-3 py-2">
                <div className="size-2.5 rounded-full bg-rose-400/70" />
                <div className="size-2.5 rounded-full bg-amber-400/70" />
                <div className="size-2.5 rounded-full bg-emerald-400/70" />
                <span className="ml-2 text-[11px] text-muted-foreground">{t("pipeline_page.labels.screenshotInbox")}</span>
              </div>
              <InboxMockup />
            </div>

            {/* Processed screenshot mockup */}
            <div className="overflow-hidden rounded-xl border border-border shadow-lg">
              <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-3 py-2">
                <div className="size-2.5 rounded-full bg-rose-400/70" />
                <div className="size-2.5 rounded-full bg-amber-400/70" />
                <div className="size-2.5 rounded-full bg-emerald-400/70" />
                <span className="ml-2 text-[11px] text-muted-foreground">{t("pipeline_page.labels.screenshotProcessed")}</span>
              </div>
              <ProcessedMockup />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── App UI Mockups ─────────────────────────────────────────────────────────────
function InboxMockup() {
  return (
    <div className="bg-background p-4 text-xs space-y-3">
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">⚠ 3 documents need review</span>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] bg-muted/40 px-3 py-1.5 text-[10px] font-medium text-muted-foreground">
          <span>Document</span><span>Status</span><span>Pages</span><span>AI cost</span>
        </div>
        {[
          { name: "6107620.pdf", status: "needs_review", pages: "1", cost: "$0.03", color: "bg-amber-400" },
          { name: "PO#1383.pdf", status: "needs_review", pages: "1", cost: "$0.01", color: "bg-amber-400" },
          { name: "BC-GEL-109.pdf", status: "processing", pages: "—", cost: "—", color: "bg-blue-400" },
        ].map((row) => (
          <div key={row.name} className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center border-t border-border px-3 py-2">
            <span className="font-medium text-foreground truncate">{row.name}</span>
            <span className="flex items-center gap-1">
              <div className={`size-1.5 rounded-full ${row.color}`} />
              <span className="text-[10px] text-muted-foreground capitalize">{row.status.replace("_", " ")}</span>
            </span>
            <span className="text-muted-foreground">{row.pages}</span>
            <span className="font-mono text-muted-foreground">{row.cost}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProcessedMockup() {
  return (
    <div className="bg-background p-4 text-xs space-y-3">
      <div className="grid grid-cols-4 gap-2 mb-1">
        {[
          { label: "Total volume", value: "$2,441", color: "text-foreground" },
          { label: "Success rate", value: "100%", color: "text-emerald-500" },
          { label: "Orders", value: "15", color: "text-foreground" },
          { label: "AI cost", value: "$0.30", color: "text-violet-500" },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-center">
            <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
            <p className="text-[9px] text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] bg-muted/40 px-3 py-1.5 text-[10px] font-medium text-muted-foreground">
          <span>Customer</span><span>ERP SO</span><span>Total</span><span>Status</span>
        </div>
        {[
          { customer: "ACE HARDWARE CORP", so: "S09277", total: "$426.00", status: "Synced" },
          { customer: "NORTHERN TOOL + EQUIP", so: "S09276", total: "$302.00", status: "Synced" },
          { customer: "JB Tools", so: "S09278", total: "$1.63", status: "Synced" },
        ].map((row) => (
          <div key={row.so} className="grid grid-cols-[1.5fr_1fr_1fr_1fr] items-center border-t border-border px-3 py-2">
            <span className="font-medium text-foreground truncate text-[10px]">{row.customer}</span>
            <span className="font-mono text-[10px] text-blue-500">{row.so} ↗</span>
            <span className="font-mono text-[10px] text-foreground">{row.total}</span>
            <span className="flex items-center gap-1">
              <div className="size-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-emerald-600">{row.status}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
