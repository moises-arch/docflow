import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Base URL del ERP, configurable vía env. Se usa para permitir el embedding
// de la app dentro del ERP en un iframe (frame-ancestors).
const ERP_BASE_URL =
  process.env.NEXT_PUBLIC_ERP_BASE_URL ?? "https://erp.example.com";

const nextConfig: NextConfig = {
  // Permitir embedding en iframe desde el ERP.
  // Sin esto, Next.js bloquea el iframe con X-Frame-Options: SAMEORIGIN.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            // frame-ancestors: permite embeds desde el ERP y desde el propio dominio.
            // Se usa CSP en lugar del obsoleto X-Frame-Options: ALLOW-FROM.
            value: `frame-ancestors 'self' ${ERP_BASE_URL};`,
          },
          // Eliminar X-Frame-Options para que el navegador use solo el CSP.
          {
            key: "X-Frame-Options",
            value: "",
          },
          // Defense-in-depth security headers. None of these change behavior
          // for a well-behaved app; they harden the browser against attacks
          // that try to exploit edge cases.
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            // 2 years, include subdomains. Production is HTTPS-only via Vercel.
            value: "max-age=63072000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            // Block features the app does not use. Camera is needed for the
            // QR scan flow (mobile upload), so it stays allowed for self.
            value: "geolocation=(), microphone=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },

  // Strict mode catches hydration bugs early.
  reactStrictMode: true,

  // Type errors still block deploys; we run `pnpm typecheck` in CI as well.
  typescript: {
    ignoreBuildErrors: false,
  },

  // Hide the X-Powered-By header in prod.
  poweredByHeader: false,

  // Heavy deps that shouldn't be bundled into Edge runtimes.
  // @sparticuz/chromium ships native binaries (chromium.tar.br) that must NOT
  // be processed by webpack/turbopack — Vercel needs to find them at the
  // expected path under node_modules. Same pattern for playwright-core.
  serverExternalPackages: [
    "pdf-lib",
    "pdfjs-dist",
    "qrcode",
    "@sparticuz/chromium",
    "playwright-core",
  ],

  // Vercel only bundles files that are statically imported. The Chromium
  // tar.br binary is loaded at runtime via fs, so we MUST list it explicitly
  // for outputFileTracing or the lambda won't have access to it. Glob covers
  // every route that uses Playwright (browser-ingest, cleo, rithum).
  outputFileTracingIncludes: {
    "/api/ingest/browser/**/*": ["./node_modules/@sparticuz/chromium/**/*"],
    "/api/ingest/cleo/**/*": ["./node_modules/@sparticuz/chromium/**/*"],
    "/api/ingest/rithum/**/*": ["./node_modules/@sparticuz/chromium/**/*"],
    "/api/ingest/walmart/**/*": ["./node_modules/@sparticuz/chromium/**/*"],
    "/api/cron/browser-ingest/**/*": ["./node_modules/@sparticuz/chromium/**/*"],
    "/api/cron/rithum-healthcheck/**/*": ["./node_modules/@sparticuz/chromium/**/*"],
  },

  // Browser source maps off in prod — keeps bundle small.
  productionBrowserSourceMaps: false,
};

export default withNextIntl(nextConfig);
