import React from "react";
import { cn } from "@/lib/utils";

interface AppLogoProps extends React.SVGProps<SVGSVGElement> {
  /** "full" = DocFlow wordmark, "short" = DF monogram */
  variant?: "full" | "short";
}

/**
 * DocFlow wordmark — renders in `currentColor` so it adapts automatically
 * to light-on-dark and dark-on-light sidebar contexts.
 */
export function AppLogo({ className, variant = "full", ...props }: AppLogoProps) {
  const viewBox = variant === "short" ? "0 0 60 42.6" : "0 0 260 42.6";
  return (
    <svg
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      aria-label={variant === "short" ? "DF" : "DocFlow"}
      fill="currentColor"
      className={cn(className)}
      {...props}
    >
      <text
        x="0"
        y="32"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="34"
        fontWeight="700"
        letterSpacing="-0.5"
      >
        {variant === "short" ? "DF" : "DocFlow"}
      </text>
    </svg>
  );
}
