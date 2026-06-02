"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";

interface AvatarUploadProps {
  userId: string;
  currentUrl?: string | null;
  initials: string;
}

export function AvatarUpload({ currentUrl, initials }: AvatarUploadProps) {
  const router = useRouter();
  const t = useTranslations("settings.general.avatar");
  const [url, setUrl] = useState(currentUrl ?? null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/settings/profile/avatar", { method: "POST", body: form });
      const data = (await res.json()) as { avatarUrl?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? t("errorUpload"));
      setUrl(data.avatarUrl ?? null);
      toast.success(t("success"));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="group relative size-20 shrink-0 overflow-hidden rounded-full border-2 border-[var(--color-border)] bg-[var(--color-surface)] transition-all hover:border-[var(--color-fg-mute)]"
      >
        {url ? (
          <Image src={url} alt="Avatar" fill className="object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-xl font-semibold text-[var(--color-fg-mute)]">
            {initials}
          </span>
        )}
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          {loading
            ? <Loader2 size={18} className="animate-spin text-white" />
            : <Camera size={18} className="text-white" />
          }
        </div>
      </button>

      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs font-medium text-[var(--color-fg-mute)] transition-colors hover:text-[var(--color-fg)] disabled:opacity-50"
        >
          {loading ? t("uploading") : t("change")}
        </button>
        <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">{t("hint")}</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
      />
    </div>
  );
}
