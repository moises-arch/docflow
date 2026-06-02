import { BrainCircuit } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireSettingsAccess } from "../../_lib";
import { SectionCard, TableData, TableHead } from "../../section-card";
import { AiConnectionForm } from "../../ai/ai-connection-form";
import { HelpLink } from "@/components/app/help-link";
import { SettingsPage } from "../../settings-page";

function toProvider(_value: unknown): "anthropic" { return "anthropic"; }

export default async function AdminAiPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const t = await getTranslations("settings.ai");

  const db = supabase as unknown as {
    from: (table: string) => {
      select: (columns?: string) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
          order: (col: string, opts?: { ascending?: boolean }) => {
            limit: (n: number) => Promise<{ data: Array<Record<string, unknown>> | null }>;
          };
        };
        in: (col: string, vals: string[]) => Promise<{ data: Array<Record<string, unknown>> | null }>;
      };
    };
  };

  const { data: connection } = await db.from("ai_connections")
    .select("provider, primary_model, status, last_checked_at, last_error")
    .eq("tenant_id", tenantId).maybeSingle();

  const { data: recentExtractions } = await db.from("extractions")
    .select("id, document_id, created_at, model_meta")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(60);

  const extractionRows = Array.isArray(recentExtractions) ? recentExtractions : [];
  const documentIds = extractionRows.map(r => String(r.document_id ?? "")).filter(v => v.length > 0);
  const documentNamesById = new Map<string, string>();

  if (documentIds.length > 0) {
    const { data: docs } = await db.from("documents").select("id, original_name").in("id", documentIds);
    for (const doc of Array.isArray(docs) ? docs : []) {
      documentNamesById.set(String(doc.id), String(doc.original_name ?? ""));
    }
  }

  const costs = extractionRows.map(row => {
    const meta = row.model_meta && typeof row.model_meta === "object" ? row.model_meta as Record<string, unknown> : {};
    const actualCost = Number(meta.ai_cost_usd_actual);
    const effectiveCost = Number(meta.effective_extraction_cost_usd);
    const costUsd = Number.isFinite(actualCost) && actualCost > 0 ? actualCost : Number.isFinite(effectiveCost) && effectiveCost > 0 ? effectiveCost : 0;
    return {
      id: String(row.id ?? ""), createdAt: String(row.created_at ?? ""),
      documentId: String(row.document_id ?? ""),
      provider: String(meta.ai_provider ?? "unknown"),
      model: String(meta.ai_model_primary ?? meta.extractor ?? "unknown"),
      inputTokens: Number.isFinite(Number(meta.ai_tokens_input)) ? Number(meta.ai_tokens_input) : null,
      outputTokens: Number.isFinite(Number(meta.ai_tokens_output)) ? Number(meta.ai_tokens_output) : null,
      costUsd,
    };
  });

  const totalCostUsd = costs.reduce((s, r) => s + r.costUsd, 0);
  const processedCount = costs.length;
  const averageCostUsd = processedCount > 0 ? totalCostUsd / processedCount : 0;

  return (
    <SettingsPage>
    <div className="grid gap-5">
      <SectionCard title={t("title")} description={t("description")} icon={BrainCircuit} aside={<HelpLink slug="anthropic-key" />}>
        <AiConnectionForm connection={connection ? {
          provider: toProvider(connection.provider),
          primary_model: String(connection.primary_model ?? ""),
          status: String(connection.status ?? "unverified"),
          last_checked_at: typeof connection.last_checked_at === "string" ? connection.last_checked_at : null,
          last_error: typeof connection.last_error === "string" ? connection.last_error : null,
        } : null} />
      </SectionCard>

      <SectionCard title={t("cost.title")} description={t("cost.description")} icon={BrainCircuit}>
        <div className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Metric label={t("cost.totalUsd")} value={`$${totalCostUsd.toFixed(4)}`} />
            <Metric label={t("cost.processed")} value={String(processedCount)} />
            <Metric label={t("cost.avgUsd")} value={`$${averageCostUsd.toFixed(4)}`} />
          </div>
          {costs.length === 0 ? (
            <p className="text-sm text-[var(--color-fg-mute)]">{t("cost.empty")}</p>
          ) : (
            <div className="overflow-auto border border-[var(--color-border)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left">
                    <TableHead>{t("cost.columns.date")}</TableHead>
                    <TableHead>{t("cost.columns.document")}</TableHead>
                    <TableHead>{t("cost.columns.provider")}</TableHead>
                    <TableHead>{t("cost.columns.model")}</TableHead>
                    <TableHead>{t("cost.columns.tokens")}</TableHead>
                    <TableHead>{t("cost.columns.usd")}</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {costs.map(row => (
                    <tr key={row.id} className="border-b border-[var(--color-border)]">
                      <TableData>{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</TableData>
                      <TableData>{documentNamesById.get(row.documentId) ?? row.documentId.slice(0, 8)}</TableData>
                      <TableData>{row.provider}</TableData>
                      <TableData>{row.model}</TableData>
                      <TableData>{row.inputTokens !== null || row.outputTokens !== null ? `${row.inputTokens ?? 0} / ${row.outputTokens ?? 0}` : "—"}</TableData>
                      <TableData>${row.costUsd.toFixed(6)}</TableData>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
    </SettingsPage>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <p className="text-xs text-[var(--color-fg-mute)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--color-fg)]">{value}</p>
    </div>
  );
}
