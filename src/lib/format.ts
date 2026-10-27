// Pure formatting helpers (safe in the engine, server and client).
// Dates are formatted in UTC so "2026-11-27" is always Nov 27.

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const weekdayDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });

const toDate = (value: string) => new Date(value.length === 10 ? `${value}T00:00:00Z` : value);

export function formatShortDate(value: string | null | undefined) {
  return value ? shortDate.format(toDate(value)) : "—";
}
export function formatDate(value: string | null | undefined) {
  return value ? longDate.format(toDate(value)) : "—";
}
export function formatWeekdayDate(value: string | null | undefined) {
  return value ? weekdayDate.format(toDate(value)) : "—";
}
export function formatDateTime(value: string | null | undefined) {
  return value ? `${dateTime.format(toDate(value))} UTC` : "—";
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();
export function formatMoney(amount: number, currency = "USD") {
  let f = moneyFormatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 });
    moneyFormatters.set(currency, f);
  }
  return f.format(Math.round(amount));
}

export function formatHours(hours: number) {
  return `${Math.round(hours * 10) / 10} h`;
}

export function formatSigned(n: number, suffix = "") {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}${suffix}`;
}
