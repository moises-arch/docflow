// Tenant-level Walmart configuration. Stored in walmart_tenant_settings.

import { createServiceClient } from "@/lib/supabase/service";
import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";

export type WalmartSettings = {
  ai_fallback_enabled: boolean;
  auto_acknowledge: boolean;
  webhook_subscription_id: string | null;
};

const DEFAULTS: WalmartSettings = {
  ai_fallback_enabled: false,
  auto_acknowledge: true,
  webhook_subscription_id: null,
};

type SettingsRow = {
  ai_fallback_enabled: boolean;
  auto_acknowledge: boolean;
  webhook_subscription_id: string | null;
};

export async function getWalmartSettings(tenantId: string): Promise<WalmartSettings> {
  const db = createServiceClient() as unknown as DynamicSupabaseClient;
  const { data } = await db
    .from<SettingsRow>("walmart_tenant_settings")
    .select("ai_fallback_enabled, auto_acknowledge, webhook_subscription_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const row = (data as SettingsRow | null) ?? null;
  if (!row) return DEFAULTS;
  return {
    ai_fallback_enabled: row.ai_fallback_enabled,
    auto_acknowledge: row.auto_acknowledge,
    webhook_subscription_id: row.webhook_subscription_id,
  };
}

export async function updateWalmartSettings(
  tenantId: string,
  patch: Partial<WalmartSettings>,
): Promise<WalmartSettings> {
  const svc = createServiceClient();
  const upsertPayload = { tenant_id: tenantId, ...patch };

  await (
    svc.from("walmart_tenant_settings" as never) as unknown as {
      upsert: (
        v: Record<string, unknown>,
        opts: { onConflict: string },
      ) => Promise<{ error: { message?: string } | null }>;
    }
  ).upsert(upsertPayload, { onConflict: "tenant_id" });

  return getWalmartSettings(tenantId);
}
