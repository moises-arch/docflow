import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requireSettingsAccess } from "../_lib";
import type { ReactNode } from "react";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { isOwner } = await requireSettingsAccess();
  const locale = await getLocale();
  if (!isOwner) redirect(`/${locale}/settings/general`);
  // Acceso protegido solo por rol owner — sin PIN adicional.
  return <>{children}</>;
}
