import type { ReactNode } from "react";
import { requireSettingsAccess } from "../../settings/_lib";
import { TemplatesSidebar } from "../templates-sidebar";

export default async function TemplatesLayout({ children }: { children: ReactNode }) {
  await requireSettingsAccess();

  return (
    <div className="flex h-full">
      <div className="sticky top-0 hidden h-full w-[220px] shrink-0 lg:block">
        <TemplatesSidebar />
      </div>
      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="grid w-full gap-5">{children}</div>
      </main>
    </div>
  );
}
