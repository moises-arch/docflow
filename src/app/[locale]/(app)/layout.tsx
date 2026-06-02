import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Shell } from "@/components/app/shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const locale = await getLocale();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/sign-in`);
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    redirect(`/${locale}/select-tenant`);
  }

  const userData = {
    id: user.id,
    email: user.email ?? "",
    name: (user.user_metadata?.full_name as string | undefined) ?? undefined,
  };

  return <Shell user={userData}>{children}</Shell>;
}
