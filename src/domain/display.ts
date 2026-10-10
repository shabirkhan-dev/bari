import type { LocalDate } from "./dates";
import type { Frequency } from "./schedule";
import { formatPKR, type Paisa } from "./money";

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const dayMonthYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const utc = (d: LocalDate) => new Date(`${d}T12:00:00Z`);

/** "30 Nov" */
export const shortDate = (d: LocalDate) => dayMonth.format(utc(d));
/** "30 Nov 2026" */
export const longDate = (d: LocalDate) => dayMonthYear.format(utc(d));
/** "Mon 30 Nov" */
export const dayDate = (d: LocalDate) => weekday.format(utc(d));

export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000);
}

/** "Rs 200 daily", "Rs 1,000 every 3 days" */
export function contributionLabel(paisa: Paisa, f: Frequency, intervalDays?: number | null): string {
  const amount = formatPKR(paisa);
  switch (f) {
    case "daily": return `${amount} daily`;
    case "weekly": return `${amount} weekly`;
    case "monthly": return `${amount} monthly`;
    case "custom": return `${amount} every ${intervalDays} days`;
  }
}

/** "03001234567" → "923001234567" for wa.me links. */
export const waNumber = (local: string) => "92" + local.slice(1);

export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
}
