import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export default async function AiRedirect() {
  const locale = await getLocale();
  redirect(`/${locale}/settings/admin/ai`);
}
