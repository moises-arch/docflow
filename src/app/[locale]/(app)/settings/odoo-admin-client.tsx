"use client";

import { DataGrid } from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { DataGridTableVirtual } from "@/components/reui/data-grid/data-grid-table-virtual";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ColumnDef,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  Activity,
  ArrowLeftRight,
  CircleHelp,
  Database,
  Layers,
  Loader2,
  Package,
  Play,
  RefreshCw,
  Search,
  Wifi,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { OdooConnectionForm } from "./odoo-connection-form";

type OdooConnection = {
  base_url: string;
  database: string;
  username: string;
  export_mode: string;
  contact_settings: Record<string, unknown> | null;
  status: string;
  last_checked_at: string | null;
  last_error: string | null;
} | null;

export type IntegrationModel = {
  model_name: string;
  model_label: string | null;
  transient: boolean;
  abstract: boolean;
  manual: boolean;
  last_synced_at: string | null;
};

type IntegrationField = {
  field_name: string;
  field_label: string | null;
  field_type: string;
  relation_model: string | null;
  required: boolean;
  readonly: boolean;
  writeable: boolean;
};

export type CatalogProduct = {
  external_id: string;
  code: string | null;
  name: string;
  uom: string | null;
  active: boolean;
};

export type CatalogPartner = {
  external_id: string;
  name: string;
  vat: string | null;
  email: string | null;
  active: boolean;
};

export type CatalogRef = {
  catalog_type: string;
  external_id: string;
  code: string | null;
  name: string;
  active: boolean;
};

export type ProductMapping = {
  id: string;
  source_sku: string | null;
  source_company_sku: string | null;
  source_description: string | null;
  odoo_product_id: number;
  odoo_product_name: string;
};

export type ExportProfile = {
  id: string;
  name: string;
  flow: string;
  root_model: string;
  line_model: string | null;
  active: boolean;
};

export type ExportRun = {
  id: string;
  export_profile_id: string | null;
  order_draft_id: string | null;
  status: string;
  external_id: string | null;
  external_name: string | null;
  error_message: string | null;
  created_at: string;
};

export type DraftOption = {
  id: string;
  po_number: string | null;
  customer_name: string | null;
};

type Props = {
  connection: OdooConnection;
  models: IntegrationModel[];
  products: CatalogProduct[];
  partners: CatalogPartner[];
  refs: CatalogRef[];
  productMappings: ProductMapping[];
  exportProfiles: ExportProfile[];
  exportRuns: ExportRun[];
  draftOptions: DraftOption[];
  initialSection?: TabId;
  catalogCounts: {
    products: number;
    partners: number;
    refs: number;
    refsByType: Record<string, number>;
  };
};

export type TabId = "connection" | "schema" | "catalog" | "sku" | "profiles" | "runs";

const FLOWS = [
  { id: "sales_order", label: "Sales order" },
  { id: "purchase_order", label: "Purchase order" },
  { id: "invoice", label: "Invoice" },
  { id: "shipping", label: "Shipping" },
  { id: "custom", label: "Custom" },
] as const;

export function OdooAdminClient({
  connection,
  models,
  productMappings,
  exportProfiles,
  exportRuns,
  draftOptions,
  initialSection = "connection",
  catalogCounts,
}: Props) {
  const router = useRouter();
  const tSections = useTranslations("integrations.odoo.sections");
  const tHelp = useTranslations("integrations.odoo.help");
  const tUi = useTranslations("integrations.odoo.ui");
  const tToasts = useTranslations("integrations.odoo.toasts");
  const [tab, setTab] = useState<TabId>(initialSection);
  const [catalogSubtab, setCatalogSubtab] = useState<"products" | "partners" | "refs">("products");
  const [syncingSchema, setSyncingSchema] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState<string | null>(null);
  const [runningExport, setRunningExport] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(models[0]?.model_name ?? "");
  const [modelFields, setModelFields] = useState<IntegrationField[]>([]);
  const [draftIdByProfile, setDraftIdByProfile] = useState<Record<string, string>>({});

  useEffect(() => {
    if (tab !== "schema") return;
    if (!selectedModel && models[0]?.model_name) {
      queueMicrotask(() => setSelectedModel(models[0].model_name));
      return;
    }
    if (selectedModel && modelFields.length === 0 && !loadingFields) {
      void loadModelFields(selectedModel);
    }
  }, [loadingFields, modelFields.length, models, selectedModel, tab]);

  async function syncSchema() {
    if (syncingSchema) return;
    setSyncingSchema(true);
    try {
      const res = await fetch("/api/integrations/odoo/schema/sync", { method: "POST" });
      if (!res.ok) throw new Error("schema_sync_failed");
      toast.success(tToasts("schemaSynced"));
      router.refresh();
    } catch {
      toast.error(tToasts("schemaSyncFailed"));
    } finally {
      setSyncingSchema(false);
    }
  }

  async function syncCatalog() {
    if (syncingCatalog) return;
    setSyncingCatalog(true);
    try {
      const res = await fetch("/api/integrations/odoo/catalog/sync", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { detail?: string; error?: string };
      if (!res.ok) {
        throw new Error(body.detail ?? body.error ?? "catalog_sync_failed");
      }
      toast.success(tToasts("catalogSynced"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tToasts("catalogSyncFailed"));
    } finally {
      setSyncingCatalog(false);
    }
  }

  async function loadModelFields(modelName: string) {
    setSelectedModel(modelName);
    setLoadingFields(true);
    try {
      const res = await fetch(
        `/api/integrations/odoo/models/${encodeURIComponent(modelName)}/fields`,
      );
      if (!res.ok) throw new Error("fields_failed");
      const body = (await res.json()) as { items?: IntegrationField[] };
      setModelFields(body.items ?? []);
    } catch {
      toast.error(tToasts("fieldsLoadFailed"));
      setModelFields([]);
    } finally {
      setLoadingFields(false);
    }
  }

  async function createProfile(flow: string) {
    if (creatingProfile) return;
    setCreatingProfile(flow);
    try {
      const res = await fetch("/api/integrations/export-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flow }),
      });
      if (!res.ok) throw new Error("profile_failed");
      toast.success(tToasts("profileCreated", { flow }));
      router.refresh();
    } catch {
      toast.error(tToasts("profileCreateFailed"));
    } finally {
      setCreatingProfile(null);
    }
  }

  async function runProfile(profileId: string, orderDraftId: string) {
    if (!orderDraftId) {
      toast.error(tToasts("pickDraftFirst"));
      return;
    }
    setRunningExport(profileId);
    try {
      const res = await fetch(`/api/integrations/export/${profileId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_draft_id: orderDraftId }),
      });
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      if (!res.ok) {
        toast.error(body.detail ?? tToasts("exportFailed"));
        return;
      }
      toast.success(tToasts("exportCompleted"));
      router.refresh();
    } catch {
      toast.error(tToasts("exportRunFailed"));
    } finally {
      setRunningExport(null);
    }
  }

  const NAV_ITEMS: { id: TabId; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "connection", label: tSections("connection"), icon: Wifi,
      badge: connection?.status === "active" ? undefined : 0 },
    { id: "schema",     label: tSections("schema"),     icon: Database,   badge: models.length },
    { id: "catalog",    label: tSections("catalog"),    icon: Package,    badge: catalogCounts.products + catalogCounts.partners + catalogCounts.refs },
    { id: "sku",        label: tSections("sku"),        icon: ArrowLeftRight, badge: productMappings.length },
    { id: "profiles",   label: tSections("profiles"),   icon: Layers,     badge: exportProfiles.length },
    { id: "runs",       label: tSections("runs"),       icon: Activity,   badge: exportRuns.length },
  ];

  const currentNavItem = NAV_ITEMS.find((item) => item.id === tab);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-[calc(100vh-3rem)] min-h-0 w-full">

        {/* ── Sidebar nav (left edge, full height) ─────────────────────────── */}
        <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface-mute)]/40">
          <div className="border-b border-[var(--color-border)] px-4 py-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-fg-subtle)]">
              Integration
            </p>
            <h2 className="mt-0.5 text-sm font-semibold text-[var(--color-fg)]">ERP 19</h2>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
              <span className={cn(
                "size-1.5 rounded-full",
                connection?.status === "active" ? "bg-[color:var(--color-teal)]" :
                connection?.status === "error"  ? "bg-[color:var(--color-rose)]" :
                                                  "bg-[var(--color-fg-subtle)]",
              )} />
              <span className="text-[var(--color-fg-mute)]">
                {connection?.status === "active" ? "Connected" :
                 connection?.status === "error"  ? "Error" :
                                                   "Not verified"}
              </span>
            </div>
          </div>
          <nav className="flex flex-col py-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors",
                    active
                      ? "bg-[var(--color-bg)] font-medium text-[var(--color-fg)]"
                      : "text-[var(--color-fg-mute)] hover:bg-[var(--color-bg)] hover:text-[var(--color-fg)]",
                  )}
                >
                  <Icon
                    size={15}
                    className={cn(
                      "shrink-0",
                      active ? "text-[color:var(--color-blue)]" : "text-[var(--color-fg-subtle)]",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {typeof item.badge === "number" && item.badge > 0 && (
                    <span className="shrink-0 rounded-md bg-[var(--color-surface-mute)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--color-fg-mute)]">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ── Section content ──────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Section header bar */}
          <header className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3.5">
            <div className="flex items-center gap-2">
              {currentNavItem && (
                <currentNavItem.icon size={15} className="text-[var(--color-fg-subtle)]" />
              )}
              <h1 className="text-sm font-semibold text-[var(--color-fg)]">
                {currentNavItem?.label ?? "ERP"}
              </h1>
            </div>
          </header>
          <div className="min-w-0 flex-1 overflow-y-auto p-6">

        {tab === "connection" && (
          <div className="grid gap-5">
            <SectionTitle title={tSections("connection")} description={tHelp("connection")} />
            <OdooConnectionForm connection={connection} />
            {/* Connection status */}
            <div className="grid gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-mute)] p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-fg-mute)]">Status</span>
                <span className={cn(
                  "inline-flex items-center gap-1 font-medium",
                  connection?.status === "active" ? "text-[color:var(--color-teal)]" :
                  connection?.status === "error"  ? "text-[color:var(--color-rose)]" :
                                                    "text-[var(--color-fg-mute)]",
                )}>
                  <span className={cn("size-1.5 rounded-full",
                    connection?.status === "active" ? "bg-[color:var(--color-teal)]" :
                    connection?.status === "error"  ? "bg-[color:var(--color-rose)]" :
                                                      "bg-[var(--color-fg-subtle)]",
                  )} />
                  {connection?.status ?? "Not verified"}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2">
                <span className="text-[var(--color-fg-mute)]">Last checked</span>
                <span className="text-[var(--color-fg)]">
                  {connection?.last_checked_at
                    ? new Date(connection.last_checked_at).toLocaleString()
                    : "Never"}
                </span>
              </div>
              {connection?.last_error && (
                <div className="flex items-start justify-between gap-3 border-t border-[var(--color-border)] pt-2">
                  <span className="shrink-0 text-[var(--color-fg-mute)]">Last error</span>
                  <span className="text-right text-[color:var(--color-rose)]">{connection.last_error}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "schema" && (
          <div className="grid gap-4">
            <SectionTitle title={tSections("schema")} description={tHelp("schema")} />
            <div className="flex items-center gap-2">
              <Button onClick={() => void syncSchema()} disabled={syncingSchema}>
                {syncingSchema ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Sync schema
              </Button>
              <span className="text-xs text-[var(--color-fg-mute)]">
                {models.length} models synced
              </span>
            </div>
            <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="max-h-[460px] overflow-auto border border-[var(--color-border)]">
                {models.map((model) => (
                  <button
                    key={model.model_name}
                    type="button"
                    onClick={() => void loadModelFields(model.model_name)}
                    className={cn(
                      "grid w-full gap-1 border-b border-[var(--color-border)] px-3 py-2 text-left text-xs",
                      selectedModel === model.model_name && "bg-[var(--color-surface-mute)]",
                    )}
                  >
                    <span className="font-mono text-[var(--color-fg)]">{model.model_name}</span>
                    <span className="text-[var(--color-fg-mute)]">
                      {model.model_label ?? "No label"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="border border-[var(--color-border)]">
                {!selectedModel ? (
                  <p className="p-3 text-sm text-[var(--color-fg-mute)]">
                    Select a model to view fields.
                  </p>
                ) : loadingFields ? (
                  <p className="p-3 text-sm text-[var(--color-fg-mute)]">Loading fields…</p>
                ) : (
                  <ModelFieldsGrid fields={modelFields} tHelp={tHelp} tUi={tUi} />
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "catalog" && (
          <div className="grid gap-5">
            <div className="flex items-start justify-between gap-4">
              <SectionTitle title={tSections("catalog")} description={tHelp("catalog")} />
              <Button onClick={() => void syncCatalog()} disabled={syncingCatalog} className="shrink-0">
                {syncingCatalog ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                Sync catalog
              </Button>
            </div>

            {catalogCounts.products + catalogCounts.partners + catalogCounts.refs === 0 ? (
              <div className="rounded-md border border-dashed border-[var(--color-border)] py-12 text-center">
                <Package size={32} className="mx-auto mb-3 text-[var(--color-fg-subtle)]" />
                <p className="text-sm font-semibold text-[var(--color-fg)]">No catalog synced yet</p>
                <p className="mt-1 text-xs text-[var(--color-fg-mute)]">
                  Click <strong>Sync catalog</strong> to import products, partners and references from ERP.
                  <br />This is required for SKU resolution in the review workspace.
                </p>
              </div>
            ) : (
              <>
                {/* Sub-tabs */}
                <div className="flex border-b border-[var(--color-border)]">
                  {[
                    { id: "products" as const, label: "Products", count: catalogCounts.products },
                    { id: "partners" as const, label: "Partners", count: catalogCounts.partners },
                    { id: "refs"     as const, label: "References", count: catalogCounts.refs },
                  ].map((sub) => {
                    const active = catalogSubtab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => setCatalogSubtab(sub.id)}
                        className={cn(
                          "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px",
                          active
                            ? "border-[color:var(--color-blue)] text-[var(--color-fg)]"
                            : "border-transparent text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]",
                        )}
                      >
                        {sub.label}
                        <span className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                          active
                            ? "bg-[color:var(--color-blue)]/10 text-[color:var(--color-blue)]"
                            : "bg-[var(--color-surface-mute)] text-[var(--color-fg-mute)]",
                        )}>
                          {sub.count.toLocaleString()}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Active sub-tab content */}
                {catalogSubtab === "products" && (
                  <CatalogVirtualGrid kind="products" totalHint={catalogCounts.products} />
                )}
                {catalogSubtab === "partners" && (
                  <CatalogVirtualGrid kind="partners" totalHint={catalogCounts.partners} />
                )}
                {catalogSubtab === "refs" && (
                  <CatalogVirtualGrid kind="refs" totalHint={catalogCounts.refs} refsByType={catalogCounts.refsByType} />
                )}
              </>
            )}
          </div>
        )}

        {tab === "sku" && (
          <div className="grid gap-4">
            <SectionTitle title={tSections("sku")} description={tHelp("sku")} />
            <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
              <div className="max-h-[500px] overflow-auto">
                {productMappings.length === 0 ? (
                  <p className="p-6 text-center text-sm text-[var(--color-fg-mute)]">
                    No SKU mappings yet. They are created automatically when you resolve products in the review workspace.
                  </p>
                ) : (
                  <MappingsGrid mappings={productMappings} />
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "profiles" && (
          <div className="grid gap-4">
            <SectionTitle title={tSections("profiles")} description={tHelp("profiles")} />
            <div className="flex flex-wrap gap-2">
              {FLOWS.map((flow) => (
                <Button
                  key={flow.id}
                  variant="secondary"
                  onClick={() => void createProfile(flow.id)}
                  disabled={creatingProfile !== null}
                >
                  {creatingProfile === flow.id ? <Loader2 className="size-4 animate-spin" /> : null}
                  New {flow.label}
                </Button>
              ))}
            </div>
            <div className="grid gap-2">
              {exportProfiles.length === 0 ? (
                <p className="text-sm text-[var(--color-fg-mute)]">
                  No export profiles configured.
                </p>
              ) : (
                exportProfiles.map((profile) => (
                  <article
                    key={profile.id}
                    className="grid gap-2 border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-[var(--color-fg)]">{profile.name}</p>
                        <p className="font-mono text-xs text-[var(--color-fg-mute)]">
                          {profile.root_model}
                          {profile.line_model ? ` + ${profile.line_model}` : ""}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-mute)]">
                        {profile.flow}
                        <HelpTip text={tHelp("profilesFlow")} label={tUi("showHelp")} />
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="h-8 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs"
                        value={draftIdByProfile[profile.id] ?? ""}
                        onChange={(event) =>
                          setDraftIdByProfile((current) => ({
                            ...current,
                            [profile.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select draft…</option>
                        {draftOptions.map((draft) => (
                          <option key={draft.id} value={draft.id}>
                            {draft.po_number ?? draft.id.slice(0, 8)} ·{" "}
                            {draft.customer_name ?? "Unknown"}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        onClick={() =>
                          void runProfile(profile.id, draftIdByProfile[profile.id] ?? "")
                        }
                        disabled={runningExport !== null}
                      >
                        {runningExport === profile.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Play className="size-4" />
                        )}
                        Run export
                      </Button>
                      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-mute)]">
                        <HelpTip text={tHelp("profilesRun")} label={tUi("showHelp")} />
                      </span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        )}

        {tab === "runs" && (
          <div className="grid gap-4">
            <SectionTitle title={tSections("runs")} description={tHelp("runs")} />
            <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
            {exportRuns.length === 0 ? (
              <p className="p-3 text-sm text-[var(--color-fg-mute)]">No runs yet.</p>
            ) : (
              <RunsGrid runs={exportRuns} />
            )}
            </div>
          </div>
        )}

          </div>{/* end scroll area */}
        </div>{/* end content column */}
      </div>
    </TooltipProvider>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid gap-0.5">
      <h3 className="text-sm font-semibold text-[var(--color-fg)]">{title}</h3>
      <p className="text-xs text-[var(--color-fg-mute)]">{description}</p>
    </div>
  );
}

function HelpTip({ text, label = "Show help" }: { text: string; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-4 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-surface-mute)] hover:text-[var(--color-fg)]"
          aria-label={label}
        >
          <CircleHelp className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        <p>{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ── Shared helpers ──────────────────────────────────────────────────────────

const REF_TYPE_LABELS: Record<string, string> = {
  currencies: "Currencies",
  taxes: "Taxes",
  uoms: "Units of measure",
  warehouses: "Warehouses",
  carriers: "Carriers",
  payment_terms: "Payment terms",
  sales_teams: "Sales teams",
};

const PAGE_SIZE = 50;

// ── CatalogVirtualGrid ──────────────────────────────────────────────────────

type CatalogKind = "products" | "partners" | "refs";

type CatalogRow = Record<string, unknown>;

interface CatalogVirtualGridProps {
  kind: CatalogKind;
  totalHint: number;
  refsByType?: Record<string, number>;
}

function CatalogVirtualGrid({ kind, totalHint, refsByType }: CatalogVirtualGridProps) {
  const tToasts = useTranslations("integrations.odoo.toasts");
  const [data, setData] = useState<CatalogRow[]>([]);
  const [total, setTotal] = useState(totalHint);
  const [nextPage, setNextPage] = useState(1);
  const [isFetching, setIsFetching] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [refType, setRefType] = useState("");
  const resetKeyRef = useRef(0);
  const hasMore = data.length < total;

  // Build columns per kind
  const columns = useColumns(kind);

  // Reset + fetch from page 1 when search/refType changes
  useEffect(() => {
    const t = setTimeout(() => {
      resetKeyRef.current += 1;
      setData([]);
      setNextPage(1);
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    resetKeyRef.current += 1;
    setData([]);
    setNextPage(1);
  }, [refType]);

  // Fetch a page and append
  const fetchMore = useCallback(async () => {
    if (isFetching) return;
    setIsFetching(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(PAGE_SIZE) });
      if (search) params.set("q", search);
      if (kind === "refs" && refType) params.set("type", refType);
      const res = await fetch(`/api/integrations/odoo/catalog/${kind}?${params}`);
      if (!res.ok) throw new Error("fetch_failed");
      const body = (await res.json()) as { items: CatalogRow[]; total: number };
      setData((prev) => [...prev, ...(body.items ?? [])]);
      setTotal(body.total ?? 0);
      setNextPage((p) => p + 1);
    } catch {
      toast.error(tToasts("catalogKindLoadFailed", { kind }));
    } finally {
      setIsFetching(false);
    }
  }, [isFetching, nextPage, search, refType, kind]);

  // Initial load
  useEffect(() => {
    void fetchMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, refType]);

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => String(row.external_id ?? Math.random()),
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: "onChange",
  });

  return (
    <div className="grid gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={
              kind === "products" ? "Search by code, name, barcode…" :
              kind === "partners" ? "Search by name, VAT, email…" : "Search references…"
            }
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {kind === "refs" && refsByType && (
          <select
            value={refType}
            onChange={(e) => setRefType(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-sm"
          >
            <option value="">All types</option>
            {Object.entries(refsByType).map(([type, count]) => (
              <option key={type} value={type}>
                {REF_TYPE_LABELS[type] ?? type} ({count})
              </option>
            ))}
          </select>
        )}
        {isFetching && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {data.length.toLocaleString()} / {total.toLocaleString()}
        </span>
      </div>

      {/* Virtual DataGrid */}
      <DataGrid
        table={table}
        recordCount={data.length}
        tableLayout={{ columnsResizable: true, headerSticky: true }}
        tableClassNames={{ headerSticky: "sticky top-0 z-10 bg-muted/90 backdrop-blur-xs" }}
      >
        <DataGridScrollArea key={resetKeyRef.current} className="h-[60vh]">
          <DataGridTableVirtual
            estimateSize={48}
            onFetchMore={fetchMore}
            isFetchingMore={isFetching}
            hasMore={hasMore}
          />
        </DataGridScrollArea>
      </DataGrid>
    </div>
  );
}

function useColumns(kind: CatalogKind): ColumnDef<CatalogRow>[] {
  if (kind === "products") {
    return [
      {
        id: "image",
        size: 48,
        enableSorting: false,
        enableResizing: false,
        header: () => null,
        cell: ({ row }) => {
          const img = row.original.image_128 as string | null;
          const name = String(row.original.name ?? "");
          return (
            <Avatar className="size-8 rounded-md">
              {img && <AvatarImage src={`data:image/png;base64,${img}`} alt={name} className="object-cover" />}
              <AvatarFallback className="rounded-md text-[10px]">
                {name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          );
        },
      },
      {
        accessorKey: "code",
        size: 120,
        header: ({ column }) => <DataGridColumnHeader title="Code" column={column} />,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{(row.original.code as string) ?? "—"}</span>
        ),
      },
      {
        accessorKey: "name",
        size: 300,
        header: ({ column }) => <DataGridColumnHeader title="Name" column={column} />,
        cell: ({ row }) => <span className="font-medium">{row.original.name as string}</span>,
      },
      {
        accessorKey: "barcode",
        size: 140,
        header: ({ column }) => <DataGridColumnHeader title="Barcode" column={column} />,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{(row.original.barcode as string) ?? "—"}</span>
        ),
      },
      {
        accessorKey: "uom",
        size: 80,
        header: ({ column }) => <DataGridColumnHeader title="UoM" column={column} />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{(row.original.uom as string) ?? "—"}</span>
        ),
      },
    ];
  }

  if (kind === "partners") {
    return [
      {
        accessorKey: "external_id",
        size: 90,
        header: ({ column }) => <DataGridColumnHeader title="ID" column={column} />,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{(row.original.external_id as string) ?? "—"}</span>
        ),
      },
      {
        accessorKey: "name",
        size: 220,
        header: ({ column }) => <DataGridColumnHeader title="Name" column={column} />,
        cell: ({ row }) => <span className="font-medium">{row.original.name as string}</span>,
      },
      {
        accessorKey: "vat",
        size: 120,
        header: ({ column }) => <DataGridColumnHeader title="VAT" column={column} />,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{(row.original.vat as string) ?? "—"}</span>
        ),
      },
      {
        accessorKey: "email",
        size: 190,
        header: ({ column }) => <DataGridColumnHeader title="Email" column={column} />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{(row.original.email as string) ?? "—"}</span>
        ),
      },
      {
        accessorKey: "city",
        size: 120,
        header: ({ column }) => <DataGridColumnHeader title="City" column={column} />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{(row.original.city as string) ?? "—"}</span>
        ),
      },
      {
        accessorKey: "country",
        size: 120,
        header: ({ column }) => <DataGridColumnHeader title="Country" column={column} />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{(row.original.country as string) ?? "—"}</span>
        ),
      },
    ];
  }

  // refs
  return [
    {
      accessorKey: "catalog_type",
      size: 140,
      header: ({ column }) => <DataGridColumnHeader title="Type" column={column} />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {REF_TYPE_LABELS[row.original.catalog_type as string] ?? (row.original.catalog_type as string)}
        </span>
      ),
    },
    {
      accessorKey: "code",
      size: 100,
      header: ({ column }) => <DataGridColumnHeader title="Code" column={column} />,
      cell: ({ row }) => (
        <span className="font-mono text-xs">{(row.original.code as string) ?? "—"}</span>
      ),
    },
    {
      accessorKey: "name",
      size: 260,
      header: ({ column }) => <DataGridColumnHeader title="Name" column={column} />,
      cell: ({ row }) => <span className="font-medium">{row.original.name as string}</span>,
    },
  ];
}

// ── ModelFieldsGrid ─────────────────────────────────────────────────────────

function ModelFieldsGrid({
  fields,
  tHelp,
  tUi,
}: {
  fields: IntegrationField[];
  tHelp: ReturnType<typeof useTranslations>;
  tUi: ReturnType<typeof useTranslations>;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns: ColumnDef<IntegrationField>[] = [
    {
      accessorKey: "field_name",
      size: 220,
      header: ({ column }) => (
        <span className="inline-flex items-center gap-1.5">
          <DataGridColumnHeader title="Field" column={column} />
          <HelpTip text={tHelp("schemaField")} label={tUi("showHelp")} />
        </span>
      ),
      cell: ({ row }) => (
        <div>
          <p className="font-mono text-xs">{row.original.field_name}</p>
          <p className="text-xs text-muted-foreground">{row.original.field_label ?? row.original.field_name}</p>
        </div>
      ),
    },
    {
      accessorKey: "field_type",
      size: 160,
      header: ({ column }) => (
        <span className="inline-flex items-center gap-1.5">
          <DataGridColumnHeader title="Type" column={column} />
          <HelpTip text={tHelp("schemaType")} label={tUi("showHelp")} />
        </span>
      ),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.field_type}
          {row.original.relation_model ? ` → ${row.original.relation_model}` : ""}
        </span>
      ),
    },
    {
      accessorKey: "required",
      size: 80,
      header: () => <span className="text-xs">Required</span>,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.required ? "Yes" : "No"}</span>,
    },
    {
      accessorKey: "writeable",
      size: 80,
      header: () => <span className="text-xs">Writable</span>,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.writeable ? "Yes" : "No"}</span>,
    },
  ];

  const table = useReactTable({
    data: fields,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <DataGrid table={table} recordCount={fields.length} tableLayout={{ headerSticky: true }}
      tableClassNames={{ headerSticky: "sticky top-0 z-10 bg-muted/90 backdrop-blur-xs" }}>
      <DataGridScrollArea className="h-[460px]">
        <DataGridTable />
      </DataGridScrollArea>
    </DataGrid>
  );
}

// ── MappingsGrid ────────────────────────────────────────────────────────────

function MappingsGrid({ mappings }: { mappings: ProductMapping[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns: ColumnDef<ProductMapping>[] = [
    {
      accessorKey: "source_sku",
      size: 160,
      header: ({ column }) => <DataGridColumnHeader title="Source SKU" column={column} />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.source_sku ?? "—"}</span>,
    },
    {
      accessorKey: "source_company_sku",
      size: 160,
      header: ({ column }) => <DataGridColumnHeader title="Company SKU" column={column} />,
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.source_company_sku ?? "—"}</span>,
    },
    {
      accessorKey: "odoo_product_name",
      size: 280,
      header: ({ column }) => <DataGridColumnHeader title="ERP product" column={column} />,
      cell: ({ row }) => <span className="text-sm">{row.original.odoo_product_name}</span>,
    },
  ];

  const table = useReactTable({
    data: mappings,
    columns,
    getRowId: (r) => r.id,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <DataGrid table={table} recordCount={mappings.length} tableLayout={{ headerSticky: true }}
      tableClassNames={{ headerSticky: "sticky top-0 z-10 bg-muted/90 backdrop-blur-xs" }}>
      <DataGridScrollArea className="h-[480px]">
        <DataGridTable />
      </DataGridScrollArea>
    </DataGrid>
  );
}

// ── RunsGrid ────────────────────────────────────────────────────────────────

function RunsGrid({ runs }: { runs: ExportRun[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);

  const columns: ColumnDef<ExportRun>[] = [
    {
      accessorKey: "created_at",
      size: 160,
      header: ({ column }) => <DataGridColumnHeader title="Date" column={column} />,
      cell: ({ row }) => <span className="text-xs">{new Date(row.original.created_at).toLocaleString()}</span>,
    },
    {
      accessorKey: "status",
      size: 100,
      header: ({ column }) => <DataGridColumnHeader title="Status" column={column} />,
      cell: ({ row }) => <span className="text-xs font-medium">{row.original.status}</span>,
    },
    {
      accessorKey: "external_name",
      size: 200,
      header: ({ column }) => <DataGridColumnHeader title="External" column={column} />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.external_name ?? row.original.external_id ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "order_draft_id",
      size: 100,
      header: ({ column }) => <DataGridColumnHeader title="Draft" column={column} />,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.order_draft_id?.slice(0, 8) ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "error_message",
      size: 260,
      header: ({ column }) => <DataGridColumnHeader title="Error" column={column} />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.error_message ?? "—"}</span>
      ),
    },
  ];

  const table = useReactTable({
    data: runs,
    columns,
    getRowId: (r) => r.id,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <DataGrid table={table} recordCount={runs.length} tableLayout={{ headerSticky: true }}
      tableClassNames={{ headerSticky: "sticky top-0 z-10 bg-muted/90 backdrop-blur-xs" }}>
      <DataGridScrollArea className="h-[480px]">
        <DataGridTable />
      </DataGridScrollArea>
    </DataGrid>
  );
}
