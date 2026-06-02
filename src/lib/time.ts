/**
 * Formats a UTC date string as a relative time string using the native
 * Intl.RelativeTimeFormat API.  Falls back to a short date for older entries.
 */
export function formatRelativeTime(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (diffSecs < 60) return rtf.format(-diffSecs, "second");
  if (diffMins < 60) return rtf.format(-diffMins, "minute");
  if (diffHours < 24) return rtf.format(-diffHours, "hour");
  if (diffDays < 7) return rtf.format(-diffDays, "day");

  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date);
}

/** Full timestamp string for title/tooltip attributes. */
export function formatFullTimestamp(dateStr: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dateStr));
}
