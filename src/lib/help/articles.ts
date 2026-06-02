/**
 * Help center article catalog. Single source of truth for routing, sidebar,
 * search index, and contextual <HelpLink slug=""> targets.
 *
 * Bodies live in src/messages/{en,es}.json under help.articles.<slug>.body
 * (Markdown). Editors can update content there without touching code.
 */

export type HelpCategory =
  | "quickStart"
  | "setup"
  | "concepts"
  | "workflow"
  | "troubleshooting";

export interface HelpArticle {
  slug: string;
  category: HelpCategory;
  /** Related slugs to render in the article footer */
  related: string[];
}

export const HELP_ARTICLES: HelpArticle[] = [
  // Quick Start
  {
    slug: "getting-started",
    category: "quickStart",
    related: ["anthropic-key", "odoo-setup", "upload-review-approve-sync"],
  },
  {
    slug: "pipeline",
    category: "workflow",
    related: ["tech-stack", "glossary", "auto-sync"],
  },
  {
    slug: "tech-stack",
    category: "concepts",
    related: ["pipeline", "anthropic-key", "odoo-setup"],
  },
  {
    slug: "dashboard-tour",
    category: "quickStart",
    related: ["getting-started", "glossary"],
  },

  // Setup
  {
    slug: "anthropic-key",
    category: "setup",
    related: ["getting-started", "failed-extraction"],
  },
  {
    slug: "odoo-setup",
    category: "setup",
    related: ["getting-started", "retry-sync"],
  },
  {
    slug: "email-ingest",
    category: "setup",
    related: ["browser-scrape", "upload-review-approve-sync"],
  },
  {
    slug: "browser-scrape",
    category: "setup",
    related: ["email-ingest", "provider-templates", "cleo-webedi"],
  },
  {
    slug: "cleo-webedi",
    category: "setup",
    related: ["email-ingest", "browser-scrape"],
  },
  {
    slug: "provider-templates",
    category: "setup",
    related: ["glossary", "upload-review-approve-sync"],
  },

  // Concepts
  {
    slug: "glossary",
    category: "concepts",
    related: ["provider-templates", "auto-sync"],
  },

  // Workflow
  {
    slug: "upload-review-approve-sync",
    category: "workflow",
    related: ["auto-sync", "retry-sync"],
  },
  {
    slug: "auto-sync",
    category: "workflow",
    related: ["upload-review-approve-sync", "failed-extraction"],
  },

  // Troubleshooting
  {
    slug: "failed-extraction",
    category: "troubleshooting",
    related: ["anthropic-key", "provider-templates"],
  },
  {
    slug: "retry-sync",
    category: "troubleshooting",
    related: ["odoo-setup", "auto-sync"],
  },
];

export const HELP_CATEGORIES: HelpCategory[] = [
  "quickStart",
  "setup",
  "concepts",
  "workflow",
  "troubleshooting",
];

export function getArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}

export function articlesByCategory(category: HelpCategory): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.category === category);
}
