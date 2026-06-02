import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export default async function SettingsMappingsRedirectPage() {
  const locale = await getLocale();
  redirect(`/${locale}/providers`);
}
