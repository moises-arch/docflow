import { vi } from "vitest";

export type MockError = { message: string } | null;
export type MockResult<T = unknown> = { data: T | null; error: MockError };

// Chainable Supabase query builder that also acts as a thenable (Supabase
// builders can be awaited directly without calling .single()).
export function makeQueryBuilder<T = unknown>(result: MockResult<T> = { data: null, error: null }) {
  const settled = Promise.resolve(result);

  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    not: vi.fn(),
    ilike: vi.fn(),
    range: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    then: settled.then.bind(settled),
    catch: settled.catch.bind(settled),
    returns: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };

  const chainable = [
    "select",
    "eq",
    "neq",
    "in",
    "is",
    "not",
    "ilike",
    "range",
    "order",
    "limit",
    "update",
    "insert",
    "upsert",
    "delete",
  ] as const;

  for (const method of chainable) {
    builder[method].mockReturnValue(builder);
  }

  return builder;
}

export type QueryBuilder = ReturnType<typeof makeQueryBuilder>;

// Mock auth client (wraps createClient from @/lib/supabase/server)
export function makeMockAuthClient(
  user: { id: string; [key: string]: unknown } | null = { id: "test-user-id" },
  authError: MockError = null,
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: authError }),
    },
    from: vi.fn(),
  };
}

// Mock service client (wraps createServiceClient from @/lib/supabase/service)
export function makeMockServiceClient() {
  const storageBucket = {
    upload: vi.fn().mockResolvedValue({ data: { path: "test/path" }, error: null }),
    remove: vi.fn().mockResolvedValue({ data: [], error: null }),
  };

  return {
    from: vi.fn(),
    storage: {
      from: vi.fn().mockReturnValue(storageBucket),
      _bucket: storageBucket,
    },
  };
}

// Convenience: successful tenant membership query
export function okMembership(tenantId = "tenant-1", role = "owner") {
  return makeQueryBuilder({ data: { tenant_id: tenantId, role }, error: null });
}

// Convenience: no tenant membership (triggers 403)
export function noMembership() {
  return makeQueryBuilder({ data: null, error: null });
}
