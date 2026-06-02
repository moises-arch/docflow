//
// Visor read-only de los prompts del pipeline IA con historial de versiones
// y rollback. Protegido por passcode (cookie httpOnly de /api/admin/prompts/unlock).
//
// Lee de la tabla `prompt_versions` en Supabase (vía src/lib/ai/prompt-loader.ts).
// La pipeline edge function también lee de ahí — ambos lados consultan la misma
// source of truth. Rollback = cambiar `is_active`, los siguientes documentos
// procesados usan la versión recién activada.
//
// Operador NO puede editar prompts desde la UI. Las versiones nuevas se crean
// vía migration desde el código.

import { cookies } from "next/headers";
import { ScrollText, Lock } from "lucide-react";
import { SettingsPage } from "../../../settings-page";
import { loadPromptGroups } from "@/lib/ai/prompt-loader";
import { PROMPTS_COOKIE_NAME } from "@/app/api/admin/prompts/unlock/route";
import { PromptsUnlockForm } from "./unlock-form";
import { PromptVersionViewer } from "./prompt-version-viewer";

export const dynamic = "force-dynamic";

export default async function AdminPromptsPage() {
  const cookieStore = await cookies();
  const unlocked = cookieStore.get(PROMPTS_COOKIE_NAME)?.value === "1";

  if (!unlocked) {
    return (
      <SettingsPage>
        <header className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--color-fg)]">
            <Lock size={20} aria-hidden="true" />
            Prompts del pipeline IA
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-mute)]">
            Visor read-only de los prompts que el sistema manda a Claude. Acceso restringido.
          </p>
        </header>
        <section className="mx-auto max-w-md rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="text-base font-semibold text-[var(--color-fg)]">
            Acceso restringido
          </h2>
          <p className="mt-1 text-sm text-[var(--color-fg-mute)]">
            Ingresa la clave para ver los prompts y su historial de versiones.
          </p>
          <div className="mt-4">
            <PromptsUnlockForm />
          </div>
        </section>
      </SettingsPage>
    );
  }

  const groups = await loadPromptGroups();

  return (
    <SettingsPage wide>
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--color-fg)]">
          <ScrollText size={20} aria-hidden="true" />
          Prompts del pipeline IA
        </h1>
        <p className="mt-1 text-sm text-[var(--color-fg-mute)]">
          Visor read-only con historial de versiones. Puedes activar una versión anterior (rollback) pero no editar el contenido.
        </p>
      </header>

      <div className="space-y-4">
        <div className="rounded-[var(--radius-md)] border border-amber-400/30 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
          <strong className="font-semibold">Versionado activo.</strong>{" "}
          Cada cambio en el código se promueve como nueva versión vía migration.
          El rollback activa una versión anterior — los siguientes documentos
          procesados usan esa versión. La pipeline cachea por 5 min, así que un
          rollback puede tardar hasta ese tiempo en aplicarse a todas las invocaciones.
        </div>

        {groups.map((g) => (
          <PromptVersionViewer key={g.promptId} group={g} />
        ))}
      </div>
    </SettingsPage>
  );
}
