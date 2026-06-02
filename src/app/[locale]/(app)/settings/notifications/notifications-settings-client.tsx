"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/app/rich-text-editor";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Trash2,
  Plus,
  RotateCcw,
  Save,
  Mail,
  CheckCircle2,
  CalendarClock,
  Info,
  Eye,
  Send,
  Loader2,
  Shield,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { EmailPreviewDialog } from "@/components/app/email-preview-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type RecipientType = "order_approved" | "daily_digest" | "all";
type Recipient = { id: string; email: string; name: string | null; type: RecipientType; active: boolean };
type EmailTemplate = { id: string; type: string; subject: string; intro: string; updated_at: string };

interface Props { tenantId: string; isOwner: boolean }

export function NotificationsSettingsClient({ isOwner }: Props) {
  const t = useTranslations("notificationsSettings");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<RecipientType>("all");
  const [adding, setAdding] = useState(false);
  const [editedTemplates, setEditedTemplates] = useState<Record<string, { subject: string; intro: string }>>({});
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState<"order_approved" | "daily_digest" | null>(null);
  const [testSendOpen, setTestSendOpen] = useState<"order_approved" | "daily_digest" | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  type ProbeCheck = { name: string; ok: boolean; detail?: string; hint?: string };
  type ProbeResult = { ok: boolean; from: string; checks: ProbeCheck[] };
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);

  function labelForCheck(name: string): string {
    const map: Record<string, string> = {
      env_vars: "Variables de entorno en Vercel",
      graph_token: "Token de Email provider",
      scope_mail_send: "Permiso Mail.Send en el token",
      mailbox_exists: "Buzón existe en el tenant",
      mailbox_access: "Application Access Policy de Exchange",
    };
    return map[name] ?? name;
  }

  async function runProbe() {
    setProbing(true);
    setProbeResult(null);
    try {
      const res = await fetch("/api/integrations/m365/probe", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as ProbeResult & { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setProbeResult(body);
      if (body.ok) {
        toast.success("Email provider listo para enviar emails");
      } else {
        toast.error("Hay 1 o más checks fallando — revisá el panel");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setProbing(false);
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    const [rRes, tRes] = await Promise.all([
      fetch("/api/settings/notifications/recipients"),
      fetch("/api/settings/notifications/templates"),
    ]);
    if (rRes.ok) {
      const d = (await rRes.json()) as { recipients: Recipient[] };
      setRecipients(d.recipients);
    }
    if (tRes.ok) {
      const d = (await tRes.json()) as { templates: EmailTemplate[] };
      setTemplates(d.templates);
      const init: Record<string, { subject: string; intro: string }> = {};
      d.templates.forEach((tmpl) => { init[tmpl.type] = { subject: tmpl.subject, intro: tmpl.intro }; });
      setEditedTemplates(init);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  async function addRecipient() {
    if (!newEmail.trim()) return;
    setAdding(true);
    const res = await fetch("/api/settings/notifications/recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail.trim(), name: newName.trim() || null, type: newType }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(body.error ?? t("addError"));
    } else {
      toast.success(t("recipientAdded"));
      setNewEmail(""); setNewName("");
      await loadData();
    }
    setAdding(false);
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/settings/notifications/recipients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    setRecipients((prev) => prev.map((r) => r.id === id ? { ...r, active } : r));
  }

  async function deleteRecipient(id: string) {
    const res = await fetch(`/api/settings/notifications/recipients/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRecipients((prev) => prev.filter((r) => r.id !== id));
      toast.success(t("recipientDeleted"));
    }
  }

  async function saveTemplate(type: string) {
    const edited = editedTemplates[type];
    if (!edited) return;
    setSavingTemplate(type);
    const res = await fetch(`/api/settings/notifications/templates/${type}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edited),
    });
    setSavingTemplate(null);
    if (res.ok) toast.success(t("templateSaved"));
    else toast.error(t("templateSaveError"));
  }

  async function sendTestEmail(type: "order_approved" | "daily_digest") {
    const edited = editedTemplates[type];
    setSendingTest(true);
    try {
      const res = await fetch(`/api/settings/notifications/templates/${type}/test-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: edited?.subject,
          intro: edited?.intro,
          to: testEmail.trim() || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        to?: string;
        via?: string;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        toast.error(body.error ?? "No se pudo enviar el email de prueba");
        return;
      }
      toast.success(`Email de prueba enviado`, {
        description: `Vía ${body.via ?? "—"} a ${body.to ?? testEmail}`,
      });
      setTestSendOpen(null);
      setTestEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSendingTest(false);
    }
  }

  async function resetTemplate(type: string) {
    const res = await fetch(`/api/settings/notifications/templates/${type}/reset`, { method: "POST" });
    if (res.ok) {
      const body = (await res.json()) as { defaults: { subject: string; intro: string } };
      setEditedTemplates((prev) => ({ ...prev, [type]: body.defaults }));
      toast.success(t("templateReset"));
    }
  }

  const typeLabel: Record<RecipientType, string> = {
    order_approved: t("typeOrderApproved"),
    daily_digest: t("typeDailyDigest"),
    all: t("typeAll"),
  };

  const templateLabel: Record<string, string> = {
    order_approved: t("typeOrderApproved"),
    daily_digest: t("typeDailyDigest"),
  };

  if (loading) return <div className="p-6 text-[12px] text-muted-foreground">{t("loading")}</div>;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-[12.5px] text-muted-foreground mt-1.5 leading-relaxed">
          {t("pageSubtitle")}
        </p>
      </div>

      {/* Tipos de emails que envía el sistema */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Mail size={14} className="text-violet-500 dark:text-violet-400" />
          <h2 className="text-[14px] font-semibold">Emails automáticos que envía DocFlow</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-2.5">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={14} />
              </div>
              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold">Orden aprobada</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Se dispara al instante cuando una orden se sincroniza a ERP.
                </p>
                <p className="mt-2 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                  • Trigger: aprobación del draft
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-2.5">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <CalendarClock size={14} />
              </div>
              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold">Reporte diario</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Resumen de actividad + errores del período.
                </p>
                <p className="mt-2 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                  • Trigger: 8:00 AM y 3:00 PM (hora Panamá)
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2.5">
          <Info size={12} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <p className="text-[11px] text-blue-900 dark:text-blue-300">
            Los emails salen desde <strong className="font-semibold">orders@example.com</strong> usando Email provider. Para que un destinatario reciba un email, debe estar agregado abajo y marcado como <em>activo</em>.
          </p>
        </div>

        {/* M365 probe — verifica config sin enviar */}
        {isOwner && (
          <div className="mt-3 rounded-md border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shield size={12} className="shrink-0 text-violet-600 dark:text-violet-400" />
                <div>
                  <p className="text-[12px] font-semibold">Verificar conexión Email provider</p>
                  <p className="text-[10px] text-muted-foreground">
                    Chequea token, scopes y acceso al buzón. No envía emails ni gasta cuota.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={runProbe}
                disabled={probing}
                className="h-7 text-[11px] shrink-0"
              >
                {probing ? <Loader2 className="size-3 animate-spin" /> : <Shield className="size-3" />}
                {probing ? "Verificando…" : "Verificar"}
              </Button>
            </div>

            {probeResult && (
              <div className="mt-3 space-y-1.5">
                {probeResult.checks.map((c) => (
                  <div
                    key={c.name}
                    className="flex items-start gap-2 rounded border border-border bg-background px-2.5 py-2 text-[11px]"
                  >
                    {c.ok ? (
                      <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle size={12} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={c.ok ? "font-medium text-foreground" : "font-medium text-red-700 dark:text-red-400"}>
                        {labelForCheck(c.name)}
                      </p>
                      {c.detail && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground break-words">{c.detail}</p>
                      )}
                      {!c.ok && c.hint && (
                        <div className="mt-1.5 flex items-start gap-1.5 rounded bg-amber-500/10 px-2 py-1.5">
                          <AlertCircle size={10} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                          <p className="text-[10px] text-amber-900 dark:text-amber-300 break-words">{c.hint}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground pt-1">
                  {probeResult.ok
                    ? `✓ Listo para enviar desde ${probeResult.from}`
                    : `Resolvé los checks rojos antes de poder enviar emails.`}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Recipients */}
      <section>
        <h2 className="text-[14px] font-semibold mb-4">{t("recipientsTitle")}</h2>
        <div className="rounded-lg border border-border divide-y divide-border">
          {recipients.length === 0 && (
            <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">{t("noRecipients")}</div>
          )}
          {recipients.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium truncate">{r.email}</p>
                <p className="text-[11px] text-muted-foreground">
                  {r.name ? `${r.name} · ` : ""}{typeLabel[r.type]}
                </p>
              </div>
              <Switch checked={r.active} disabled={!isOwner} onCheckedChange={(v) => toggleActive(r.id, v)} />
              {isOwner && (
                <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-red-600"
                  onClick={() => deleteRecipient(r.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {isOwner && (
          <div className="mt-4 rounded-lg border border-dashed border-border p-4 space-y-3">
            <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">{t("addRecipient")}</h3>
            <div className="flex flex-wrap gap-2">
              <Input placeholder={t("emailPlaceholder")} value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                className="h-8 text-[12px] flex-1 min-w-40" onKeyDown={(e) => e.key === "Enter" && addRecipient()} />
              <Input placeholder={t("namePlaceholder")} value={newName} onChange={(e) => setNewName(e.target.value)}
                className="h-8 text-[12px] w-36" />
              <select value={newType} onChange={(e) => setNewType(e.target.value as RecipientType)}
                className="h-8 rounded-md border border-input bg-background px-2 text-[12px]">
                <option value="all">{t("typeAll")}</option>
                <option value="order_approved">{t("typeOrderApproved")}</option>
                <option value="daily_digest">{t("typeDailyDigest")}</option>
              </select>
              <Button size="sm" onClick={addRecipient} disabled={adding} className="h-8">
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Templates */}
      <section>
        <h2 className="text-[14px] font-semibold mb-4">{t("templatesTitle")}</h2>
        <div className="space-y-6">
          {templates.map((tmpl) => {
            const edited = editedTemplates[tmpl.type] ?? { subject: tmpl.subject, intro: tmpl.intro };
            return (
              <div key={tmpl.type} className="rounded-lg border border-border p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[13px] font-semibold">{templateLabel[tmpl.type] ?? tmpl.type}</h3>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => setPreviewOpen(tmpl.type as "order_approved" | "daily_digest")}
                    >
                      <Eye className="size-3" />
                      Preview
                    </Button>
                    {isOwner && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => setTestSendOpen(tmpl.type as "order_approved" | "daily_digest")}
                      >
                        <Send className="size-3" />
                        Enviar prueba
                      </Button>
                    )}
                    {isOwner && (
                      <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground"
                        onClick={() => resetTemplate(tmpl.type)}>
                        <RotateCcw className="size-3" />{t("resetDefaults")}
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">{t("subjectLabel")}</Label>
                  <Input value={edited.subject} disabled={!isOwner} className="mt-1 h-8 text-[12px]"
                    onChange={(e) => setEditedTemplates((p) => ({ ...p, [tmpl.type]: { ...edited, subject: e.target.value } }))} />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">{t("introLabel")}</Label>
                  <div className="mt-1">
                    <RichTextEditor
                      value={edited.intro}
                      onChange={(html) =>
                        setEditedTemplates((p) => ({ ...p, [tmpl.type]: { ...edited, intro: html } }))
                      }
                      disabled={!isOwner}
                      placeholder="Escribí el mensaje de introducción del email…"
                      minRows={4}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    {t(`varsHint.${tmpl.type}` as Parameters<typeof t>[0])}
                  </p>
                </div>
                {isOwner && (
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => saveTemplate(tmpl.type)} disabled={savingTemplate === tmpl.type} className="h-7">
                      <Save className="size-3" />{t("save")}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Preview dialog */}
      {previewOpen && (() => {
        const currentEdited = editedTemplates[previewOpen];
        const subject = currentEdited?.subject ?? "";
        const intro = currentEdited?.intro ?? "";
        return (
          <EmailPreviewDialog
            open={previewOpen !== null}
            onOpenChange={(open) => !open && setPreviewOpen(null)}
            templateType={previewOpen}
            templateLabel={templateLabel[previewOpen] ?? previewOpen}
            subject={subject}
            intro={intro}
          />
        );
      })()}

      {/* Test-send dialog */}
      <Dialog open={testSendOpen !== null} onOpenChange={(open) => !open && !sendingTest && setTestSendOpen(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <Send size={16} />
              </div>
              <div>
                <DialogTitle className="text-[14px] font-semibold">Enviar email de prueba</DialogTitle>
                <DialogDescription className="text-[11px] text-muted-foreground mt-0.5">
                  {testSendOpen ? templateLabel[testSendOpen] ?? testSendOpen : ""}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 text-[12px]">
            <p className="text-foreground">
              Enviá un email de prueba con los valores actuales (sin necesidad de guardar) a la dirección que indiques. Se usa el transporte real (Email provider / Mailgun) — vas a recibir el email tal como llegaría a un destinatario real.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-[11px] text-muted-foreground">
              <li>Los datos del email son ficticios (PO TEST-9260260, etc.)</li>
              <li>El asunto incluye prefijo <code className="rounded bg-muted px-1 text-[10px]">[PRUEBA]</code></li>
              <li>Se cobra contra cuota de envío de Graph/Mailgun</li>
            </ul>
            <div>
              <Label className="text-[11px] text-muted-foreground">Destinatario</Label>
              <Input
                type="email"
                placeholder="dejá vacío para enviar a tu propio email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                disabled={sendingTest}
                className="mt-1 h-8 text-[12px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && testSendOpen) {
                    void sendTestEmail(testSendOpen);
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm" disabled={sendingTest}>Cancelar</Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={() => testSendOpen && sendTestEmail(testSendOpen)}
              disabled={sendingTest}
            >
              {sendingTest ? (
                <><Loader2 className="size-3.5 animate-spin" />Enviando…</>
              ) : (
                <><Send className="size-3.5" />Enviar prueba</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
