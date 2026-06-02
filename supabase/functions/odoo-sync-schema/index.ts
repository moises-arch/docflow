import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { decrypt } from "../_shared/crypto.ts";
import { secrets } from "../_shared/secrets.ts";
import {
  odooAuthenticate,
  odooExecute,
  toOdooConnection,
  type OdooFieldMeta,
} from "../_shared/odoo.ts";

interface Payload {
  tenant_id?: string;
  run_id?: string;
  include_all_models?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const KEY_MODELS = [
  "sale.order",
  "sale.order.line",
  "purchase.order",
  "purchase.order.line",
  "account.move",
  "account.move.line",
  "stock.picking",
  "stock.move",
  "stock.move.line",
  "res.partner",
  "product.product",
  "product.template",
  "res.currency",
  "account.tax",
  "stock.warehouse",
  "delivery.carrier",
  "uom.uom",
  "account.payment.term",
  "crm.team",
  "res.users",
];

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function selectionToJson(value: unknown) {
  return Array.isArray(value) ? value : [];
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

  if (!validUuid(payload.tenant_id)) {
    return json({ error: "Invalid tenant_id" }, 400);
  }

  const tenantId = payload.tenant_id;
  const runId = payload.run_id ?? null;
  const includeAllModels = payload.include_all_models === true;
  const supabase = createServiceClient();

  const { data: connection } = await supabase
    .from("odoo_connections")
    .select("base_url, database, username, api_key_enc, status")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!connection || connection.status !== "active") {
    return json({ error: "No active Odoo connection configured" }, 422);
  }

  try {
    const password = await decrypt(connection.api_key_enc, secrets.intakeSecretsKey);
    const conn = toOdooConnection({
      base_url: connection.base_url,
      database: connection.database,
      username: connection.username,
      password,
    });
    const uid = await odooAuthenticate(conn);

    const rawModels = (await odooExecute(conn, uid, "ir.model", "search_read", [[]], {
      fields: ["model", "name", "transient", "abstract", "state"],
      limit: includeAllModels ? 5000 : 500,
    })) as Array<{
      model?: string;
      name?: string;
      transient?: boolean;
      abstract?: boolean;
      state?: string;
    }>;

    const models = (rawModels ?? []).filter((model) => {
      if (!model.model) return false;
      return includeAllModels ? true : KEY_MODELS.includes(model.model);
    });

    const modelRows = models.map((model) => ({
      tenant_id: tenantId,
      provider: "odoo",
      model_name: model.model ?? "",
      model_label: model.name ?? model.model ?? "",
      transient: Boolean(model.transient),
      abstract: Boolean(model.abstract),
      manual: model.state === "manual",
      meta: { state: model.state ?? null },
      last_synced_at: new Date().toISOString(),
    }));

    if (modelRows.length > 0) {
      const { error: modelError } = await supabase
        .from("integration_models")
        .upsert(modelRows, { onConflict: "tenant_id,provider,model_name" });
      if (modelError) throw modelError;
    }

    const fieldRows: Array<Record<string, unknown>> = [];

    for (const model of models) {
      if (!model.model) continue;

      const fieldsGet = (await odooExecute(conn, uid, model.model, "fields_get", [[]], {
        attributes: [
          "string",
          "type",
          "relation",
          "required",
          "readonly",
          "store",
          "selectable",
          "help",
          "selection",
        ],
      })) as Record<string, OdooFieldMeta>;

      for (const [fieldName, meta] of Object.entries(fieldsGet ?? {})) {
        const readonly = Boolean(meta?.readonly);
        fieldRows.push({
          tenant_id: tenantId,
          provider: "odoo",
          model_name: model.model,
          field_name: fieldName,
          field_label: meta?.string ?? fieldName,
          field_type: meta?.type ?? "unknown",
          relation_model: meta?.relation ?? null,
          required: Boolean(meta?.required),
          readonly,
          stored: meta?.store !== false,
          selectable: Boolean(meta?.selectable),
          writeable: !readonly,
          meta: {
            help: meta?.help ?? null,
            selection: selectionToJson(meta?.selection),
          },
          last_synced_at: new Date().toISOString(),
        });
      }
    }

    if (fieldRows.length > 0) {
      const { error: fieldError } = await supabase
        .from("integration_fields")
        .upsert(fieldRows, { onConflict: "tenant_id,provider,model_name,field_name" });
      if (fieldError) throw fieldError;
    }

    if (runId) {
      await supabase
        .from("odoo_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          ok: true,
          imported: modelRows.length + fieldRows.length,
          deactivated: null,
        })
        .eq("id", runId);
    }

    return json({
      ok: true,
      models: modelRows.length,
      fields: fieldRows.length,
      include_all_models: includeAllModels,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (runId) {
      await supabase
        .from("odoo_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          ok: false,
          error: message.slice(0, 500),
        })
        .eq("id", runId);
    }

    return json({ error: "Schema sync failed", detail: message }, 500);
  }
});
