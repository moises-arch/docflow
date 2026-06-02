import { createServiceClient } from "./supabase.ts";

/** Verify that userId is a member of tenantId. Throws if not. */
export async function assertTenantMember(tenantId: string, userId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("tenant_members")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`User ${userId} is not a member of tenant ${tenantId}`);
  }
}
