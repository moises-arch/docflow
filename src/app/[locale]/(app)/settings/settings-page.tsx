import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  wide?: boolean;
}

/** Standard settings page wrapper — adds padding and optional max-width. */
export function SettingsPage({ children, wide = false }: Props) {
  return (
    <div className={`px-8 py-8 ${wide ? "w-full" : "mx-auto w-full max-w-3xl"}`}>
      {children}
    </div>
  );
}
