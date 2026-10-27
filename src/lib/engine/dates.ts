// Date-only arithmetic in UTC so results never shift with the server's timezone.
// Accepts "YYYY-MM-DD" or full ISO timestamps (only the date part is used).

const MS_PER_DAY = 86_400_000;

function toUtcDay(value: string): number {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

function fromUtcDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return toUtcDay(to) - toUtcDay(from);
}

export function addDays(value: string, days: number): string {
  return fromUtcDay(toUtcDay(value) + days);
}

export function isWorkingDay(value: string): boolean {
  const dow = new Date(toUtcDay(value) * MS_PER_DAY).getUTCDay();
  return dow !== 0 && dow !== 6;
}

/**
 * Mon–Fri days in the inclusive range [from, to]. Zero when `to` is before `from`.
 * Example: Mon 2026-11-16 → Fri 2026-11-27 is 10 working days.
 */
export function workingDaysInclusive(from: string, to: string): number {
  const start = toUtcDay(from);
  const end = toUtcDay(to);
  let count = 0;
  for (let d = start; d <= end; d++) if (isWorkingDay(fromUtcDay(d))) count++;
  return count;
}

/** The date `n` working days after `value` (n ≥ 0; n = 0 returns the next working day on or after `value`). */
export function addWorkingDays(value: string, n: number): string {
  let day = toUtcDay(value);
  while (!isWorkingDay(fromUtcDay(day))) day++;
  for (let left = n; left > 0; ) {
    day++;
    if (isWorkingDay(fromUtcDay(day))) left--;
  }
  return fromUtcDay(day);
}

/** Today's date as "YYYY-MM-DD" (UTC, matching Postgres current_date on Supabase). */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
