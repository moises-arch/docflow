import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/app/empty-state";
import { ScanEye } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReviewIndexPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const t = await getTranslations("review");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/sign-in`);

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) redirect(`/${locale}/inbox`);

  // Redirect to the first document that needs review
  const { data: next } = await supabase
    .from("documents")
    .select("id")
    .eq("tenant_id", membership.tenant_id)
    .eq("state", "needs_review")
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (next) {
    redirect(`/${locale}/review/${next.id}`);
  }

  // No documents need review — show empty state
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState icon={ScanEye} title={t("emptyTitle")} subtitle={t("emptySubtitle")} />
    </div>
  );
}
