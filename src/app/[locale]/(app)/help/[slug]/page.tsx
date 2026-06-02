import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getArticle } from "@/lib/help/articles";
import { HelpArticleClient } from "../help-article-client";

export const dynamic = "force-dynamic";

interface Params {
  locale: string;
  slug: string;
}

export default async function HelpArticlePage({ params }: { params: Promise<Params> }) {
  const { locale, slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const t = await getTranslations("help");

  const related = article.related.map((relSlug) => ({
    slug: relSlug,
    title: t(`articles.${relSlug}.title`),
  }));

  return (
    <HelpArticleClient
      locale={locale}
      title={t(`articles.${slug}.title`)}
      summary={t(`articles.${slug}.summary`)}
      body={t(`articles.${slug}.body`)}
      category={article.category}
      related={related}
      backLabel={t("nav.backToIndex")}
      relatedLabel={t("nav.relatedArticles")}
      tocTitle={t("tocTitle")}
    />
  );
}
