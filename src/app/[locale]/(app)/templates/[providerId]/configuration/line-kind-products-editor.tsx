//
// Editor de mapping kind → product_id de ERP para este provider.
// Permite asociar cada tipo no-item (discount, freight, surcharge, adjustment)
// a un producto especial pre-creado en ERP. Cuando una orden de ese provider
// llega con líneas de ese kind, odoo-sync usa estos product_ids en vez de
// intentar resolver el SKU como un item normal.
//
// Si una kind queda sin product configurado, odoo-sync hace fallback a la
// resolución de item normal — el flujo no rompe, pero el operador tendrá que
// resolver el SKU manualmente en el review.

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Receipt, Save, Truck, Tag, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OdooProductOption {
  id: number;
  name: string;
  default_code: string | null;
}

interface LineKindProductsMap {
  discount?: number | null;
  freight?: number | null;
  surcharge?: number | null;
  adjustment?: number | null;
}

interface Props {
  providerId: string;
  initial: LineKindProductsMap;
  currentSettings: Record<string, unknown>;
  products: OdooProductOption[];
}

type KindKey = keyof LineKindProductsMap;

const KIND_META: Record<
  KindKey,
  { label: string; description: string; icon: React.ReactNode; chipClass: string }
> = {
  discount: {
    label: "Descuento",
    description: "Líneas negativas que reducen el total del PO (descuentos por volumen, promociones, créditos).",
    icon: <Tag size={13} />,
    chipClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  freight: {
    label: "Flete / Shipping",
    description: "Cargos de envío, transporte o handling cobrados como una línea aparte.",
    icon: <Truck size={13} />,
    chipClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  surcharge: {
    label: "Recargo / Surcharge",
    description: "Fuel surcharge, environmental fee, residential surcharge u otros cargos extra.",
    icon: <Plus size={13} />,
    chipClass: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  adjustment: {
    label: "Ajuste / Adjustment",
    description: "Correcciones manuales de precio, redondeos o cargos misceláneos no clasificables.",
    icon: <Settings2 size={13} />,
    chipClass: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  },
};

export function LineKindProductsEditor({ providerId, initial, currentSettings, products }: Props) {
  const [values, setValues] = useState<LineKindProductsMap>(initial);
  const [saving, setSaving] = useState(false);

  const productById = new Map(products.map((p) => [p.id, p]));
  const dirty =
    initial.discount !== values.discount ||
    initial.freight !== values.freight ||
    initial.surcharge !== values.surcharge ||
    initial.adjustment !== values.adjustment;

  function update(kind: KindKey, productId: number | null) {
    setValues((prev) => ({ ...prev, [kind]: productId }));
  }

  async function save() {
    setSaving(true);
    try {
      const cleaned: Record<string, number> = {};
      for (const [kind, id] of Object.entries(values)) {
        if (typeof id === "number" && Number.isFinite(id)) {
          cleaned[kind] = id;
        }
      }
      const res = await fetch(`/api/settings/providers/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            ...currentSettings,
            line_kind_products: Object.keys(cleaned).length > 0 ? cleaned : null,
          },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Mapping de tipos de línea guardado");
    } catch {
      toast.error("No se pudo guardar el mapping");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <p className="mb-3 text-xs font-semibold tracking-wide text-[var(--color-fg-subtle)] uppercase">
        Mapping de tipos de línea
      </p>
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-mute)]">
            <Receipt size={12} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--color-fg)]">
              Productos especiales por tipo de línea
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-fg-mute)] max-w-prose">
              Cuando el extractor IA identifica una línea como descuento, flete, recargo o ajuste,
              odoo-sync usa estos productos especiales en lugar de tratar la línea como un item normal.
              Si no asocias producto a un tipo, ese tipo se trata como un item común y el operador
              resuelve el SKU manualmente en el review.
            </p>

            <div className="mt-4 space-y-3">
              {(Object.keys(KIND_META) as KindKey[]).map((kind) => {
                const meta = KIND_META[kind];
                const current = values[kind] ?? null;
                const currentProduct = current ? productById.get(current) : null;
                return (
                  <div key={kind} className="grid gap-2 sm:grid-cols-[1fr_2fr] sm:items-center sm:gap-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex size-6 items-center justify-center rounded-md ${meta.chipClass}`}
                      >
                        {meta.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium text-[var(--color-fg)]">{meta.label}</p>
                        <p className="text-[10px] text-[var(--color-fg-mute)]">{meta.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={current ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          update(kind, v === "" ? null : Number(v));
                        }}
                        className="flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-fg)] focus:border-[var(--color-fg)] focus:outline-none"
                      >
                        <option value="">— sin producto (tratar como item) —</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.default_code ? ` (${p.default_code})` : ""}
                          </option>
                        ))}
                      </select>
                      {currentProduct && (
                        <span className="shrink-0 font-mono text-[10px] text-[var(--color-fg-subtle)]">
                          #{currentProduct.id}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="default"
                disabled={!dirty || saving}
                onClick={() => void save()}
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save size={13} />}
                {saving ? "Guardando…" : dirty ? "Guardar cambios" : "Sin cambios"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
