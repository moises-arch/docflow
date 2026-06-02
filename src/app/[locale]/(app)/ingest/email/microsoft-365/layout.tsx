import { requireSettingsAccess } from "../../../settings/_lib";
import { M365Sidebar } from "./m365-sidebar";
import type { ReactNode } from "react";

export default async function M365Layout({ children }: { children: ReactNode }) {
  await requireSettingsAccess();

  return (
    <div className="flex h-full">
      <div className="sticky top-0 hidden h-full w-[220px] shrink-0 border-r border-[var(--color-border)] lg:block">
        <M365Sidebar />
      </div>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
