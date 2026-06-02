"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Item, ItemContent, ItemTitle, ItemDescription } from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function ProfileStatusToggle({
  profileId,
  initialActive,
  isSystem,
}: {
  profileId: string;
  initialActive: boolean;
  isSystem: boolean;
}) {
  const t = useTranslations("templates.profileStudio.configuration.statusToggle");
  const [isActive, setIsActive] = useState(initialActive);
  const [saving, setSaving] = useState(false);

  async function toggle(checked: boolean) {
    if (isSystem && !checked) {
      toast.error(t("systemLockedToast"));
      return;
    }
    setSaving(true);
    const prev = isActive;
    setIsActive(checked);
    try {
      const res = await fetch(`/api/integrations/review-profiles/${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: checked }),
      });
      if (!res.ok) throw new Error();
      toast.success(checked ? t("activatedToast") : t("pausedToast"));
    } catch {
      setIsActive(prev);
      toast.error(t("errorToast"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Item variant="outline" className="w-auto gap-4 px-4 py-3">
      <ItemContent>
        <ItemTitle className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex size-2 rounded-full",
              isActive
                ? "bg-[color:var(--color-teal)]"
                : "bg-[color:var(--color-amber)]",
            )}
          />
          {isActive ? t("active") : t("paused")}
        </ItemTitle>
        <ItemDescription>
          {isActive ? t("activeDescription") : t("pausedDescription")}
        </ItemDescription>
      </ItemContent>
      <Switch
        checked={isActive}
        disabled={saving || isSystem}
        onCheckedChange={(checked) => void toggle(checked)}
        aria-label={t("ariaLabel")}
      />
    </Item>
  );
}
