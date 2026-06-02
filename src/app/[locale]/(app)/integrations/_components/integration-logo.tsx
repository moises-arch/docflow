"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { IntegrationDescriptor } from "@/lib/integrations/registry";

interface IntegrationLogoProps {
  descriptor: IntegrationDescriptor;
  size?: 24 | 32 | 40 | 48 | 64;
  className?: string;
}

const SIZE_CLASS: Record<number, string> = {
  24: "size-6",
  32: "size-8",
  40: "size-10",
  48: "size-12",
  64: "size-16",
};

export function IntegrationLogo({ descriptor, size = 40, className }: IntegrationLogoProps) {
  const [errored, setErrored] = React.useState(false);
  const FallbackIcon = descriptor.fallbackIcon;

  const sizeClass = SIZE_CLASS[size];

  if (errored) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[10px]",
          sizeClass,
          accentBgClass(descriptor.accent),
          className,
        )}
        aria-label={`${descriptor.name} logo`}
      >
        <FallbackIcon className="size-1/2 text-white" aria-hidden />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={descriptor.logoSrc}
      alt={`${descriptor.name} logo`}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setErrored(true)}
      className={cn("shrink-0 rounded-[10px]", sizeClass, className)}
    />
  );
}

function accentBgClass(accent: IntegrationDescriptor["accent"]): string {
  switch (accent) {
    case "blue":
      return "bg-[var(--color-blue)]";
    case "teal":
      return "bg-[var(--color-teal)]";
    case "violet":
      return "bg-[var(--color-violet)]";
    case "amber":
      return "bg-[var(--color-amber)]";
    case "rose":
      return "bg-[var(--color-rose)]";
    case "slate":
    default:
      return "bg-[var(--color-fg-mute)]";
  }
}
