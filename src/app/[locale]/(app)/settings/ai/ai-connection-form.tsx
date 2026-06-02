"use client";

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

type AiProvider = "anthropic";

type AiConnection = {
  provider: AiProvider;
  primary_model: string;
  status: string;
  last_checked_at: string | null;
  last_error: string | null;
} | null;

interface AiConnectionFormProps {
  connection: AiConnection;
}

const FIXED_PROVIDER: AiProvider = "anthropic";
const FIXED_MODEL = "claude-sonnet-4-6";
const CONFIGURABLE_MODELS = [FIXED_MODEL];

export function AiConnectionForm({ connection }: AiConnectionFormProps) {
  const t = useTranslations("settings.ai");

  const [provider] = useState<AiProvider>(FIXED_PROVIDER);
  const [primaryModel] = useState(FIXED_MODEL);
  const [apiKey, setApiKey] = useState("");
  const [pending, setPending] = useState<"save" | "test" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const providerModels = useMemo(() => CONFIGURABLE_MODELS, []);
  const statusLabel = useMemo(() => {
    const status = (connection?.status ?? "unverified").toLowerCase();
    switch (status) {
      case "active":
        return t("statusValues.active");
      case "error":
        return t("statusValues.error");
      default:
        return t("statusValues.unverified");
    }
  }, [connection?.status, t]);

  async function submit(testOnly: boolean) {
    setPending(testOnly ? "test" : "save");
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/settings/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          primary_model: primaryModel,
          api_key: apiKey,
          test_only: testOnly,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as { detail?: string; error?: string };
      if (!response.ok) {
        const detail = body.detail ?? body.error ?? "";
        setError(`${testOnly ? t("testFailed") : t("saveFailed")}${detail ? ` — ${detail}` : ""}`);
        return;
      }

      setMessage(testOnly ? t("testSuccess") : t("saveSuccess"));
      if (!testOnly) setApiKey("");
    } catch {
      setError(testOnly ? t("testFailed") : t("saveFailed"));
    } finally {
      setPending(null);
    }
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(false);
      }}
    >
      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-[var(--color-fg)]">
          {t("configurableModels")}
        </span>
        <p className="text-xs text-[var(--color-fg-mute)]">{CONFIGURABLE_MODELS.join(" · ")}</p>
      </div>

      <label className="grid gap-1.5">
        <span className="text-xs font-medium text-[var(--color-fg)]">{t("provider")}</span>
        <input
          readOnly
          value="Anthropic (Claude)"
          className="h-8 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-fg)]"
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-xs font-medium text-[var(--color-fg)]">{t("primaryModel")}</span>
        <select
          value={primaryModel}
          disabled
          className="h-8 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-fg)]"
        >
          {providerModels.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1.5">
        <span className="text-xs font-medium text-[var(--color-fg)]">{t("apiKey")}</span>
        <input
          required
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={t("apiKeyPlaceholder")}
          className="h-8 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-fg)]"
        />
        <span className="text-xs text-[var(--color-fg-mute)]">{t("apiKeyHint")}</span>
      </label>

      <div className="grid gap-1 text-xs text-[var(--color-fg-mute)]">
        <p>
          {t("status")}: {statusLabel}
        </p>
        <p>
          {t("lastChecked")}: {connection?.last_checked_at ?? t("neverChecked")}
        </p>
        <p>
          {t("lastError")}: {connection?.last_error ?? "—"}
        </p>
      </div>

      {message && <p className="text-sm text-[color:var(--color-teal)]">{message}</p>}
      {error && <p className="text-sm text-[color:var(--color-rose)]">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="default" disabled={pending === "save"}>
          {pending === "save" && <Loader2 className="size-4 animate-spin" />}
          {t("save")}
        </Button>
        <Button type="button" onClick={() => void submit(true)} disabled={pending === "test"}>
          {pending === "test" && <Loader2 className="size-4 animate-spin" />}
          {t("test")}
        </Button>
      </div>
    </form>
  );
}
