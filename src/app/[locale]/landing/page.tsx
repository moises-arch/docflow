import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export default async function LandingPage() {
  const locale = await getLocale();
  redirect(`/${locale}/sign-in`);
}
