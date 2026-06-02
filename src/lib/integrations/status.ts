import "server-only";
import { INTEGRATIONS_REGISTRY, type IntegrationStatus } from "./registry";

export interface MinimalSupabaseClient {
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (
        column: string,
        value: unknown,
      ) => {
        // PostgrestBuilder is PromiseLike, not a full Promise (no catch/finally/Symbol.toStringTag)
        maybeSingle: () => PromiseLike<{
          data: { status?: string | null } | null;
          error: unknown;
        }>;
      };
    };
  };
}

/**
 * Resolves runtime status for each integration in the registry.
 * Currently only Odoo can be "connected" (when odoo_connections.status === 'active').
 * Other integrations stay at their registry-default status.
 */
export async function resolveIntegrationStatuses(
  supabase: MinimalSupabaseClient,
  tenantId: string,
): Promise<Record<string, IntegrationStatus>> {
  const result: Record<string, IntegrationStatus> = Object.fromEntries(
    INTEGRATIONS_REGISTRY.map((descriptor) => [descriptor.id, descriptor.status]),
  );

  const { data: odooConnection } = await supabase
    .from("odoo_connections")
    .select("status")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (odooConnection?.status === "active") {
    result["odoo"] = "connected";
  }

  return result;
}

export function countByStatus(statuses: Record<string, IntegrationStatus>): {
  connected: number;
  available: number;
  comingSoon: number;
} {
  let connected = 0;
  let available = 0;
  let comingSoon = 0;
  for (const status of Object.values(statuses)) {
    if (status === "connected") connected++;
    else if (status === "available") available++;
    else comingSoon++;
  }
  return { connected, available, comingSoon };
}
