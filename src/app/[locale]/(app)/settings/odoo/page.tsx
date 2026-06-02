import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export default async function SettingsOdooRedirectPage() {
  const locale = await getLocale();
  redirect(`/${locale}/integrations/odoo`);
}
