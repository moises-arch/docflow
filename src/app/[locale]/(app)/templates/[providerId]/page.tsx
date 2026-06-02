import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export default async function ProviderIndexPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  const locale = await getLocale();
  redirect(`/${locale}/templates/${providerId}/configuration`);
}
