import { Activity } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireSettingsAccess } from "../../_lib";
import { SectionCard } from "../../section-card";
import { SettingsPage } from "../../settings-page";
import { MonitoringConnectionForm } from "./monitoring-form";

export default async function AdminMonitoringPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const t = await getTranslations("settings.monitoring");

  const db = supabase as unknown as {
    from: (table: string) => {
      select: (columns?: string) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
        };
      };
    };
  };

  const { data: connection } = await db
    .from("monitoring_connections")
    .select("provider, status, account_email, last_checked_at, last_error")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return (
    <SettingsPage>
      <div className="grid gap-5">
        <SectionCard title={t("title")} description={t("description")} icon={Activity}>
          <MonitoringConnectionForm
            connection={
              connection
                ? {
                    provider: String(connection.provider ?? "uptimerobot"),
                    status: String(connection.status ?? "unverified"),
                    account_email:
                      typeof connection.account_email === "string"
                        ? connection.account_email
                        : null,
                    last_checked_at:
                      typeof connection.last_checked_at === "string"
                        ? connection.last_checked_at
                        : null,
                    last_error:
                      typeof connection.last_error === "string" ? connection.last_error : null,
                  }
                : null
            }
          />
        </SectionCard>
      </div>
    </SettingsPage>
  );
}
