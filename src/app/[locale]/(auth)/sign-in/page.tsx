import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { SignInClient } from "./sign-in-client";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const supabase = await createClient();
  const locale = await getLocale();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(`/${locale}/inbox`);
  }

  return <SignInClient />;
}
