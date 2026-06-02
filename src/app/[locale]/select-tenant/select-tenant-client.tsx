"use client";

import { Button } from "@/components/ui/button";
import { Loader2, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

export function SelectTenantClient() {
  const t = useTranslations("selectTenant");
  const locale = useLocale();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign(`/${locale}/sign-in`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-fg)]">
            <Zap className="size-5 text-[var(--color-bg)]" aria-hidden="true" />
          </div>
          <p className="text-base font-semibold text-[var(--color-fg)]">DocFlow</p>
        </div>

        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h1 className="text-sm font-semibold text-[var(--color-fg)]">{t("heading")}</h1>
          <p className="mt-1 text-xs text-[var(--color-fg-mute)]">{t("message")}</p>

          <Button
            type="button"
            variant="secondary"
            size="default"
            disabled={loading}
            onClick={handleSignOut}
            className="mt-5 h-9 w-full"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? t("signingOut") : t("signOut")}
          </Button>
        </section>
      </div>
    </main>
  );
}
