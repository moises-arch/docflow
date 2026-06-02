import { redirect } from "next/navigation";

export default async function LegacyPortalIngestPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/ingest/portals`);
}
