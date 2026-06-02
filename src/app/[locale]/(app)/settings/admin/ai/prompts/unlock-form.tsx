"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PromptsUnlockForm() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/prompts/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });
      if (!res.ok) {
        setError("Clave incorrecta");
        return;
      }
      router.refresh();
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="passcode" className="block text-xs font-medium text-[var(--color-fg-mute)]">
          Clave
        </label>
        <input
          id="passcode"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          autoFocus
          disabled={loading}
          className="mt-1 block w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)] focus:border-[var(--color-fg)] focus:outline-none disabled:opacity-50"
        />
        {error && (
          <p className="mt-1 text-xs text-rose-500">{error}</p>
        )}
      </div>
      <Button
        type="submit"
        disabled={loading || !passcode.trim()}
        className="w-full"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Unlock size={14} />}
        {loading ? "Verificando…" : "Desbloquear"}
      </Button>
    </form>
  );
}
