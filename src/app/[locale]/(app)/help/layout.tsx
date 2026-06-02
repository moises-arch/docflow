import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HelpLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Shell now lives in parent layout. Help just adds bottom padding.
  return <div className="pb-16">{children}</div>;
}
