// Página HTML server-rendered con el QR embebido como SVG.
// Diseñada para cargarse dentro de un <iframe> — bypassa cualquier issue de
// React rendering en el cliente.

import QRCode from "qrcode";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return new NextResponse("<p style='font-family:sans-serif;padding:1rem;color:#dc2626'>Missing url param</p>", {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  let svg: string;
  try {
    svg = await QRCode.toString(url, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0a0a0a", light: "#ffffff" },
      width: 200,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`<p style='font-family:sans-serif;padding:1rem;color:#dc2626'>${msg}</p>`, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR</title><style>html,body{margin:0;padding:0;background:#fff;display:flex;align-items:center;justify-content:center;height:100%;overflow:hidden}svg{width:200px;height:200px;display:block}</style></head><body>${svg}</body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
