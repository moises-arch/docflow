// Carga el logo de DocFlow como PNG base64 para incrustar en PDFs.
// Convierte AVIF→PNG con sharp si está disponible; devuelve null si falla.
import path from "path";
import fs from "fs";

let _cached: string | null = null;

export async function getLogoDataUrl(): Promise<string | null> {
  if (_cached) return _cached;
  try {
    const avifPath = path.join(process.cwd(), "public", "app-logo.avif");
    if (!fs.existsSync(avifPath)) return null;
    // dynamic import evita que tsc exija tipos de sharp en compilación
    // eslint-disable-next-line
    const sharpModule = await import(/* webpackIgnore: true */ "sharp" as string);
    const sharp = sharpModule.default ?? sharpModule;
    // eslint-disable-next-line
    const pngBuffer = await (sharp as any)(avifPath).png().toBuffer();
    _cached = `data:image/png;base64,${(pngBuffer as Buffer).toString("base64")}`;
    return _cached;
  } catch {
    return null;
  }
}
