"use client";

import { Button } from "@/components/ui/button";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type CustomerMappingItem = {
  id: string;
  match_key: string;
  odoo_partner_id: number;
  odoo_partner_name: string;
  created_at: string;
};

interface CustomerMappingsSectionProps {
  initialItems: CustomerMappingItem[];
}

export function CustomerMappingsSection({ initialItems }: CustomerMappingsSectionProps) {
  const t = useTranslations("settings.mappings");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [items, setItems] = useState(initialItems);
  const [extractedName, setExtractedName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/settings/mappings/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extracted_name: extractedName,
          odoo_partner_name: partnerName,
          odoo_partner_id: partnerId.trim() ? Number(partnerId) : null,
        }),
      });

      if (!response.ok) {
        throw new Error("create_failed");
      }

      const body = (await response.json()) as { item?: CustomerMappingItem };
      if (body.item) {
        setItems((current) => [body.item!, ...current]);
      }
      setExtractedName("");
      setPartnerName("");
      setPartnerId("");
      toast.success(t("addSuccess"));
    } catch {
      toast.error(t("addFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);

    try {
      const response = await fetch(`/api/settings/mappings/customers/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("delete_failed");
      }

      setItems((current) => current.filter((item) => item.id !== id));
      toast.success(t("deleteSuccess"));
    } catch {
      toast.error(t("deleteFailed"));
    } finally {
      setDeletingId(null);
    }
  }

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="grid gap-4">
      <div>
        <h3 className="text-sm font-medium text-[var(--color-fg)]">{t("customersTitle")}</h3>
        <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">{t("customersDescription")}</p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-[var(--color-fg-mute)] uppercase">
              {t("form.extractedName")}
            </span>
            <input
              value={extractedName}
              onChange={(event) => setExtractedName(event.target.value)}
              required
              disabled={submitting}
              className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-fg)] transition-colors duration-[120ms] outline-none placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-fg)] disabled:bg-[var(--color-surface-mute)] disabled:text-[var(--color-fg-subtle)]"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-[var(--color-fg-mute)] uppercase">
              {t("form.partnerName")}
            </span>
            <input
              value={partnerName}
              onChange={(event) => setPartnerName(event.target.value)}
              required
              disabled={submitting}
              className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-fg)] transition-colors duration-[120ms] outline-none placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-fg)] disabled:bg-[var(--color-surface-mute)] disabled:text-[var(--color-fg-subtle)]"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-[var(--color-fg-mute)] uppercase">
              {t("form.partnerId")}
            </span>
            <input
              type="number"
              min={0}
              value={partnerId}
              onChange={(event) => setPartnerId(event.target.value)}
              disabled={submitting}
              className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-fg)] transition-colors duration-[120ms] outline-none placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-fg)] disabled:bg-[var(--color-surface-mute)] disabled:text-[var(--color-fg-subtle)]"
            />
          </label>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus size={14} />}
            {t("form.add")}
          </Button>
        </div>
      </form>

      {!items.length ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--color-fg-mute)]">{t("emptyCustomers")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg)]">
              <tr className="border-b border-[var(--color-border)]">
                <Th>{t("columns.extractedName")}</Th>
                <Th>{t("columns.partnerName")}</Th>
                <Th>{t("columns.partnerId")}</Th>
                <Th>{t("columns.createdAt")}</Th>
                <Th>{t("columns.actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="group/row border-b border-[var(--color-border)] transition-colors duration-[120ms] hover:bg-[var(--color-surface-mute)]"
                >
                  <Td>{item.match_key}</Td>
                  <Td>{item.odoo_partner_name}</Td>
                  <Td className="font-mono text-[var(--color-fg-subtle)]">
                    {item.odoo_partner_id || "—"}
                  </Td>
                  <Td className="text-[var(--color-fg-subtle)]">
                    {dateFormatter.format(new Date(item.created_at))}
                  </Td>
                  <Td>
                    <div className="flex justify-end opacity-0 transition-opacity duration-[120ms] group-hover/row:opacity-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={deletingId === item.id}
                        onClick={() => onDelete(item.id)}
                        aria-label={tCommon("delete")}
                        className={cn(
                          "size-8 text-[var(--color-fg-mute)] hover:bg-[color:var(--color-rose)]/10 hover:text-[color:var(--color-rose)]",
                        )}
                      >
                        {deletingId === item.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 size={13} aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="px-3 py-2.5 text-left text-xs font-medium tracking-wide text-[var(--color-fg-mute)] uppercase">
      {children}
    </th>
  );
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={`px-3 py-2.5 align-middle text-[var(--color-fg)] ${className ?? ""}`}>
      {children}
    </td>
  );
}
