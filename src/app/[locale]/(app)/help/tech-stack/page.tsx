import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { AnthropicMark } from "@/components/app/anthropic-logo";

export const dynamic = "force-dynamic";

interface Params { locale: string }

export default async function TechStackPage({ params }: { params: Promise<Params> }) {
  const { locale } = await params;
  const t = await getTranslations("help");

  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-3">
          <Link href={`/${locale}/help`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={12} />
            {t("nav.backToIndex")}
          </Link>
          <span className="text-border">·</span>
          <span className="text-xs font-medium text-violet-500">{t("tech_stack_page.header.categoryTag")}</span>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-10 md:px-10">
        <header className="mb-10">
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-foreground md:text-4xl">{t("tech_stack_page.header.title")}</h1>
          <p className="text-base leading-relaxed text-muted-foreground max-w-2xl">{t("tech_stack_page.header.subtitle")}</p>
          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <div className="size-1.5 rounded-full bg-primary/40" />
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>
        </header>

        <ArchDiagram title={t("tech_stack_page.diagram.title")} />

        <div className="mt-14 space-y-12">
          <TechCard
            logo={<AnthropicLogo />}
            name={t("tech_stack_page.anthropic.name")}
            tagline={t("tech_stack_page.anthropic.tagline")}
            gradient="from-[#D97757]/10 via-[#C06F4A]/5 to-transparent"
            border="border-[#D97757]/20"
            accent="#D97757"
            contributions={[
              { title: t("tech_stack_page.anthropic.c1Title"), desc: t("tech_stack_page.anthropic.c1Desc") },
              { title: t("tech_stack_page.anthropic.c2Title"), desc: t("tech_stack_page.anthropic.c2Desc") },
              { title: t("tech_stack_page.anthropic.c3Title"), desc: t("tech_stack_page.anthropic.c3Desc") },
              { title: t("tech_stack_page.anthropic.c4Title"), desc: t("tech_stack_page.anthropic.c4Desc") },
            ]}
            stats={[
              { label: t("tech_stack_page.anthropic.stat1Label"), value: "claude-sonnet-4-6" },
              { label: t("tech_stack_page.anthropic.stat2Label"), value: "claude-haiku" },
              { label: t("tech_stack_page.anthropic.stat3Label"), value: "$0.01–$0.05 / doc" },
              { label: t("tech_stack_page.anthropic.stat4Label"), value: t("tech_stack_page.anthropic.stat4Value") },
            ]}
          />

          <TechCard
            logo={<SupabaseLogo />}
            name={t("tech_stack_page.supabase.name")}
            tagline={t("tech_stack_page.supabase.tagline")}
            gradient="from-emerald-500/10 via-emerald-500/5 to-transparent"
            border="border-emerald-500/20"
            accent="#3ECF8E"
            contributions={[
              { title: t("tech_stack_page.supabase.c1Title"), desc: t("tech_stack_page.supabase.c1Desc") },
              { title: t("tech_stack_page.supabase.c2Title"), desc: t("tech_stack_page.supabase.c2Desc") },
              { title: t("tech_stack_page.supabase.c3Title"), desc: t("tech_stack_page.supabase.c3Desc") },
              { title: t("tech_stack_page.supabase.c4Title"), desc: t("tech_stack_page.supabase.c4Desc") },
              { title: t("tech_stack_page.supabase.c5Title"), desc: t("tech_stack_page.supabase.c5Desc") },
            ]}
            stats={[
              { label: t("tech_stack_page.supabase.stat1Label"), value: "PostgreSQL 15" },
              { label: t("tech_stack_page.supabase.stat2Label"), value: "Deno 1.x" },
              { label: t("tech_stack_page.supabase.stat3Label"), value: t("tech_stack_page.supabase.stat3Value") },
              { label: t("tech_stack_page.supabase.stat4Label"), value: t("tech_stack_page.supabase.stat4Value") },
            ]}
          />

          <TechCard
            logo={<VercelLogo />}
            name={t("tech_stack_page.vercel.name")}
            tagline={t("tech_stack_page.vercel.tagline")}
            gradient="from-slate-500/10 via-slate-500/5 to-transparent"
            border="border-slate-500/20"
            accent="#888"
            contributions={[
              { title: t("tech_stack_page.vercel.c1Title"), desc: t("tech_stack_page.vercel.c1Desc") },
              { title: t("tech_stack_page.vercel.c2Title"), desc: t("tech_stack_page.vercel.c2Desc") },
              { title: t("tech_stack_page.vercel.c3Title"), desc: t("tech_stack_page.vercel.c3Desc") },
              { title: t("tech_stack_page.vercel.c4Title"), desc: t("tech_stack_page.vercel.c4Desc") },
              { title: t("tech_stack_page.vercel.c5Title"), desc: t("tech_stack_page.vercel.c5Desc") },
            ]}
            stats={[
              { label: t("tech_stack_page.vercel.stat1Label"), value: "Next.js 16.2" },
              { label: t("tech_stack_page.vercel.stat2Label"), value: "19.2" },
              { label: t("tech_stack_page.vercel.stat3Label"), value: "v4" },
              { label: t("tech_stack_page.vercel.stat4Label"), value: t("tech_stack_page.vercel.stat4Value") },
            ]}
          />

          <TechCard
            logo={<OdooLogo />}
            name={t("tech_stack_page.odoo.name")}
            tagline={t("tech_stack_page.odoo.tagline")}
            gradient="from-purple-500/10 via-purple-500/5 to-transparent"
            border="border-purple-500/20"
            accent="#875A7B"
            contributions={[
              { title: t("tech_stack_page.odoo.c1Title"), desc: t("tech_stack_page.odoo.c1Desc") },
              { title: t("tech_stack_page.odoo.c2Title"), desc: t("tech_stack_page.odoo.c2Desc") },
              { title: t("tech_stack_page.odoo.c3Title"), desc: t("tech_stack_page.odoo.c3Desc") },
              { title: t("tech_stack_page.odoo.c4Title"), desc: t("tech_stack_page.odoo.c4Desc") },
            ]}
            stats={[
              { label: t("tech_stack_page.odoo.stat1Label"), value: "XML-RPC" },
              { label: t("tech_stack_page.odoo.stat2Label"), value: "ERP 19" },
              { label: t("tech_stack_page.odoo.stat3Label"), value: "erp.empresa.com" },
              { label: t("tech_stack_page.odoo.stat4Label"), value: t("tech_stack_page.odoo.stat4Value") },
            ]}
          />
        </div>

        <footer className="mt-16">
          <div className="mb-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{t("tech_stack_page.labels.readMore")}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { href: `/${locale}/help/pipeline`, label: t("tech_stack_page.labels.pipelineLink"), desc: t("tech_stack_page.labels.pipelineDesc") },
              { href: `/${locale}/help/glossary`, label: t("tech_stack_page.labels.glossaryLink"), desc: t("tech_stack_page.labels.glossaryDesc") },
            ].map((r) => (
              <Link key={r.href} href={r.href} className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
                <div>
                  <p className="text-sm font-medium text-foreground">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{r.desc}</p>
                </div>
                <ArrowRight size={14} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
}

function ArchDiagram({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-slate-950 to-slate-900 p-6 shadow-xl">
      <p className="mb-6 text-center text-[11px] font-semibold uppercase tracking-widest text-white/40">{title}</p>
      <div className="flex flex-col items-center gap-3 md:flex-row md:justify-center md:gap-4">
        <div className="flex flex-col items-center gap-1.5">
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center">
            <p className="text-[11px] font-semibold text-white/80">Browser / App</p>
            <p className="text-[10px] text-white/40">Next.js 16 · React 19</p>
            <p className="text-[10px] text-white/30">Vercel Edge</p>
          </div>
        </div>

        <Arrow />

        <div className="flex flex-col items-center gap-1.5">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center">
            <p className="text-[11px] font-semibold text-emerald-300">Supabase</p>
            <p className="text-[10px] text-emerald-400/60">PostgreSQL · Auth</p>
            <p className="text-[10px] text-emerald-400/60">Storage · Realtime</p>
          </div>
        </div>

        <Arrow />

        <div className="flex flex-col items-center gap-1.5">
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-center">
            <p className="text-[11px] font-semibold text-violet-300">Edge Functions</p>
            <p className="text-[10px] text-violet-400/60">Deno · ingest</p>
            <p className="text-[10px] text-violet-400/60">ai-process · odoo-sync</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Arrow />
          <Arrow vertical />
        </div>

        <div className="flex flex-col gap-2">
          <div className="rounded-xl border border-[#D97757]/30 bg-[#D97757]/10 px-4 py-2 text-center">
            <p className="text-[11px] font-semibold text-[#D97757]">Anthropic API</p>
            <p className="text-[10px] text-[#D97757]/60">claude-sonnet-4-6</p>
          </div>
          <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-center">
            <p className="text-[11px] font-semibold text-purple-300">ERP 19</p>
            <p className="text-[10px] text-purple-400/60">XML-RPC · ERP</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Arrow({ vertical = false }: { vertical?: boolean }) {
  if (vertical) {
    return <div className="flex justify-center"><div className="text-white/20 text-lg">↓</div></div>;
  }
  return <div className="hidden md:flex items-center text-white/20">→</div>;
}

function TechCard({
  logo, name, tagline, gradient, border, accent, contributions, stats,
}: {
  logo: React.ReactNode;
  name: string;
  tagline: string;
  gradient: string;
  border: string;
  accent: string;
  contributions: { title: string; desc: string }[];
  stats: { label: string; value: string }[];
}) {
  return (
    <section className={`rounded-2xl border ${border} bg-gradient-to-br ${gradient} p-6 md:p-8`}>
      <div className="mb-6 flex items-start gap-4">
        <div className="shrink-0">{logo}</div>
        <div>
          <h2 className="text-xl font-bold text-foreground">{name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-background/60 px-3 py-2.5 backdrop-blur-sm">
            <p className="font-mono text-sm font-bold text-foreground">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {contributions.map((c) => (
          <div key={c.title} className="rounded-xl border border-border bg-background/40 p-4 backdrop-blur-sm">
            <div className="mb-2 flex items-center gap-2">
              <div className="size-1.5 rounded-full" style={{ background: accent }} />
              <h3 className="text-sm font-semibold text-foreground">{c.title}</h3>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{c.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function AnthropicLogo() {
  return (
    <div className="flex size-12 items-center justify-center rounded-xl bg-[#D97757]/10 border border-[#D97757]/20">
      <AnthropicMark size={28} className="text-[#D97757]" />
    </div>
  );
}

function SupabaseLogo() {
  return (
    <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C.111 12.857.634 14 1.672 14H11V22.964c.015.986 1.26 1.41 1.874.637l9.262-11.65c.653-.807.13-1.951-.908-1.951H13L11.9 1.036z" fill="#3ECF8E"/>
      </svg>
    </div>
  );
}

function VercelLogo() {
  return (
    <div className="flex size-12 items-center justify-center rounded-xl bg-slate-500/10 border border-slate-500/20">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" className="text-foreground">
        <path d="M24 22.525H0l12-21.05 12 21.05z"/>
      </svg>
    </div>
  );
}

function OdooLogo() {
  return (
    <div className="flex size-12 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20">
      <svg viewBox="0 0 100 100" width="30" height="30" fill="none">
        <circle cx="50" cy="50" r="38" fill="#875A7B"/>
        <text x="50" y="62" textAnchor="middle" fontSize="36" fontWeight="bold" fill="white" fontFamily="system-ui">O</text>
      </svg>
    </div>
  );
}
