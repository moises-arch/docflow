import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type TenantMemberRow = {
  user_id: string;
  role: string;
  created_at: string;
};

type AuthUserRow = {
  id: string;
  email: string | null;
};

export async function GET(_req?: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const service = createServiceClient();

  const { data: members, error: membersError } = await service
    .from("tenant_members")
    .select("user_id, role, created_at")
    .eq("tenant_id", membership.tenant_id)
    .order("created_at", { ascending: true })
    .returns<TenantMemberRow[]>();

  if (membersError) {
    return NextResponse.json({ error: "Failed to load team members" }, { status: 500 });
  }

  const userIds = (members ?? []).map((member) => member.user_id);
  const serviceAny = service as unknown as {
    schema: (schema: string) => {
      from: (table: string) => {
        select: (columns: string) => {
          in: (
            column: string,
            values: string[],
          ) => Promise<{
            data: AuthUserRow[] | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  };

  const { data: authUsers, error: authUsersError } = userIds.length
    ? await serviceAny.schema("auth").from("users").select("id, email").in("id", userIds)
    : { data: [] as AuthUserRow[], error: null };

  if (authUsersError) {
    return NextResponse.json({ error: "Failed to resolve member emails" }, { status: 500 });
  }

  const emailById = new Map((authUsers ?? []).map((authUser) => [authUser.id, authUser.email]));
  const items = (members ?? []).map((member) => ({
    ...member,
    email: emailById.get(member.user_id) ?? null,
  }));

  return NextResponse.json({ items });
}
