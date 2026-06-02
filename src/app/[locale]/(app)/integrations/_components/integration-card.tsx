"use client";

import Link from "next/link";
import { ArrowRight, Bell, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IntegrationLogo } from "./integration-logo";
import type { IntegrationDescriptor, IntegrationStatus } from "@/lib/integrations/registry";

interface IntegrationCardProps {
  descriptor: IntegrationDescriptor;
  status: IntegrationStatus;
  href: string;
  i18n: {
    name: string;
    tagline: string;
    description: string;
    statusConnected: string;
    statusAvailable: string;
    statusComingSoon: string;
    open: string;
    notifyMe: string;
  };
  index?: number;
}

export function IntegrationCard({
  descriptor,
  status,
  href,
  i18n,
  index = 0,
}: IntegrationCardProps) {
  const isComingSoon = status === "coming-soon";
  const isConnected = status === "connected";

  return (
    <Card
      role="article"
      aria-label={`${i18n.name} integration card`}
      style={{ animationDelay: `${index * 40}ms` }}
      className={cn(
        "group relative flex flex-col overflow-hidden",
        "border border-[var(--color-border)] bg-[var(--color-surface)]",
        "transition-all duration-200",
        "hover:border-[var(--color-fg-subtle)] hover:shadow-sm",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2",
        "motion-safe:fill-mode-both motion-safe:duration-500",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-0 left-0 h-1 w-full",
          accentTopBarClass(descriptor.accent),
        )}
      />

      <CardHeader className="flex-row items-start gap-3 space-y-0 pt-5">
        <IntegrationLogo descriptor={descriptor} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-tight font-medium">{i18n.name}</CardTitle>
            <StatusPill
              status={status}
              labels={{
                connected: i18n.statusConnected,
                available: i18n.statusAvailable,
                comingSoon: i18n.statusComingSoon,
              }}
            />
          </div>
          <CardDescription className="mt-0.5 text-xs">{i18n.tagline}</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <p className="text-[var(--color-fg-mute)] line-clamp-2 text-xs leading-relaxed">
          {i18n.description}
        </p>
      </CardContent>

      <CardFooter className="mt-auto pt-2">
        {isComingSoon ? (
          <Button
            variant="ghost"
            size="sm"
            disabled
            className="text-[var(--color-fg-mute)] w-full justify-center"
          >
            <Bell className="size-3.5" aria-hidden />
            {i18n.notifyMe}
          </Button>
        ) : (
          <Button asChild variant={isConnected ? "outline" : "default"} size="sm" className="w-full">
            <Link
              href={href}
              className="focus-visible:ring-[var(--color-blue)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {i18n.open}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

interface StatusPillProps {
  status: IntegrationStatus;
  labels: { connected: string; available: string; comingSoon: string };
}

function StatusPill({ status, labels }: StatusPillProps) {
  if (status === "connected") {
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex shrink-0 items-center gap-1 rounded-[999px] border border-[color-mix(in_oklab,var(--color-teal)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-teal)_10%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-teal)]"
      >
        <CheckCircle2 className="size-3" aria-hidden />
        {labels.connected}
      </span>
    );
  }
  if (status === "coming-soon") {
    return (
      <span
        role="status"
        className="inline-flex shrink-0 items-center gap-1 rounded-[999px] border border-[color-mix(in_oklab,var(--color-amber)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-amber)_10%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-amber)]"
      >
        <span
          className="bg-[var(--color-amber)] size-1.5 rounded-[999px]"
          aria-hidden
        />
        {labels.comingSoon}
      </span>
    );
  }
  return (
    <span
      role="status"
      className="text-[var(--color-fg-mute)] inline-flex shrink-0 items-center gap-1 rounded-[999px] border border-[var(--color-border)] bg-[var(--color-surface-mute)] px-2 py-0.5 text-[10px] font-medium"
    >
      {labels.available}
    </span>
  );
}

function accentTopBarClass(accent: IntegrationDescriptor["accent"]): string {
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
