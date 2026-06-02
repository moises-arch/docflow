/**
 * Calcula la próxima ejecución del cron `0 3 * * *` UTC (10pm Panamá).
 * Devuelve `now + lo que falte para las próximas 3:00 UTC`.
 * Si ya pasaron las 3:00 UTC hoy, devuelve mañana 3:00 UTC.
 */
export function computeNextCron(now: Date): Date {
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    3, 0, 0, 0,
  ));
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}
