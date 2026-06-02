import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export default async function TeamRedirect() {
  const locale = await getLocale();
  redirect(`/${locale}/settings/admin/team`);
}
