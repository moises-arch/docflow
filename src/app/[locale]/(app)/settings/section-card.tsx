import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function SectionCard({
  title,
  description,
  icon: Icon,
  aside,
  children,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-fg)]">
            <Icon size={15} className="text-[var(--color-fg-subtle)]" aria-hidden="true" />
            <span>{title}</span>
          </h2>
          {description ? (
            <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">{description}</p>
          ) : null}
        </div>
        {aside}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function DescriptionList({ children }: { children: ReactNode }) {
  return <dl className="grid gap-2">{children}</dl>;
}

export function DescriptionRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-3 border-b border-[var(--color-border)] py-2 text-sm last:border-b-0">
      <dt className="inline-flex items-center gap-1.5 text-[var(--color-fg-mute)]">
        {Icon ? (
          <Icon size={13} className="text-[var(--color-fg-subtle)]" aria-hidden="true" />
        ) : null}
        <span>{label}</span>
      </dt>
      <dd className="min-w-0 truncate text-[var(--color-fg)]">{value}</dd>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-xs font-medium tracking-wide text-[var(--color-fg-mute)] uppercase">
      {children}
    </th>
  );
}

export function TableData({ children }: { children: ReactNode }) {
  return <td className="px-3 py-2 align-top text-[var(--color-fg)]">{children}</td>;
}

export function OdooStatus({ label, status }: { label: string; status: string }) {
  const color =
    status === "active"
      ? "bg-[color:var(--color-teal)]"
      : status === "error"
        ? "bg-[color:var(--color-rose)]"
        : "bg-[var(--color-fg-subtle)]";

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-mute)]">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} aria-hidden="true" />
      {label}
    </span>
  );
}
