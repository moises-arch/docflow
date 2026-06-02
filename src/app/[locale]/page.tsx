import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

export default async function LocaleHomePage() {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect(`/${locale}/inbox`);
  }

  redirect(`/${locale}/sign-in`);
}
