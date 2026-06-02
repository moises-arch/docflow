// Tipos compartidos de la integración Supplier Portal — exportados para uso en sub-páginas

export type RithumOrderRow = {
  id: string;
  rithum_order_number: string;
  rithum_partner: string | null;
  rithum_status: string | null;
  inbound_email_id: string | null;
  document_id: string | null;
  state: "pending" | "running" | "downloaded" | "failed" | "manual_required";
  attempts: number;
  last_error: string | null;
  pdf_source: "native_download" | "html_render" | null;
  created_at: string;
  updated_at: string;
};

export type RithumSmokeRun = {
  id: string;
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail?: string; ms?: number }>;
  created_at: string;
};
