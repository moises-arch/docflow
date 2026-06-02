import type { ReactNode } from "react";
import { requireSettingsAccess } from "../../settings/_lib";
import { RithumSidebar } from "./rithum-sidebar";

export default async function RithumLayout({ children }: { children: ReactNode }) {
  await requireSettingsAccess();

  return (
    <div className="flex h-full">
      <div className="sticky top-0 hidden h-full w-[220px] shrink-0 border-r border-[var(--color-border)] lg:block">
        <RithumSidebar />
      </div>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
