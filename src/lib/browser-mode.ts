// Estado del motor de navegador usado por los runners de scraping (Cleo/Rithum).
// Si BROWSER_WS_ENDPOINT está configurado, el navegador corre en el VPS remoto
// (Browserless) en lugar del Chromium empaquetado dentro de las funciones de
// Vercel. Este helper centraliza la detección para logs y UI.
//
// Solo se ejecuta del lado del servidor (lee process.env).

export type BrowserMode = {
  /** true = navegador remoto en el VPS; false = Chromium serverless en Vercel. */
  remote: boolean;
  /** Host del endpoint remoto (ej. "browser.example.com"), o null. */
  host: string | null;
  /** Etiqueta lista para mostrar en UI. */
  label: string;
};

export function getBrowserMode(): BrowserMode {
  const endpoint = process.env.BROWSER_WS_ENDPOINT;
  if (endpoint && endpoint.trim().length > 0) {
    let host: string | null = null;
    try {
      // ws(s):// → http(s):// para poder parsear el host con URL.
      host = new URL(endpoint.replace(/^ws/i, "http")).host;
    } catch {
      host = null;
    }
    return {
      remote: true,
      host,
      label: host ? `VPS · ${host}` : "VPS (remoto)",
    };
  }
  return {
    remote: false,
    host: null,
    label: "Serverless (Vercel)",
  };
}
