import type { LocalDate } from "./dates";
import type { Frequency } from "./schedule";
import type { Paisa } from "./money";
import { money, t } from "../i18n";

const utc = (d: LocalDate) => new Date(`${d}T12:00:00Z`);

export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000);
}

/** "Rs 200 daily" / "روزانہ 200 روپے" */
export function contributionLabel(paisa: Paisa, f: Frequency, intervalDays?: number | null): string {
  return t(`freq.${f}`, { amount: money(paisa), n: intervalDays ?? 0 });
}

/** "03001234567" → "923001234567" for wa.me links. */
export const waNumber = (local: string) => "92" + local.slice(1);

export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
}
