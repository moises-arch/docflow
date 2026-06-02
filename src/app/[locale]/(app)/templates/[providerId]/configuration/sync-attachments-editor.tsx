"use client";

import { useState } from "react";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type AttachmentKey = "original" | "po_pdf" | "packing_slip";

type AttachmentConfig = {
  enabled: boolean;
};

type AttachmentsSettings = {
  original: AttachmentConfig;
  po_pdf: AttachmentConfig;
  packing_slip: AttachmentConfig;
};

function parseAttachments(initialSettings: Record<string, unknown>): AttachmentsSettings {
  const raw = initialSettings?.attachments as Record<string, unknown> | undefined;
  return {
    original: {
      enabled:
        typeof (raw?.original as Record<string, unknown> | undefined)?.enabled === "boolean"
          ? ((raw?.original as Record<string, unknown>).enabled as boolean)
          : true,
    },
    po_pdf: {
      enabled:
        typeof (raw?.po_pdf as Record<string, unknown> | undefined)?.enabled === "boolean"
          ? ((raw?.po_pdf as Record<string, unknown>).enabled as boolean)
          : false,
    },
    packing_slip: {
      enabled:
        typeof (raw?.packing_slip as Record<string, unknown> | undefined)?.enabled === "boolean"
          ? ((raw?.packing_slip as Record<string, unknown>).enabled as boolean)
          : false,
    },
  };
}

export function SyncAttachmentsEditor({
  providerId,
  initialSettings,
}: {
  providerId: string;
  initialSettings: Record<string, unknown>;
}) {
  const [attachments, setAttachments] = useState<AttachmentsSettings>(() =>
    parseAttachments(initialSettings),
  );
  const [currentSettings] = useState<Record<string, unknown>>(initialSettings);
  const [saving, setSaving] = useState(false);

  async function toggleAttachment(key: AttachmentKey, enabled: boolean) {
    const next: AttachmentsSettings = {
      ...attachments,
      [key]: { enabled },
    };
    setAttachments(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/providers/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            ...currentSettings,
            attachments: next,
          },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Configuración de adjuntos actualizada");
    } catch {
      toast.error("Error al actualizar adjuntos");
      // revert on error
      setAttachments(attachments);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid size-7 place-items-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg-mute)]">
          <Paperclip size={14} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium text-[var(--color-fg)]">
            Documentos adjuntos al sync de ERP
          </p>
          <p className="text-xs text-[var(--color-fg-subtle)]">
            Selecciona qué documentos se envían como adjuntos al Sales Order de ERP al sincronizar.
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        <AttachmentRow
          label="Documento original"
          description="El PDF o archivo original recibido"
          enabled={attachments.original.enabled}
          disabled={saving}
          onChange={(v) => void toggleAttachment("original", v)}
        />
        <AttachmentRow
          label="Purchase Order (PDF)"
          description="Render profesional de la orden de compra"
          enabled={attachments.po_pdf.enabled}
          disabled={saving}
          onChange={(v) => void toggleAttachment("po_pdf", v)}
        />
        <AttachmentRow
          label="Packing Slip (PDF)"
          description="Documento de despacho sin precios"
          enabled={attachments.packing_slip.enabled}
          disabled={saving}
          onChange={(v) => void toggleAttachment("packing_slip", v)}
        />
      </div>
    </section>
  );
}

function AttachmentRow({
  label,
  description,
  enabled,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  enabled: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)]",
        "bg-[var(--color-surface)] px-4 py-3",
      )}
    >
      <div>
        <p className="text-sm font-medium text-[var(--color-fg)]">{label}</p>
        <p className="text-xs text-[var(--color-fg-subtle)]">{description}</p>
      </div>
      <Switch
        checked={enabled}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={label}
      />
    </div>
  );
}
