/**
 * Money is stored as integer paisa (1 rupee = 100 paisa) everywhere — in the DB
 * (bigint) and in TS (safe-integer number). Never use floats for amounts.
 */
export type Paisa = number;

export function rupees(amount: number): Paisa {
  const p = Math.round(amount * 100);
  if (!Number.isSafeInteger(p) || p < 0) throw new RangeError(`Invalid rupee amount: ${amount}`);
  return p;
}

const grouping = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const groupingDecimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/** "Rs 30,000" — shows paisa only when non-zero ("Rs 7,030.50"). */
export function formatPKR(paisa: Paisa): string {
  const sign = paisa < 0 ? "−" : "";
  const abs = Math.abs(paisa);
  const body = abs % 100 === 0 ? grouping.format(abs / 100) : groupingDecimal.format(abs / 100);
  return `${sign}Rs ${body}`;
}
