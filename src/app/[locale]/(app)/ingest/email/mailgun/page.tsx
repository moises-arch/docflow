import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export default async function MailgunEmailIngestPage() {
  const locale = await getLocale();
  redirect(`/${locale}/ingest/email/microsoft-365`);
}
