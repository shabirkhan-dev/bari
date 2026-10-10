import type { Paisa } from "./money";

/**
 * Best-effort extraction from OCR text of a JazzCash receipt image.
 * This is a typing shortcut for the member — NEVER evidence that money moved.
 * Every field is shown for the member to confirm before submitting, and the
 * organizer still checks the real account history before verifying.
 */
export interface ParsedReceipt {
  amountPaisa?: Paisa;
  /** JazzCash transaction ID ("TID"). Used to catch duplicate submissions. */
  tid?: string;
  /** ISO 8601 with Pakistan offset, e.g. 2026-10-10T20:16:00+05:00 */
  occurredAt?: string;
  /** Name/number shown under "transferred to", if present. */
  counterparty?: string;
  kind: "bill_payment" | "transfer" | "unknown";
  saysSuccessful: boolean;
}

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

function amountToPaisa(raw: string): Paisa | undefined {
  const clean = raw.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return undefined;
  const [whole, frac = ""] = clean.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function parseJazzCashReceipt(text: string): ParsedReceipt {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const all = lines.join("\n");
  const result: ParsedReceipt = {
    kind: /1\s*bill/i.test(all) ? "bill_payment" : /transfer|sent to|money/i.test(all) ? "transfer" : "unknown",
    saysSuccessful: /transaction\s+successful/i.test(all)
  };

  // Prefer the itemised "Transaction Amount" line — the headline amount's
  // superscript decimals OCR badly ("Rs. 7,030°").
  const amountLine =
    /transaction\s+amount\s*:?\s*rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i.exec(all) ??
    /\brs\.?\s*([\d,]+(?:\.\d{1,2})?)/i.exec(all);
  if (amountLine) result.amountPaisa = amountToPaisa(amountLine[1]!);

  const tid = /\b(?:TID|Transaction\s*ID|Trx\s*ID)\s*[:#]?\s*(\d{8,20})\b/i.exec(all);
  if (tid) result.tid = tid[1];

  // "October 10,2026 at 20:16" (also tolerates "Oct 10, 2026 at 8:16 PM")
  const dt =
    /\b([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(all);
  if (dt) {
    const mi = MONTHS.findIndex(m => m.startsWith(dt[1]!.toLowerCase().slice(0, 3)));
    let hour = Number(dt[4]);
    const ampm = dt[6]?.toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    if (mi >= 0 && hour < 24) {
      const pad = (n: number) => String(n).padStart(2, "0");
      result.occurredAt = `${dt[3]}-${pad(mi + 1)}-${pad(Number(dt[2]))}T${pad(hour)}:${dt[5]}:00+05:00`;
    }
  }

  const toIdx = lines.findIndex(l => /^transferred\s+to$/i.test(l) || /^sent\s+to$/i.test(l));
  if (toIdx >= 0 && lines[toIdx + 1]) result.counterparty = lines[toIdx + 1];

  return result;
}
