"use client";

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

export function TeamInviteForm() {
  const t = useTranslations("settings.team.invites");
  const tRoles = useTranslations("settings.team.roles");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "owner">("member");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/settings/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          toast.error(t("userNotFound"));
        } else {
          toast.error(t("failed"));
        }
        return;
      }

      setEmail("");
      setRole("member");
      toast.success(t("success"));
      router.refresh();
    } catch {
      toast.error(t("failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-mute)] p-3"
    >
      <p className="text-sm font-medium text-[var(--color-fg)]">{t("title")}</p>
      <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">{t("description")}</p>

      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]">
        <label className="grid gap-1">
          <span className="text-xs text-[var(--color-fg-mute)]">{t("email")}</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitting}
            className="h-8 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-fg)] transition-colors duration-[120ms] outline-none focus:border-[var(--color-fg)]"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-[var(--color-fg-mute)]">{t("role")}</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as "member" | "owner")}
            disabled={submitting}
            className="h-8 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-fg)] transition-colors duration-[120ms] outline-none focus:border-[var(--color-fg)]"
          >
            <option value="member">{tRoles("member")}</option>
            <option value="owner">{tRoles("owner")}</option>
          </select>
        </label>

        <div className="flex items-end">
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {t("submit")}
          </Button>
        </div>
      </div>
    </form>
  );
}
