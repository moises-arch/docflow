import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export default async function SettingsIndexPage() {
  const locale = await getLocale();
  redirect(`/${locale}/settings/general`);
}
