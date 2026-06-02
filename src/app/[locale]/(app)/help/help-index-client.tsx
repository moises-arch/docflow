"use client";

import { useState, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import {
  Search, ArrowRight, BookOpen, Settings, Lightbulb,
  Workflow, AlertTriangle, Zap, FileText, X,
} from "lucide-react";
import { AnthropicMark } from "@/components/app/anthropic-logo";
import { DocumentScanner } from "./document-scanner";
import type { HelpCategory } from "@/lib/help/articles";

interface ArticleSummary {
  slug: string;
  category: HelpCategory;
  title: string;
  summary: string;
}

interface CategoryLabel {
  id: HelpCategory;
  label: string;
}

interface Props {
  articles: ArticleSummary[];
  categories: CategoryLabel[];
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  noResults: string;
}

// Category visual config
const CAT_CONFIG: Record<HelpCategory, {
  icon: typeof BookOpen;
  gradient: string;
  iconBg: string;
  iconColor: string;
  border: string;
}> = {
  quickStart: {
    icon: Zap,
    gradient: "from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/10",
    iconBg: "bg-amber-100 dark:bg-amber-900/40",
    iconColor: "text-amber-600 dark:text-amber-400",
    border: "border-amber-200/60 dark:border-amber-800/40",
  },
  setup: {
    icon: Settings,
    gradient: "from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/10",
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
    iconColor: "text-blue-600 dark:text-blue-400",
    border: "border-blue-200/60 dark:border-blue-800/40",
  },
  concepts: {
    icon: Lightbulb,
    gradient: "from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/10",
    iconBg: "bg-violet-100 dark:bg-violet-900/40",
    iconColor: "text-violet-600 dark:text-violet-400",
    border: "border-violet-200/60 dark:border-violet-800/40",
  },
  workflow: {
    icon: Workflow,
    gradient: "from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/10",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-200/60 dark:border-emerald-800/40",
  },
  troubleshooting: {
    icon: AlertTriangle,
    gradient: "from-rose-50 to-red-50 dark:from-rose-950/20 dark:to-red-950/10",
    iconBg: "bg-rose-100 dark:bg-rose-900/40",
    iconColor: "text-rose-600 dark:text-rose-400",
    border: "border-rose-200/60 dark:border-rose-800/40",
  },
};

// Featured slugs shown in hero area
const FEATURED_SLUGS = ["getting-started", "pipeline", "anthropic-key", "odoo-setup"];

export function HelpIndexClient({
  articles,
  categories,
  title: _title,
  subtitle,
  searchPlaceholder,
  noResults,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("help");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(
      (a) => a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q),
    );
  }, [query, articles]);

  const featuredArticles = useMemo(
    () => FEATURED_SLUGS.map((s) => articles.find((a) => a.slug === s)).filter(Boolean) as ArticleSummary[],
    [articles],
  );

  const isSearching = query.trim().length > 0;

  return (
    <div className="h-full overflow-y-auto">
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 py-14 md:px-14">
        {/* Decorative grid */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-blue-500/20 blur-3xl"
        />

        {/* Background scanner sweep — runs across the full hero width near the bottom */}
        <div aria-hidden="true" className="hero-scanner-sweep">
          <div className="hero-scanner-glow" />
          <div className="hero-scanner-line" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_auto]">
          {/* Left column: text + search */}
          <div className="min-w-0">
            {/* Tech stack badges */}
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/60">
                <AnthropicMark size={13} className="text-[#D97757]" />
                Anthropic Claude
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/60">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" className="text-emerald-400">
                  <path d="M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C.111 12.857.634 14 1.672 14H11V22.964c.015.986 1.26 1.41 1.874.637l9.262-11.65c.653-.807.13-1.951-.908-1.951H13L11.9 1.036z"/>
                </svg>
                Supabase
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/60">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" className="text-white/80">
                  <path d="M24 22.525H0l12-21.05 12 21.05z"/>
                </svg>
                Vercel / Next.js
              </div>
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">{subtitle}</h1>

            {/* Search */}
            <div className="relative mt-8 max-w-xl">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-xl border border-white/10 bg-white/10 py-3.5 pl-11 pr-10 text-sm text-white placeholder:text-white/40 backdrop-blur-sm outline-none transition-all focus:border-white/25 focus:bg-white/15"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-white/40 hover:text-white/70"
                  aria-label="Clear"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Quick links */}
            {!isSearching && (
              <div className="mt-6 flex flex-wrap gap-2">
                {featuredArticles.map((a) => (
                  <Link
                    key={a.slug}
                    href={`/${locale}/help/${a.slug}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 backdrop-blur-sm transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
                  >
                    <FileText size={10} aria-hidden="true" />
                    {a.title}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Right column: animated document scanner — hidden on mobile to keep hero compact */}
          <div className="hidden lg:block">
            <DocumentScanner />
          </div>
        </div>

        {/* Hero-wide scanner sweep styles — vertical scan, more pronounced */}
        <style jsx>{`
          @keyframes hero-scan-sweep-v {
            0% { transform: translateY(-100%); opacity: 0; }
            8% { opacity: 1; }
            92% { opacity: 1; }
            100% { transform: translateY(100%); opacity: 0; }
          }
          @keyframes hero-scan-pulse {
            0%, 100% { opacity: 0.85; }
            50% { opacity: 1; }
          }
          .hero-scanner-sweep {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            right: 0;
            pointer-events: none;
            overflow: hidden;
          }
          .hero-scanner-line {
            position: absolute;
            left: 0;
            right: 0;
            top: 0;
            height: 2px;
            background: linear-gradient(
              90deg,
              transparent 0%,
              rgba(217, 119, 87, 0.3) 8%,
              rgba(217, 119, 87, 0.95) 30%,
              rgba(255, 228, 214, 1) 50%,
              rgba(217, 119, 87, 0.95) 70%,
              rgba(217, 119, 87, 0.3) 92%,
              transparent 100%
            );
            box-shadow:
              0 0 12px 2px rgba(217, 119, 87, 0.85),
              0 0 32px 8px rgba(217, 119, 87, 0.45),
              0 0 64px 16px rgba(217, 119, 87, 0.2);
            animation:
              hero-scan-sweep-v 4s cubic-bezier(0.4, 0, 0.2, 1) infinite,
              hero-scan-pulse 1.2s ease-in-out infinite;
          }
          .hero-scanner-glow {
            position: absolute;
            left: 0;
            right: 0;
            top: 0;
            height: 160px;
            transform: translateY(-100%);
            background: linear-gradient(
              180deg,
              transparent 0%,
              rgba(217, 119, 87, 0) 25%,
              rgba(217, 119, 87, 0.28) 50%,
              rgba(217, 119, 87, 0) 75%,
              transparent 100%
            );
            filter: blur(14px);
            animation: hero-scan-sweep-v 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .hero-scanner-line,
            .hero-scanner-glow {
              animation: none;
              opacity: 0;
            }
          }
        `}</style>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-6 py-10 md:px-10">

        {/* Search results */}
        {isSearching ? (
          <section>
            <p className="mb-4 text-sm text-muted-foreground">
              {filtered.length === 0
                ? noResults
                : t("resultsCount", { count: filtered.length })}
            </p>
            {filtered.length === 0 ? null : (
              <ul className="grid gap-3 md:grid-cols-2">
                {filtered.map((a) => (
                  <ArticleRow key={a.slug} article={a} locale={locale} />
                ))}
              </ul>
            )}
          </section>
        ) : (
          <div className="space-y-12">
            {/* Special feature cards */}
            <div className="grid gap-4 md:grid-cols-2">
              <Link
                href={`/${locale}/help/pipeline`}
                className="group relative overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-violet-500/5 p-6 shadow-sm transition-all hover:shadow-md hover:scale-[1.01]"
              >
                <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-violet-500/20">
                  <Workflow size={20} className="text-violet-400" />
                </div>
                <h3 className="text-base font-bold text-foreground">{t("indexFeatured.pipelineTitle")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("indexFeatured.pipelineDesc")}</p>
                <div className="mt-4 flex items-center gap-1 text-sm font-medium text-violet-500">
                  {t("indexFeatured.pipelineCta")} <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                </div>
                <div aria-hidden="true" className="pointer-events-none absolute -right-8 -bottom-8 size-32 rounded-full bg-violet-500/10 blur-2xl" />
              </Link>

              <Link
                href={`/${locale}/help/tech-stack`}
                className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-800/30 to-slate-900/10 p-6 shadow-sm transition-all hover:shadow-md hover:scale-[1.01]"
              >
                <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-white/5 border border-white/10">
                  <AnthropicMark size={22} className="text-[#D97757]" />
                </div>
                <h3 className="text-base font-bold text-foreground">{t("indexFeatured.techStackTitle")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("indexFeatured.techStackDesc")}</p>
                <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[#D97757]">
                  {t("indexFeatured.techStackCta")} <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                </div>
                <div aria-hidden="true" className="pointer-events-none absolute -right-8 -bottom-8 size-32 rounded-full bg-[#D97757]/10 blur-2xl" />
              </Link>
            </div>

            {categories.map((cat) => {
              const items = articles.filter((a) => a.category === cat.id);
              if (items.length === 0) return null;
              const cfg = CAT_CONFIG[cat.id];
              const Icon = cfg.icon;
              return (
                <section key={cat.id}>
                  {/* Category header */}
                  <div className="mb-5 flex items-center gap-3">
                    <div className={`flex size-9 items-center justify-center rounded-lg ${cfg.iconBg}`}>
                      <Icon size={17} className={cfg.iconColor} aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{cat.label}</h2>
                      <p className="text-xs text-muted-foreground">{t("indexCount", { count: items.length })}</p>
                    </div>
                  </div>

                  {/* Cards grid */}
                  <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {items.map((a) => (
                      <ArticleCard key={a.slug} article={a} locale={locale} cfg={cfg} cta={t("readArticle")} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Article Card (category index) ─────────────────────────────────────────────
function ArticleCard({
  article,
  locale,
  cfg,
  cta,
}: {
  article: ArticleSummary;
  locale: string;
  cfg: typeof CAT_CONFIG[HelpCategory];
  cta: string;
}) {
  return (
    <li>
      <Link
        href={`/${locale}/help/${article.slug}`}
        className={`group relative flex h-full flex-col overflow-hidden rounded-xl border bg-gradient-to-br p-5 shadow-sm transition-all hover:shadow-md ${cfg.gradient} ${cfg.border} hover:scale-[1.015]`}
      >
        <h3 className="text-sm font-semibold text-foreground leading-snug">{article.title}</h3>
        <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground line-clamp-3">
          {article.summary}
        </p>
        <div className={`mt-4 flex items-center gap-1 text-[11px] font-medium ${cfg.iconColor}`}>
          {cta}
          <ArrowRight
            size={11}
            className="transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
      </Link>
    </li>
  );
}

// ── Article Row (search results) ──────────────────────────────────────────────
function ArticleRow({ article, locale }: { article: ArticleSummary; locale: string }) {
  const cfg = CAT_CONFIG[article.category];
  const Icon = cfg.icon;
  return (
    <li>
      <Link
        href={`/${locale}/help/${article.slug}`}
        className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
      >
        <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${cfg.iconBg}`}>
          <Icon size={14} className={cfg.iconColor} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
            {article.title}
            <ArrowRight
              size={13}
              className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden="true"
            />
          </h3>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{article.summary}</p>
        </div>
      </Link>
    </li>
  );
}
