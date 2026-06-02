import { requireSettingsAccess } from "../../settings/_lib";
import { WalmartSidebar } from "./walmart-sidebar";
import type { ReactNode } from "react";

export default async function WalmartLayout({ children }: { children: ReactNode }) {
  await requireSettingsAccess();

  return (
    <div className="flex h-full">
      <div className="sticky top-0 hidden h-full w-[200px] shrink-0 lg:block">
        <WalmartSidebar />
      </div>
      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
        {children}
      </main>
    </div>
  );
}
