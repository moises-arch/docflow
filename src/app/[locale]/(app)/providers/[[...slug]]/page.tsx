import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ locale: string; slug?: string[] }>;
}

/** Permanent redirect: /providers/[...] → /templates/[...] */
export default async function ProvidersRedirect({ params }: Props) {
  const { locale, slug } = await params;
  const rest = slug && slug.length > 0 ? `/${slug.join("/")}` : "";
  redirect(`/${locale}/templates${rest}`);
}
