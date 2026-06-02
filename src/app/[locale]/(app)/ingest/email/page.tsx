import { redirect } from "next/navigation";

export default async function EmailIngestPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/ingest/email/microsoft-365`);
}
