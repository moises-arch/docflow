"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2, Mail, PauseCircle, PlayCircle, Plus } from "lucide-react";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { MimeTypePicker } from "@/components/app/mime-type-picker";

export type ImapSource = {
  id: string;
  provider_id: string | null;
  address: string;
  status: "active" | "paused" | "archived";
  allowed_senders: string[];
  created_at: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  imap_username: string;
  imap_mailbox: string;
  imap_mark_seen: boolean;
  imap_last_synced_at: string | null;
  has_password: boolean;
};

type ProviderOption = { id: string; name: string };

type Props = {
  sources: ImapSource[];
  providers: ProviderOption[];
};

const EMPTY_FORM = {
  address: "",
  provider_id: "",
  allowed_senders: "",
  imap_host: "",
  imap_port: "993",
  imap_secure: true,
  imap_username: "",
  imap_password: "",
  imap_mailbox: "INBOX",
  imap_mark_seen: true,
};

type Preset = {
  key: string;
  label: string;
  imap_host: string;
  imap_port: string;
  imap_secure: boolean;
  imap_mailbox: string;
  note?: string;
};

const PRESETS: Preset[] = [
  {
    key: "outlook",
    label: "Outlook / Email provider",
    imap_host: "outlook.office365.com",
    imap_port: "993",
    imap_secure: true,
    imap_mailbox: "INBOX",
    note:
      "Personal Outlook accounts (@outlook.com, @hotmail.com, @live.com): generate an App Password at account.live.com → Security → Advanced → App passwords. " +
      "Email provider business accounts: Basic Auth for IMAP was disabled by Microsoft in 2022. Either ask your tenant admin to re-enable IMAP basic auth, or use the Email provider (Graph) tab instead — it's more reliable.",
  },
  {
    key: "gmail",
    label: "Gmail / Google Workspace",
    imap_host: "imap.gmail.com",
    imap_port: "993",
    imap_secure: true,
    imap_mailbox: "INBOX",
    note:
      "Generate an App Password at myaccount.google.com → Security → 2-Step Verification → App passwords. Regular passwords will not work.",
  },
  {
    key: "yahoo",
    label: "Yahoo Mail",
    imap_host: "imap.mail.yahoo.com",
    imap_port: "993",
    imap_secure: true,
    imap_mailbox: "INBOX",
    note: "Generate an App Password at login.yahoo.com → Account Security → Generate app password.",
  },
  {
    key: "icloud",
    label: "iCloud Mail",
    imap_host: "imap.mail.me.com",
    imap_port: "993",
    imap_secure: true,
    imap_mailbox: "INBOX",
    note: "Generate an app-specific password at appleid.apple.com → Sign-In and Security → App-Specific Passwords.",
  },
  {
    key: "custom",
    label: "Custom server",
    imap_host: "",
    imap_port: "993",
    imap_secure: true,
    imap_mailbox: "INBOX",
  },
];

export function EmailImapClient({ sources, providers }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(sources.length === 0);
  const [presetKey, setPresetKey] = useState<string>("outlook");
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    imap_host: PRESETS[0].imap_host,
    imap_port: PRESETS[0].imap_port,
    imap_secure: PRESETS[0].imap_secure,
    imap_mailbox: PRESETS[0].imap_mailbox,
  }));
  const [busy, setBusy] = useState<"idle" | "test" | "save">("idle");
  const [allowedMimeTypes, setAllowedMimeTypes] = useState<string[]>(["application/pdf"]);

  const activePreset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0];

  function update<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyPreset(key: string) {
    setPresetKey(key);
    const preset = PRESETS.find((p) => p.key === key);
    if (!preset || preset.key === "custom") return;
    setForm((prev) => ({
      ...prev,
      imap_host: preset.imap_host,
      imap_port: preset.imap_port,
      imap_secure: preset.imap_secure,
      imap_mailbox: preset.imap_mailbox,
    }));
  }

  async function testConnection() {
    if (busy !== "idle") return;
    setBusy("test");
    try {
      // Use a placeholder id since the API endpoint requires a path param even
      // for unsaved credentials; the Edge Function ignores it when not using
      // saved creds.
      const res = await fetch(`/api/ingest/email-sources/new/test-imap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imap_host: form.imap_host,
          imap_port: Number(form.imap_port),
          imap_secure: form.imap_secure,
          imap_username: form.imap_username,
          imap_password: form.imap_password,
          imap_mailbox: form.imap_mailbox,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; detail?: string };
      if (res.ok && body.ok) toast.success("IMAP connection OK");
      else toast.error(`IMAP test failed: ${body.detail ?? res.status}`);
    } catch (err) {
      toast.error(`IMAP test error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy("idle");
    }
  }

  async function testSaved(source: ImapSource) {
    setBusy("test");
    try {
      const res = await fetch(`/api/ingest/email-sources/${source.id}/test-imap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ use_saved: true }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; detail?: string };
      if (res.ok && body.ok) toast.success("IMAP connection OK");
      else toast.error(`IMAP test failed: ${body.detail ?? res.status}`);
    } finally {
      setBusy("idle");
    }
  }

  async function saveSource() {
    if (busy !== "idle") return;
    if (!form.address || !form.imap_host || !form.imap_username || !form.imap_password) {
      toast.error("Address, host, username and password are required");
      return;
    }
    setBusy("save");
    try {
      const res = await fetch("/api/ingest/email-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: form.address,
          provider_id: form.provider_id || null,
          allowed_senders: form.allowed_senders,
          adapter: "imap",
          imap_host: form.imap_host,
          imap_port: Number(form.imap_port),
          imap_secure: form.imap_secure,
          imap_username: form.imap_username,
          imap_password: form.imap_password,
          imap_mailbox: form.imap_mailbox,
          imap_mark_seen: form.imap_mark_seen,
          allowed_mime_types: allowedMimeTypes,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      if (!res.ok) {
        toast.error(`Save failed: ${body.detail ?? body.error ?? res.status}`);
        return;
      }
      toast.success("IMAP source saved");
      setForm(EMPTY_FORM);
      setShowForm(false);
      router.refresh();
    } finally {
      setBusy("idle");
    }
  }

  async function updateStatus(id: string, status: "active" | "paused" | "archived") {
    const res = await fetch(`/api/ingest/email-sources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      toast.success("Updated");
      router.refresh();
    } else {
      toast.error("Update failed");
    }
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-fg)]">
              <Mail size={14} /> IMAP mailboxes
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">
              Polled every 3 min via cron. Use App Passwords for accounts with 2FA.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus size={14} className="mr-1" />
            {showForm ? "Cancel" : "Add IMAP source"}
          </Button>
        </div>

        {showForm && (
          <div className="grid gap-3 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] p-3">
            <Field label="Provider preset" hint="Auto-fills host, port and TLS">
              <select
                className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm"
                value={presetKey}
                onChange={(e) => applyPreset(e.target.value)}
              >
                {PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>

            {activePreset.note ? (
              <div className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                {activePreset.note}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Address" hint="ordenes@example.com">
                <Input
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                  placeholder="ordenes@example.com"
                />
              </Field>
              <Field label="Provider (optional)">
                <select
                  className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm"
                  value={form.provider_id}
                  onChange={(e) => update("provider_id", e.target.value)}
                >
                  <option value="">— Auto-detect —</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="IMAP host">
                <Input
                  value={form.imap_host}
                  onChange={(e) => update("imap_host", e.target.value)}
                  placeholder="imap.gmail.com"
                />
              </Field>
              <Field label="Port">
                <Input
                  type="number"
                  value={form.imap_port}
                  onChange={(e) => update("imap_port", e.target.value)}
                />
              </Field>
              <Field label="TLS">
                <select
                  className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm"
                  value={form.imap_secure ? "1" : "0"}
                  onChange={(e) => update("imap_secure", e.target.value === "1")}
                >
                  <option value="1">TLS (993)</option>
                  <option value="0">STARTTLS (143)</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Username">
                <Input
                  value={form.imap_username}
                  onChange={(e) => update("imap_username", e.target.value)}
                  placeholder="ordenes@example.com"
                  autoComplete="off"
                />
              </Field>
              <Field label="Password / App password">
                <Input
                  type="password"
                  value={form.imap_password}
                  onChange={(e) => update("imap_password", e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Mailbox">
                <Input
                  value={form.imap_mailbox}
                  onChange={(e) => update("imap_mailbox", e.target.value)}
                />
              </Field>
              <Field label="Mark messages as Seen">
                <select
                  className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm"
                  value={form.imap_mark_seen ? "1" : "0"}
                  onChange={(e) => update("imap_mark_seen", e.target.value === "1")}
                >
                  <option value="1">Yes</option>
                  <option value="0">No</option>
                </select>
              </Field>
              <Field label="Allowed senders" hint="comma-separated, optional">
                <Input
                  value={form.allowed_senders}
                  onChange={(e) => update("allowed_senders", e.target.value)}
                  placeholder="*@partner.com, ops@client.com"
                />
              </Field>
            </div>

            <Field
              label="Accepted file formats"
              hint="Only these attachments pass to the AI pipeline. PDF default — blocks signature .txt/.html and saves tokens."
            >
              <MimeTypePicker
                value={allowedMimeTypes}
                onChange={setAllowedMimeTypes}
                disabled={busy !== "idle"}
              />
            </Field>

            <div className="flex items-center gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={testConnection} disabled={busy !== "idle"}>
                {busy === "test" ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
                Test connection
              </Button>
              <Button type="button" size="sm" onClick={saveSource} disabled={busy !== "idle"}>
                {busy === "save" ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
                Save IMAP source
              </Button>
            </div>
          </div>
        )}
      </section>

      {sources.length > 0 && (
        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full text-sm">
            <thead className="text-xs text-[var(--color-fg-mute)]">
              <tr>
                <th className="px-3 py-2 text-left">Address</th>
                <th className="px-3 py-2 text-left">Host</th>
                <th className="px-3 py-2 text-left">Mailbox</th>
                <th className="px-3 py-2 text-left">Last sync</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2 font-medium text-[var(--color-fg)]">{source.address}</td>
                  <td className="px-3 py-2 text-[var(--color-fg-mute)]">
                    {source.imap_host}:{source.imap_port}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-fg-mute)]">{source.imap_mailbox}</td>
                  <td className="px-3 py-2 text-[var(--color-fg-mute)]">
                    {source.imap_last_synced_at
                      ? new Date(source.imap_last_synced_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                        source.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {source.status === "active" ? (
                        <CheckCircle2 size={12} />
                      ) : (
                        <PauseCircle size={12} />
                      )}
                      {source.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => testSaved(source)}
                      disabled={busy !== "idle" || !source.has_password}
                    >
                      Test
                    </Button>
                    {source.status === "active" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => updateStatus(source.id, "paused")}
                      >
                        <PauseCircle size={14} className="mr-1" />
                        Pause
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => updateStatus(source.id, "active")}
                      >
                        <PlayCircle size={14} className="mr-1" />
                        Resume
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs font-medium text-[var(--color-fg)]">{label}</Label>
      {children}
      {hint ? <span className="text-xs text-[var(--color-fg-mute)]">{hint}</span> : null}
    </div>
  );
}
