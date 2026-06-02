import { getTranslations } from "next-intl/server";
import { HelpIndexClient } from "./help-index-client";
import { HELP_CATEGORIES, HELP_ARTICLES } from "@/lib/help/articles";

export const dynamic = "force-dynamic";

export default async function HelpIndexPage() {
  const t = await getTranslations("help");

  // Build the static, server-rendered article list once. The client component
  // only filters by title/summary in-memory.
  const articles = HELP_ARTICLES.map((a) => ({
    slug: a.slug,
    category: a.category,
    title: t(`articles.${a.slug}.title`),
    summary: t(`articles.${a.slug}.summary`),
  }));

  const categories = HELP_CATEGORIES.map((c) => ({
    id: c,
    label: t(`categories.${c}`),
  }));

  return (
    <HelpIndexClient
      articles={articles}
      categories={categories}
      title={t("nav.title")}
      subtitle={t("nav.subtitle")}
      searchPlaceholder={t("search.placeholder")}
      noResults={t("search.noResults")}
    />
  );
}
