import type { ReactNode } from "react";
import { requireSettingsAccess } from "./_lib";
import { SettingsSidebar } from "./settings-sidebar";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const { isOwner } = await requireSettingsAccess();

  return (
    <div className="flex h-full">
      <div className="sticky top-0 hidden h-full w-[240px] shrink-0 lg:block">
        <SettingsSidebar isOwner={isOwner} />
      </div>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
