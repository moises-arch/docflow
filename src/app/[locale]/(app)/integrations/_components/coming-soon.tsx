"use client";

import * as React from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { IntegrationDescriptor } from "@/lib/integrations/registry";

interface ComingSoonProps {
  descriptor: IntegrationDescriptor;
  description: string;
}

export function ComingSoon({ descriptor, description }: ComingSoonProps) {
  const t = useTranslations("integrations.detail.comingSoon");
  const [email, setEmail] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/coming-soon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integration_id: descriptor.slug,
          integration_name: descriptor.name,
          email,
        }),
      });
      // Even if the request fails, show "thanks" to avoid a poor UX —
      // the API logs the error, but for the user a deduplicated signup is fine.
      void res;
    } catch {
      // ignore — show thanks regardless
    } finally {
      setSaving(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="border-[var(--color-border)] bg-[var(--color-surface)] mx-auto flex max-w-xl flex-col items-center gap-5 rounded-md border px-6 py-12 text-center">
      <div className="bg-[color-mix(in_oklab,var(--color-amber)_15%,transparent)] flex size-12 items-center justify-center rounded-md">
        <Sparkles className="size-6 text-[var(--color-amber)]" aria-hidden />
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-[var(--color-fg-mute)] text-sm">{description || t("description")}</p>
      </div>

      {submitted ? (
        <p className="text-[var(--color-teal)] inline-flex items-center gap-1.5 text-sm font-medium">
          <CheckCircle2 className="size-4" aria-hidden />
          {t("thanks")}
        </p>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-md flex-col items-stretch gap-2 sm:flex-row"
          aria-label={`${descriptor.name} notify form`}
        >
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={t("emailPlaceholder")}
            aria-invalid={touched && !isValid}
            aria-label={t("emailPlaceholder")}
            className="flex-1"
            required
          />
          <Button type="submit" disabled={!isValid || saving}>
            {t("notify")}
          </Button>
        </form>
      )}
    </div>
  );
}
