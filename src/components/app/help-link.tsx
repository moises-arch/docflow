"use client";

import { HelpCircle } from "lucide-react";
import { useLocale } from "next-intl";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface HelpLinkProps {
  slug: string;
  className?: string;
  /** Optional accessible label override */
  label?: string;
}

/**
 * Small "?" icon linking to a Help Center article. Opens in a new tab so the
 * user doesn't lose their current context.
 */
export function HelpLink({ slug, className, label }: HelpLinkProps) {
  const locale = useLocale();
  return (
    <Link
      href={`/${locale}/help/${slug}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label ?? "Help"}
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full",
        "text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <HelpCircle size={13} />
    </Link>
  );
}
