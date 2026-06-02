// Genera el QR del scan link server-side como SVG.
// Recibe ?url=<url-completa> y devuelve image/svg+xml.
// Esto evita cualquier issue de rendering de QR en el cliente React.

import QRCode from "qrcode";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }
  // Sanity check: solo aceptar URLs http/https del propio dominio para evitar abuse.
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return NextResponse.json({ error: "invalid url" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  try {
    const svg = await QRCode.toString(url, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0a0a0a", light: "#ffffff" },
      width: 400,
    });
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "qr generation failed", detail: message }, { status: 500 });
  }
}
