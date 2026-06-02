import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { decrypt } from "../_shared/crypto.ts";
import { secrets } from "../_shared/secrets.ts";
import { odooAuthenticate, odooExecute, toOdooConnection } from "../_shared/odoo.ts";

interface Payload {
  tenant_id?: string;
  export_profile_id?: string;
  order_draft_id?: string;
}

type DraftRow = {
  id: string;
  document_id: string | null;
  po_number: string | null;
  po_date: string | null;
  currency: string | null;
  buyer: Record<string, unknown> | null;
  shipping_address: Record<string, unknown> | null;
  billing_address: Record<string, unknown> | null;
  notes: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function buyerName(draft: DraftRow) {
  if (!draft.buyer || typeof draft.buyer !== "object" || Array.isArray(draft.buyer)) return null;
  const raw = draft.buyer.name;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function addressLine(address: Record<string, unknown> | null) {
  if (!address || typeof address !== "object" || Array.isArray(address)) return null;
  const line1 = typeof address.line1 === "string" ? address.line1.trim() : "";
  return line1 || null;
}

async function resolveMany2OneId(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: string,
  destinationField: string,
  raw: unknown,
): Promise<number | null> {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;

  if (destinationField === "partner_id") {
    const { data } = await supabase
      .from("integration_catalog_partners")
      .select("external_id")
      .eq("tenant_id", tenantId)
      .eq("provider", "odoo")
      .ilike("name", text)
      .limit(1)
      .maybeSingle();
    return data?.external_id ? Number(data.external_id) : null;
  }

  if (destinationField === "currency_id") {
    const { data } = await supabase
      .from("integration_catalog_refs")
      .select("external_id")
      .eq("tenant_id", tenantId)
      .eq("provider", "odoo")
      .eq("catalog_type", "currencies")
      .eq("code", text.toUpperCase())
      .limit(1)
      .maybeSingle();
    return data?.external_id ? Number(data.external_id) : null;
  }

  if (destinationField === "product_id") {
    const { data: byCode } = await supabase
      .from("integration_catalog_products")
      .select("external_id")
      .eq("tenant_id", tenantId)
      .eq("provider", "odoo")
      .eq("code", text)
      .limit(1)
      .maybeSingle();
    if (byCode?.external_id) return Number(byCode.external_id);

    const { data: byName } = await supabase
      .from("integration_catalog_products")
      .select("external_id")
      .eq("tenant_id", tenantId)
      .eq("provider", "odoo")
      .ilike("name", text)
      .limit(1)
      .maybeSingle();
    return byName?.external_id ? Number(byName.external_id) : null;
  }

  return null;
}

function readSourcePath(sourcePath: string, draft: DraftRow, line: Record<string, unknown> | null) {
  switch (sourcePath) {
    case "po_number":
      return draft.po_number;
    case "po_date":
      return draft.po_date ? `${draft.po_date} 00:00:00` : null;
    case "currency":
      return draft.currency;
    case "customer_name":
      return buyerName(draft);
    case "notes":
      return draft.notes;
    case "line.description":
      return line?.description ?? null;
    case "line.sku":
      return line?.sku ?? null;
    case "line.quantity":
      return line?.quantity ?? null;
    case "line.unit_price":
      return line?.unit_price ?? null;
    case "delivery_address":
      return addressLine(draft.shipping_address);
    case "billing_address":
      return addressLine(draft.billing_address);
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (
    !validUuid(payload.tenant_id) ||
    !validUuid(payload.export_profile_id) ||
    !validUuid(payload.order_draft_id)
  ) {
    return json({ error: "Invalid payload" }, 400);
  }

  const tenantId = payload.tenant_id;
  const profileId = payload.export_profile_id;
  const orderDraftId = payload.order_draft_id;
  const supabase = createServiceClient();

  const { data: connection } = await supabase
    .from("odoo_connections")
    .select("base_url, database, username, api_key_enc, status")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!connection || connection.status !== "active") {
    return json({ error: "No active Odoo connection configured" }, 422);
  }

  const { data: profile } = await supabase
    .from("export_profiles")
    .select("id, flow, root_model, line_model, settings, active")
    .eq("id", profileId)
    .eq("tenant_id", tenantId)
    .eq("provider", "odoo")
    .maybeSingle();
  if (!profile || !profile.active) {
    return json({ error: "Export profile not found" }, 404);
  }

  const { data: mappings } = await supabase
    .from("export_profile_mappings")
    .select(
      "id, scope, source_path, destination_model, destination_field, required, default_value, active",
    )
    .eq("export_profile_id", profileId)
    .eq("tenant_id", tenantId)
    .eq("active", true);

  const { data: draft } = await supabase
    .from("order_drafts")
    .select("id, document_id, po_number, po_date, currency, buyer, shipping_address, billing_address, notes")
    .eq("id", orderDraftId)
    .eq("tenant_id", tenantId)
    .single<DraftRow>();

  if (!draft) {
    return json({ error: "Order draft not found" }, 404);
  }

  const { data: lines } = await supabase
    .from("order_draft_lines")
    .select("id, sku, description, quantity, unit_price, unit, tax_rate")
    .eq("order_draft_id", orderDraftId)
    .eq("tenant_id", tenantId)
    .order("position", { ascending: true });

  const runKey = crypto.randomUUID();

  try {
    const password = await decrypt(connection.api_key_enc, secrets.intakeSecretsKey);
    const conn = toOdooConnection({
      base_url: connection.base_url,
      database: connection.database,
      username: connection.username,
      password,
    });
    const uid = await odooAuthenticate(conn);

    const headerVals: Record<string, unknown> = {};
    const lineMappings = (mappings ?? []).filter((mapping) => mapping.scope === "line");

    for (const mapping of (mappings ?? []).filter((item) => item.scope === "header")) {
      const raw = readSourcePath(mapping.source_path, draft, null) ?? mapping.default_value;
      const resolvedId = mapping.destination_field.endsWith("_id")
        ? await resolveMany2OneId(supabase, tenantId, mapping.destination_field, raw)
        : null;
      const value = resolvedId ?? raw;
      if (mapping.required && (raw === null || raw === undefined || raw === "")) {
        return json({ error: `Required export field missing: ${mapping.destination_field}` }, 422);
      }
      if (value !== null && value !== undefined && value !== "") {
        headerVals[mapping.destination_field] = value;
      }
    }

    if (profile.flow === "sales_order") {
      headerVals.partner_id = headerVals.partner_id ?? 1;
      headerVals.client_order_ref = headerVals.client_order_ref ?? draft.po_number ?? undefined;
      headerVals.note = headerVals.note ?? draft.notes ?? undefined;
    }

    const rootId = (await odooExecute(conn, uid, profile.root_model, "create", [
      headerVals,
    ])) as number;

    if (profile.line_model && lineMappings.length > 0) {
      for (const line of lines ?? []) {
        const lineVals: Record<string, unknown> = {};

        for (const mapping of lineMappings) {
          const raw =
            readSourcePath(mapping.source_path, draft, line as Record<string, unknown>) ??
            mapping.default_value;
          const resolvedId = mapping.destination_field.endsWith("_id")
            ? await resolveMany2OneId(supabase, tenantId, mapping.destination_field, raw)
            : null;
          const value = resolvedId ?? raw;
          if (mapping.required && (raw === null || raw === undefined || raw === "")) {
            return json(
              { error: `Required line field missing: ${mapping.destination_field}` },
              422,
            );
          }
          if (value !== null && value !== undefined && value !== "") {
            lineVals[mapping.destination_field] = value;
          }
        }

        if (profile.flow === "sales_order") {
          lineVals.order_id = rootId;
          lineVals.name = lineVals.name ?? line.description;
          lineVals.product_uom_qty = lineVals.product_uom_qty ?? line.quantity ?? 1;
          lineVals.price_unit = lineVals.price_unit ?? line.unit_price ?? 0;
        }

        if (profile.flow === "purchase_order") {
          lineVals.order_id = rootId;
          lineVals.name = lineVals.name ?? line.description;
          lineVals.product_qty = lineVals.product_qty ?? line.quantity ?? 1;
          lineVals.price_unit = lineVals.price_unit ?? line.unit_price ?? 0;
          if (!headerVals.partner_id) {
            headerVals.partner_id = 1;
          }
        }

        if (profile.flow === "invoice") {
          lineVals.move_id = rootId;
          lineVals.name = lineVals.name ?? line.description;
          lineVals.quantity = lineVals.quantity ?? line.quantity ?? 1;
          lineVals.price_unit = lineVals.price_unit ?? line.unit_price ?? 0;
        }

        if (profile.flow === "shipping") {
          lineVals.picking_id = rootId;
          lineVals.name = lineVals.name ?? line.description;
          lineVals.product_uom_qty = lineVals.product_uom_qty ?? line.quantity ?? 1;
        }

        await odooExecute(conn, uid, profile.line_model, "create", [lineVals]);
      }
    }

    // ── Attach original document PDF to the Odoo record ──────────────
    if (draft.document_id) {
      try {
        const { data: docRow } = await supabase
          .from("documents")
          .select("storage_path, original_name, mime_type")
          .eq("id", draft.document_id)
          .eq("tenant_id", tenantId)
          .maybeSingle();

        if (docRow?.storage_path) {
          const { data: fileData } = await supabase.storage
            .from("documents")
            .download(docRow.storage_path);

          if (fileData) {
            const fileBytes = await fileData.arrayBuffer();
            const base64 = btoa(
              String.fromCharCode(...new Uint8Array(fileBytes)),
            );
            const fileName = docRow.original_name ?? `document-${draft.document_id}.pdf`;
            const mimeType = docRow.mime_type ?? "application/pdf";

            await odooExecute(conn, uid, "ir.attachment", "create", [
              {
                name: fileName,
                type: "binary",
                datas: base64,
                res_model: profile.root_model,
                res_id: rootId,
                mimetype: mimeType,
              },
            ]);
            console.log(`[odoo-export] Attached ${fileName} to ${profile.root_model} #${rootId}`);
          }
        }
      } catch (attachErr) {
        // Non-fatal — log but don't fail the export
        console.error("[odoo-export] Failed to attach document:", attachErr instanceof Error ? attachErr.message : attachErr);
      }
    }

    // ── Adjuntar packing slips al campo COF csf_packing_list_attachment_id ──
    // Si el documento principal vino de un email que también tenía un packing
    // slip adjunto (taggado con source_meta.is_packing_slip:true), buscarlo
    // y adjuntarlo al SO en Odoo. COF lo usará para el warehouse email.
    // Solo aplica a sale orders (el campo csf_packing_list_attachment_id
    // existe en sale.order).
    if (profile.flow === "sales_order" && draft.document_id) {
      try {
        // Obtener el inbound_email_id del documento principal
        const { data: mainDoc } = await supabase
          .from("documents")
          .select("source_ref, source_meta")
          .eq("id", draft.document_id)
          .eq("tenant_id", tenantId)
          .maybeSingle();

        const inboundEmailId = mainDoc?.source_ref as string | null;

        if (inboundEmailId) {
          // Traer todos los documentos hermanos del mismo email y filtrar en JS.
          // Evita problemas de tipo con filtros JSONB en PostgREST (boolean vs string).
          const { data: packingSlipDocs } = await supabase
            .from("documents")
            .select("id, storage_path, original_name, mime_type, source_meta")
            .eq("tenant_id", tenantId)
            .eq("source_ref", inboundEmailId)
            .neq("id", draft.document_id); // excluir el doc principal

          // Filtrar en JS para evitar problemas de tipo con el filtro JSONB en PostgREST
          // (eq.true puede interpretarse como boolean vs string según el contexto)
          const filteredSlips = (packingSlipDocs ?? []).filter((d) => {
            const meta = d.source_meta as Record<string, unknown> | null;
            return meta?.is_packing_slip === true || meta?.is_packing_slip === "true";
          });
          console.log(`[odoo-export] COF: found ${filteredSlips.length} packing slip(s) for email ${inboundEmailId} (total siblings: ${(packingSlipDocs ?? []).length})`);

          for (const psDoc of filteredSlips) {
            try {
              if (!psDoc.storage_path) continue;

              // Intentar descargar desde el storage_path del documento.
              // Fallback: buscar en inbound_email_attachments el path correcto
              // (puede haber mismatch entre document.storage_path y el archivo real).
              let psFile = (await supabase.storage.from("documents").download(psDoc.storage_path)).data;

              if (!psFile) {
                // Fallback: buscar el attachment record y usar su storage_path
                const { data: attRow } = await supabase
                  .from("inbound_email_attachments")
                  .select("storage_path")
                  .eq("document_id", psDoc.id)
                  .maybeSingle();
                const fallbackPath = (attRow as { storage_path?: string } | null)?.storage_path;
                if (fallbackPath) {
                  psFile = (await supabase.storage.from("documents").download(fallbackPath)).data;
                  console.log(`[odoo-export] COF: usando fallback storage_path para ${psDoc.id}`);
                }
              }

              if (!psFile) {
                console.error(`[odoo-export] COF: no se pudo descargar ${psDoc.id} desde ningún path`);
                continue;
              }

              const psBytes = await psFile.arrayBuffer();
              const psBase64 = btoa(String.fromCharCode(...new Uint8Array(psBytes)));
              const psName = psDoc.original_name ?? "PackingSlip.pdf";

              // Crear ir.attachment en Odoo con el packing slip
              const attachmentId = (await odooExecute(conn, uid, "ir.attachment", "create", [
                {
                  name: psName,
                  type: "binary",
                  datas: psBase64,
                  res_model: "sale.order",
                  res_id: rootId,
                  mimetype: psDoc.mime_type ?? "application/pdf",
                },
              ])) as number;

              // Asignar a csf_packing_list_attachment_id en el SO
              // Esto es lo que COF usa para generar el warehouse email con el packing list
              await odooExecute(conn, uid, "sale.order", "write", [
                [rootId],
                { csf_packing_list_attachment_id: attachmentId },
              ]);

              console.log(
                `[odoo-export] COF: packing slip "${psName}" adjuntado a sale.order #${rootId} (attachment #${attachmentId})`,
              );

              // Marcar el documento como procesado en DocFlow
              await supabase
                .from("documents")
                .update({ state: "reviewed" })
                .eq("id", psDoc.id)
                .eq("tenant_id", tenantId);
            } catch (psErr) {
              console.error(
                "[odoo-export] COF packing slip attach failed:",
                psErr instanceof Error ? psErr.message : psErr,
              );
            }
          }
        }
      } catch (cofErr) {
        // Non-fatal — no fallar el export completo por un error de packing slip
        console.error("[odoo-export] COF packing slip lookup failed:", cofErr instanceof Error ? cofErr.message : cofErr);
      }
    }

    const readData = (await odooExecute(conn, uid, profile.root_model, "read", [
      [rootId],
      ["name"],
    ])) as Array<{ name?: string }>;
    const externalName = readData?.[0]?.name ?? null;

    // ── Escribir DocFlow URL y estado en el SO (módulo sdm_integration) ──
    // Permite ver el link al documento DocFlow directamente desde el SO en Odoo.
    if (profile.flow === "sales_order") {
      try {
        const sdmDocUrl = `${secrets.supabaseUrl?.replace("supabase.co", "").replace("https://", "https://app.") ?? ""}`.startsWith("https://app.")
          ? null  // no construir URL de Supabase, usar la de la app
          : null;
        // URL directa al order draft en DocFlow
        const appUrl = Deno.env.get("INTAKE_PUBLIC_APP_URL") ?? "https://app.example.com";
        const sdmUrl = `${appUrl}/en/processed?so=${externalName ?? rootId}`;
        await odooExecute(conn, uid, "sale.order", "write", [
          [rootId],
          {
            sdm_document_url: sdmUrl,
            sdm_sync_state: "approved",
          },
        ]);
        console.log(`[odoo-export] DocFlow: wrote sdm_document_url to SO #${rootId}`);
      } catch (sdmErr) {
        // Non-fatal — el módulo DocFlow puede no estar instalado
        console.log("[odoo-export] DocFlow module not installed or write failed (non-fatal)");
      }
    }

    const { error: successInsErr } = await supabase.from("export_runs").insert({
      tenant_id: tenantId,
      provider: "odoo",
      export_profile_id: profileId,
      order_draft_id: orderDraftId,
      run_key: runKey,
      status: "success",
      external_id: String(rootId),
      external_name: externalName,
      request_meta: { root_model: profile.root_model, line_model: profile.line_model },
      response_meta: { name: externalName },
      error_message: null,
    });
    if (successInsErr) {
      console.error("[odoo-export] export_runs success insert failed:", successInsErr.message);
    }

    return json({ ok: true, external_id: rootId, external_name: externalName });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const { error: errorInsErr } = await supabase.from("export_runs").insert({
      tenant_id: tenantId,
      provider: "odoo",
      export_profile_id: profileId,
      order_draft_id: orderDraftId,
      run_key: runKey,
      status: "error",
      external_id: null,
      external_name: null,
      request_meta: { profile_id: profileId },
      response_meta: {},
      error_message: detail.slice(0, 1000),
    });
    if (errorInsErr) {
      console.error("[odoo-export] export_runs error insert failed:", errorInsErr.message);
    }
    return json({ error: "Export failed", detail }, 500);
  }
});
