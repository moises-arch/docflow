import type { ReactNode } from "react";
import { requireSettingsAccess } from "../settings/_lib";

/**
 * Integrations layout — passes children directly.
 * Each integration page controls its own width and padding so that pages with
 * full-width sidebars (like ERP) can use the entire viewport, while marketplace
 * pages can keep their constrained width via their own wrapper.
 */
export default async function IntegrationsLayout({ children }: { children: ReactNode }) {
  await requireSettingsAccess();

  return <>{children}</>;
}
