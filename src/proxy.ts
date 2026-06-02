import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const PUBLIC_PATHS = [
  "/en/sign-in",
  "/es/sign-in",
  "/en/landing",
  "/es/landing",
  "/_next",
  "/favicon.ico",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function getLocaleFromPath(pathname: string): (typeof routing.locales)[number] {
  const segment = pathname.split("/")[1];
  return routing.locales.includes(segment as (typeof routing.locales)[number])
    ? (segment as (typeof routing.locales)[number])
    : routing.defaultLocale;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets. API routes are excluded by the matcher below.
  if (
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Run intl middleware first — it handles locale prefix routing
  const intlResponse = intlMiddleware(request);
  if (intlResponse && pathname === "/") {
    return intlResponse;
  }

  // Build Supabase server client to read session
  let response = intlResponse ?? NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session — keeps cookies alive
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If unauthenticated and not on a public path → redirect to sign-in
  if (!user && !isPublicPath(pathname)) {
    const locale = getLocaleFromPath(pathname);
    const signIn = new URL(`/${locale}/sign-in`, request.url);
    signIn.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(signIn);
  }

  // Forward tenant_id as a server-only header (never trusted from browser)
  if (user) {
    const activeTenantId = request.cookies.get("active_tenant_id")?.value;
    if (activeTenantId) {
      response.headers.set("x-tenant-id", activeTenantId);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Match all paths except API routes and static files.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
