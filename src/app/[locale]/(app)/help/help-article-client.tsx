"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ArrowRight, BookOpen, Lightbulb, CheckCircle2, Link2 } from "lucide-react";
import type { HelpCategory } from "@/lib/help/articles";
import type { Components } from "react-markdown";

interface RelatedArticle {
  slug: string;
  title: string;
}

interface Props {
  locale: string;
  title: string;
  summary: string;
  body: string;
  category: HelpCategory;
  related: RelatedArticle[];
  backLabel: string;
  relatedLabel: string;
  tocTitle: string;
}

// --- Table of contents extraction ---
interface TocEntry { id: string; text: string; level: 2 | 3 }

function slugify(text: string) {
  return text.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}

function extractToc(markdown: string): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const line of markdown.split("\n")) {
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    if (h2) entries.push({ id: slugify(h2[1]), text: h2[1], level: 2 });
    else if (h3) entries.push({ id: slugify(h3[1]), text: h3[1], level: 3 });
  }
  return entries;
}

// --- Custom callout detector ---
// Lines starting with "> [!NOTE]", "> [!TIP]", "> [!WARNING]" are rendered as callouts.

const CAT_COLORS: Record<HelpCategory, string> = {
  quickStart: "text-amber-600 dark:text-amber-400",
  setup: "text-blue-600 dark:text-blue-400",
  concepts: "text-violet-600 dark:text-violet-400",
  workflow: "text-emerald-600 dark:text-emerald-400",
  troubleshooting: "text-rose-600 dark:text-rose-400",
};

// --- Markdown components ---
function buildComponents(_locale: string): Components {
  let stepCounter = 0;
  // Reset on each render cycle via a closure
  return {
    // Headings with anchors
    h2({ children }) {
      const text = String(children);
      const id = slugify(text);
      return (
        <h2
          id={id}
          className="group mt-10 mb-4 flex scroll-mt-24 items-center gap-2 border-b border-border/60 pb-2 text-lg font-bold text-foreground first:mt-0"
        >
          <a href={`#${id}`} className="opacity-0 transition-opacity group-hover:opacity-50" aria-hidden="true">
            <Link2 size={14} />
          </a>
          {children}
        </h2>
      );
    },
    h3({ children }) {
      const text = String(children);
      const id = slugify(text);
      return (
        <h3
          id={id}
          className="group mt-7 mb-3 flex scroll-mt-24 items-center gap-2 text-base font-semibold text-foreground"
        >
          <a href={`#${id}`} className="opacity-0 transition-opacity group-hover:opacity-50" aria-hidden="true">
            <Link2 size={12} />
          </a>
          {children}
        </h3>
      );
    },

    // Paragraphs
    p({ children }) {
      return <p className="mb-4 text-sm leading-7 text-foreground/85">{children}</p>;
    },

    // Links
    a({ href, children }) {
      const isExternal = href?.startsWith("http");
      return (
        <a
          href={href}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
          className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary transition-colors"
        >
          {children}
        </a>
      );
    },

    // Unordered list
    ul({ children }) {
      return <ul className="mb-4 space-y-1.5 pl-0">{children}</ul>;
    },

    // Ordered list — renders as numbered steps
    ol({ children }) {
      stepCounter = 0;
      return <ol className="mb-4 space-y-3 pl-0">{children}</ol>;
    },

    // List item
    li({ children, ...rest }) {
      void rest;
      // Detect ordered parent by checking the DOM node's parent tag
      const isOrdered = (rest as { node?: { parent?: { tagName?: string } } }).node?.parent?.tagName === "ol";
      if (isOrdered) {
        stepCounter += 1;
        const n = stepCounter;
        return (
          <li className="flex items-start gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              {n}
            </span>
            <span className="text-sm leading-6 text-foreground/85 flex-1">{children}</span>
          </li>
        );
      }
      return (
        <li className="flex items-start gap-2.5 text-sm leading-6 text-foreground/85">
          <CheckCircle2 size={14} className="mt-1 shrink-0 text-primary/60" aria-hidden="true" />
          <span className="flex-1">{children}</span>
        </li>
      );
    },

    // Inline code
    code({ children, className }) {
      const isBlock = className?.includes("language-");
      if (isBlock) {
        const lang = className?.replace("language-", "") ?? "";
        return (
          <div className="my-4 overflow-hidden rounded-xl border border-border shadow-sm">
            {lang && (
              <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-4 py-2">
                <div className="flex gap-1.5">
                  <div className="size-2.5 rounded-full bg-rose-400/70" />
                  <div className="size-2.5 rounded-full bg-amber-400/70" />
                  <div className="size-2.5 rounded-full bg-emerald-400/70" />
                </div>
                <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{lang}</span>
              </div>
            )}
            <pre className="overflow-x-auto bg-slate-950 p-4">
              <code className="text-[12.5px] leading-relaxed text-slate-200">{children}</code>
            </pre>
          </div>
        );
      }
      return (
        <code className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[12px] text-foreground">
          {children}
        </code>
      );
    },

    // Pre (wraps block code — delegate to code component above)
    pre({ children }) {
      return <>{children}</>;
    },

    // Blockquote → callout box
    blockquote({ children }) {
      return (
        <div className="my-5 flex gap-3 rounded-xl border border-amber-200/60 bg-amber-50 px-4 py-4 dark:border-amber-800/40 dark:bg-amber-950/20">
          <Lightbulb size={16} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
          <div className="text-sm leading-relaxed text-amber-900 dark:text-amber-200 [&_p]:mb-0">
            {children}
          </div>
        </div>
      );
    },

    // Table
    table({ children }) {
      return (
        <div className="my-5 overflow-hidden rounded-xl border border-border shadow-sm">
          <table className="w-full border-collapse text-sm">{children}</table>
        </div>
      );
    },
    thead({ children }) {
      return <thead className="bg-muted/60">{children}</thead>;
    },
    th({ children }) {
      return <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</th>;
    },
    td({ children }) {
      return <td className="border-t border-border px-4 py-2.5 text-sm text-foreground/85">{children}</td>;
    },

    // Horizontal rule
    hr() {
      return <hr className="my-8 border-border" />;
    },

    // Strong / em
    strong({ children }) {
      return <strong className="font-semibold text-foreground">{children}</strong>;
    },
  };
}

// ── Table of Contents ─────────────────────────────────────────────────────────
function TableOfContents({ toc, title }: { toc: TocEntry[]; title: string }) {
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-20px 0px -60% 0px" },
    );
    document.querySelectorAll("[id]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [toc]);

  if (toc.length < 2) return null;

  return (
    <nav aria-label="Table of contents" className="sticky top-20 w-56 shrink-0">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-0.5">
        {toc.map((entry) => (
          <li key={entry.id} style={{ paddingLeft: entry.level === 3 ? "12px" : "0" }}>
            <a
              href={`#${entry.id}`}
              className={`block rounded-md px-2 py-1.5 text-xs transition-all ${
                active === entry.id
                  ? "bg-primary/8 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function HelpArticleClient({
  locale,
  title,
  summary,
  body,
  category,
  related,
  backLabel,
  relatedLabel,
  tocTitle,
}: Props) {
  const toc = extractToc(body);
  const catColor = CAT_COLORS[category];
  const components = buildComponents(locale);

  return (
    <div className="h-full overflow-y-auto">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
          <Link
            href={`/${locale}/help`}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={12} aria-hidden="true" />
            {backLabel}
          </Link>
          <span className="text-border">·</span>
          <span className={`text-xs font-medium ${catColor}`}>
            <BookOpen size={10} className="mr-1 inline" aria-hidden="true" />
            {category}
          </span>
        </div>
      </div>

      {/* Content area */}
      <div className="mx-auto flex max-w-6xl gap-12 px-6 py-10 md:px-10">

        {/* ── Main column ── */}
        <article className="min-w-0 flex-1">
          {/* Article header */}
          <header className="mb-10">
            <h1 className="mb-3 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              {title}
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">{summary}</p>

            {/* Decorative divider */}
            <div className="mt-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
              <div className="size-1.5 rounded-full bg-primary/40" />
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            </div>
          </header>

          {/* Article body */}
          <div className="article-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {body}
            </ReactMarkdown>
          </div>

          {/* Related articles footer */}
          {related.length > 0 && (
            <footer className="mt-16">
              <div className="mb-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {relatedLabel}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link
                      href={`/${locale}/help/${r.slug}`}
                      className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                    >
                      <span className="text-sm font-medium text-foreground">{r.title}</span>
                      <ArrowRight
                        size={14}
                        className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </footer>
          )}
        </article>

        {/* ── TOC sidebar ── */}
        <TableOfContents toc={toc} title={tocTitle} />
      </div>
    </div>
  );
}
