import type { ReactNode } from "react";
import { requireSettingsAccess } from "../../settings/_lib";
import { CleoSidebar } from "./cleo-sidebar";

export default async function CleoLayout({ children }: { children: ReactNode }) {
  await requireSettingsAccess();

  return (
    <div className="flex h-full">
      <div className="sticky top-0 hidden h-full w-[220px] shrink-0 border-r border-[var(--color-border)] lg:block">
        <CleoSidebar />
      </div>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
