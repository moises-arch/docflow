// Printable QR poster A4. Diseñado para imprimirse y pegarse en oficina/almacén.
// Incluye QR grande, PIN (opcional vía query ?pin=), instrucciones numeradas
// y URL fallback. El PIN se acepta por query porque el hash en DB es
// irreversible — el admin lo escribe en el dialog y se imprime así.

import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { verifyScanToken } from "@/lib/scan-token";
import { createServiceClient } from "@/lib/supabase/service";
import QRCode from "qrcode";
import { ScanPrintClient } from "./scan-print-client";

export const dynamic = "force-dynamic";

export default async function ScanPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ pin?: string }>;
}) {
  const { token } = await params;
  const { pin: rawPin } = await searchParams;
  const payload = verifyScanToken(token);
  if (!payload) notFound();

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "app.example.com";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;
  const scanUrl = `${origin}/scan/${token}`;

  // Generate the QR server-side. Errore-correction H so it survives smudges.
  const qrSvg = await QRCode.toString(scanUrl, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "H",
    color: { dark: "#0a0a0a", light: "#ffffff" },
    width: 720,
  });

  // Load tenant name + check if PIN is required server-side
  const service = createServiceClient();
  const { data: tenant } = await service
    .from("tenants")
    .select("name, scan_pin_hash")
    .eq("id", payload.tenant_id)
    .maybeSingle();
  const row = tenant as { name: string | null; scan_pin_hash: string | null } | null;
  const tenantName = row?.name ?? "DocFlow";
  const pinRequired = Boolean(row?.scan_pin_hash);

  // Only render PIN if (a) admin sent it via ?pin= and (b) tenant has PIN configured
  const displayPin = pinRequired && rawPin && /^\d{4}$/.test(rawPin) ? rawPin : null;

  return (
    <ScanPrintClient
      qrSvg={qrSvg}
      scanUrl={scanUrl}
      tenantName={tenantName}
      pin={displayPin}
      pinRequired={pinRequired}
    />
  );
}
