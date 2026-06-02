"use client";

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface ContactSettings {
  customer_match_field: "name" | "email" | "vat";
  customer_match_scope: "under_reseller" | "global";
  customer_is_company: boolean;
  create_if_not_found: boolean;
  sync_billing_address: boolean;
  sync_shipping_address: boolean;
  address_update_strategy: "always" | "create_only" | "skip";
  update_contact_info: boolean;
}

const DEFAULT_CONTACT: ContactSettings = {
  customer_match_field: "name",
  customer_match_scope: "under_reseller",
  customer_is_company: false,
  create_if_not_found: true,
  sync_billing_address: true,
  sync_shipping_address: true,
  address_update_strategy: "always",
  update_contact_info: true,
};

type OdooConnection = {
  base_url: string;
  database: string;
  username: string;
  export_mode: string;
  contact_settings: Record<string, unknown> | null;
  status: string;
  last_checked_at: string | null;
  last_error: string | null;
} | null;

interface OdooConnectionFormProps {
  connection: OdooConnection;
}

const inputCls =
  "h-8 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-[var(--color-fg)] text-sm transition-colors outline-none focus:border-[var(--color-border-hv)]";

export function OdooConnectionForm({ connection }: OdooConnectionFormProps) {
  const t = useTranslations("settings.odoo");
  const [baseUrl, setBaseUrl] = useState(connection?.base_url ?? "");
  const [database, setDatabase] = useState(connection?.database ?? "");
  const [username, setUsername] = useState(connection?.username ?? "");
  const [exportMode, setExportMode] = useState<"sales_order" | "quotation">(
    connection?.export_mode === "quotation" ? "quotation" : "sales_order",
  );
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"save" | "test" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contactSettings, setContactSettings] = useState<ContactSettings>({
    ...DEFAULT_CONTACT,
    ...((connection?.contact_settings as Partial<ContactSettings> | null) ?? {}),
  });

  function setContact<K extends keyof ContactSettings>(key: K, val: ContactSettings[K]) {
    setContactSettings((prev) => ({ ...prev, [key]: val }));
  }

  async function submit(testOnly: boolean) {
    setPending(testOnly ? "test" : "save");
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/settings/odoo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_url: baseUrl,
          database,
          username,
          api_key: password,
          export_mode: exportMode,
          contact_settings: contactSettings,
          test_only: testOnly,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        detail?: string;
        error?: string;
      };

      if (!response.ok) {
        const detail = body.detail ?? body.error ?? "";
        setError(`${testOnly ? t("testFailed") : t("saveFailed")}${detail ? ` — ${detail}` : ""}`);
        return;
      }

      setMessage(testOnly ? t("testSuccess") : t("saveSuccess"));
      if (!testOnly) {
        setPassword("");
      }
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
      <label className="grid gap-1.5">
        <span className="text-xs font-medium text-[var(--color-fg)]">{t("url")}</span>
        <input
          required
          type="url"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="https://odoo.example.com"
          className={inputCls}
        />
        <span className="text-xs text-[var(--color-fg-mute)]">{t("urlHint")}</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-[var(--color-fg)]">{t("database")}</span>
          <input
            required
            value={database}
            onChange={(event) => setDatabase(event.target.value)}
            className={inputCls}
          />
          <span className="text-xs text-[var(--color-fg-mute)]">{t("databaseHint")}</span>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-[var(--color-fg)]">{t("username")}</span>
          <input
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className={inputCls}
          />
          <span className="text-xs text-[var(--color-fg-mute)]">{t("usernameHint")}</span>
        </label>
      </div>

      <label className="grid gap-1.5">
        <span className="text-xs font-medium text-[var(--color-fg)]">{t("exportMode")}</span>
        <select
          value={exportMode}
          onChange={(event) =>
            setExportMode(event.target.value === "quotation" ? "quotation" : "sales_order")
          }
          className={inputCls}
        >
          <option value="sales_order">{t("exportModeOptions.sales_order")}</option>
          <option value="quotation">{t("exportModeOptions.quotation")}</option>
        </select>
        <span className="text-xs text-[var(--color-fg-mute)]">{t("exportModeHint")}</span>
      </label>

      {/* ── Contact Export Settings ─────────────────────────────────────── */}
      <details className="group rounded-[var(--radius-sm)] border border-[var(--color-border)]">
        <summary className="flex cursor-pointer items-center justify-between px-3 py-2.5 text-xs font-medium text-[var(--color-fg)] select-none">
          {t("contactSettings")}
          <span className="text-[11px] text-[var(--color-fg-mute)] group-open:hidden">
            {t("contactSettingsHint")}
          </span>
        </summary>
        <div className="grid gap-4 border-t border-[var(--color-border)] px-3 py-3">
          <p className="text-[11px] text-[var(--color-fg-mute)]">{t("contactSettingsHint")}</p>

          {/* Row 1 — Customer matching */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[var(--color-fg)]">
                {t("customerMatchField")}
              </span>
              <select
                value={contactSettings.customer_match_field}
                onChange={(e) =>
                  setContact(
                    "customer_match_field",
                    e.target.value as ContactSettings["customer_match_field"],
                  )
                }
                className={inputCls}
              >
                <option value="name">{t("customerMatchFieldOptions.name")}</option>
                <option value="email">{t("customerMatchFieldOptions.email")}</option>
                <option value="vat">{t("customerMatchFieldOptions.vat")}</option>
              </select>
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[var(--color-fg)]">
                {t("customerMatchScope")}
              </span>
              <select
                value={contactSettings.customer_match_scope}
                onChange={(e) =>
                  setContact(
                    "customer_match_scope",
                    e.target.value as ContactSettings["customer_match_scope"],
                  )
                }
                className={inputCls}
              >
                <option value="under_reseller">
                  {t("customerMatchScopeOptions.under_reseller")}
                </option>
                <option value="global">{t("customerMatchScopeOptions.global")}</option>
              </select>
            </label>
          </div>

          {/* Row 2 — Customer creation */}
          <div className="grid gap-2">
            <label className="flex items-center gap-2 text-xs text-[var(--color-fg)]">
              <input
                type="checkbox"
                checked={contactSettings.customer_is_company}
                onChange={(e) => setContact("customer_is_company", e.target.checked)}
                className="h-4 w-4 rounded accent-[var(--color-fg)]"
              />
              {t("customerIsCompany")}
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--color-fg)]">
              <input
                type="checkbox"
                checked={contactSettings.create_if_not_found}
                onChange={(e) => setContact("create_if_not_found", e.target.checked)}
                className="h-4 w-4 rounded accent-[var(--color-fg)]"
              />
              {t("createIfNotFound")}
            </label>
          </div>

          {/* Row 3 — Address sync */}
          <div className="grid gap-2">
            <label className="flex items-center gap-2 text-xs text-[var(--color-fg)]">
              <input
                type="checkbox"
                checked={contactSettings.sync_billing_address}
                onChange={(e) => setContact("sync_billing_address", e.target.checked)}
                className="h-4 w-4 rounded accent-[var(--color-fg)]"
              />
              {t("syncBillingAddress")}
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--color-fg)]">
              <input
                type="checkbox"
                checked={contactSettings.sync_shipping_address}
                onChange={(e) => setContact("sync_shipping_address", e.target.checked)}
                className="h-4 w-4 rounded accent-[var(--color-fg)]"
              />
              {t("syncShippingAddress")}
            </label>
            <label className="grid gap-1.5 pt-1">
              <span className="text-xs font-medium text-[var(--color-fg)]">
                {t("addressUpdateStrategy")}
              </span>
              <select
                value={contactSettings.address_update_strategy}
                onChange={(e) =>
                  setContact(
                    "address_update_strategy",
                    e.target.value as ContactSettings["address_update_strategy"],
                  )
                }
                className={inputCls}
              >
                <option value="always">{t("addressUpdateStrategyOptions.always")}</option>
                <option value="create_only">{t("addressUpdateStrategyOptions.create_only")}</option>
                <option value="skip">{t("addressUpdateStrategyOptions.skip")}</option>
              </select>
            </label>
          </div>

          {/* Row 4 — Contact updates */}
          <label className="flex items-center gap-2 text-xs text-[var(--color-fg)]">
            <input
              type="checkbox"
              checked={contactSettings.update_contact_info}
              onChange={(e) => setContact("update_contact_info", e.target.checked)}
              className="h-4 w-4 rounded accent-[var(--color-fg)]"
            />
            {t("updateContactInfo")}
          </label>
        </div>
      </details>

      <label className="grid gap-1.5">
        <span className="text-xs font-medium text-[var(--color-fg)]">{t("password")}</span>
        <input
          required
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t("passwordPlaceholder")}
          className={inputCls}
        />
        <span className="text-xs text-[var(--color-fg-mute)]">{t("passwordHint")}</span>
      </label>

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
