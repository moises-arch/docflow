"use client";

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

type MonitoringConnection = {
  provider: string;
  status: string;
  account_email: string | null;
  last_checked_at: string | null;
  last_error: string | null;
} | null;

interface MonitoringConnectionFormProps {
  connection: MonitoringConnection;
}

export function MonitoringConnectionForm({ connection }: MonitoringConnectionFormProps) {
  const t = useTranslations("settings.monitoring");

  const [apiKey, setApiKey] = useState("");
  const [pending, setPending] = useState<"save" | "test" | "disconnect" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(connection?.account_email ?? null);
  const [isConnected, setIsConnected] = useState<boolean>(connection?.status === "active");

  const statusLabel = useMemo(() => {
    const status = (isConnected ? "active" : connection?.status ?? "unverified").toLowerCase();
    switch (status) {
      case "active":
        return t("statusValues.active");
      case "error":
        return t("statusValues.error");
      default:
        return t("statusValues.unverified");
    }
  }, [connection?.status, isConnected, t]);

  async function submit(testOnly: boolean) {
    setPending(testOnly ? "test" : "save");
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/settings/monitoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, test_only: testOnly }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        detail?: string;
        error?: string;
        account_email?: string | null;
      };
      if (!response.ok) {
        const detail = body.detail ?? body.error ?? "";
        setError(`${testOnly ? t("testFailed") : t("saveFailed")}${detail ? ` — ${detail}` : ""}`);
        return;
      }

      setMessage(testOnly ? t("testSuccess") : t("saveSuccess"));
      if (typeof body.account_email !== "undefined") setAccountEmail(body.account_email);
      if (!testOnly) {
        setApiKey("");
        setIsConnected(true);
      }
    } catch {
      setError(testOnly ? t("testFailed") : t("saveFailed"));
    } finally {
      setPending(null);
    }
  }

  async function disconnect() {
    if (!confirm(t("disconnectConfirm"))) return;
    setPending("disconnect");
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/settings/monitoring", { method: "DELETE" });
      const body = (await response.json().catch(() => ({}))) as { detail?: string; error?: string };
      if (!response.ok) {
        const detail = body.detail ?? body.error ?? "";
        setError(`${t("disconnectFailed")}${detail ? ` — ${detail}` : ""}`);
        return;
      }

      setMessage(t("disconnectSuccess"));
      setIsConnected(false);
      setAccountEmail(null);
    } catch {
      setError(t("disconnectFailed"));
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
        <span className="text-xs font-medium text-[var(--color-fg)]">{t("provider")}</span>
        <input
          readOnly
          value="UptimeRobot"
          className="h-8 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-fg)]"
        />
      </div>

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
          {t("accountEmail")}: {accountEmail ?? "—"}
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

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="default" disabled={pending !== null}>
          {pending === "save" && <Loader2 className="size-4 animate-spin" />}
          {t("save")}
        </Button>
        <Button type="button" onClick={() => void submit(true)} disabled={pending !== null}>
          {pending === "test" && <Loader2 className="size-4 animate-spin" />}
          {t("test")}
        </Button>
        {isConnected && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => void disconnect()}
            disabled={pending !== null}
          >
            {pending === "disconnect" && <Loader2 className="size-4 animate-spin" />}
            {t("disconnect")}
          </Button>
        )}
      </div>
    </form>
  );
}
