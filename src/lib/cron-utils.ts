import { CronExpressionParser } from "cron-parser";

export type CronPreset = "hourly" | "daily" | "weekly" | "custom";

export const CRON_PRESETS: Record<Exclude<CronPreset, "custom">, string> = {
  hourly: "0 * * * *",
  daily: "0 9 * * *",
  weekly: "0 9 * * 1",
};

export function detectPreset(expr: string): CronPreset {
  const e = expr.trim();
  if (e === CRON_PRESETS.hourly) return "hourly";
  if (e === CRON_PRESETS.daily) return "daily";
  if (e === CRON_PRESETS.weekly) return "weekly";
  return "custom";
}

export function validateCron(expression: string, tz = "UTC"): { ok: true } | { ok: false; error: string } {
  try {
    CronExpressionParser.parse(expression, { tz });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function nextRunFrom(expression: string, from: Date = new Date(), tz = "UTC"): Date {
  const it = CronExpressionParser.parse(expression, { currentDate: from, tz });
  return it.next().toDate();
}

export function describeCron(expression: string): string {
  const p = detectPreset(expression);
  if (p === "hourly") return "Every hour";
  if (p === "daily") return "Daily at 09:00";
  if (p === "weekly") return "Mondays at 09:00";
  return `Custom: ${expression}`;
}