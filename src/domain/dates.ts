/**
 * Committee schedules are calendar dates in Pakistan Standard Time.
 * A LocalDate is a plain "YYYY-MM-DD" string — no time, no zone — so a due date
 * can never drift across midnight because of the viewer's device timezone.
 */
export type LocalDate = string;

export const COMMITTEE_TZ = "Asia/Karachi";

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLocalDate(s: string): s is LocalDate {
  const m = LOCAL_DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return toLocalDate(d) === s;
}

function parts(d: LocalDate): [number, number, number] {
  const m = LOCAL_DATE_RE.exec(d);
  if (!m) throw new RangeError(`Not a LocalDate: ${d}`);
  return [+m[1]!, +m[2]! - 1, +m[3]!];
}

function toLocalDate(utcMidnight: Date): LocalDate {
  return utcMidnight.toISOString().slice(0, 10);
}

/** Today's calendar date in Pakistan, regardless of where the device is. */
export function todayInPKT(now: Date = new Date()): LocalDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COMMITTEE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

export function addDays(d: LocalDate, n: number): LocalDate {
  const [y, m, day] = parts(d);
  return toLocalDate(new Date(Date.UTC(y, m, day + n)));
}

/**
 * Add months anchored to the original day, clamped to month length:
 * anchor Jan 31 → Feb 28/29 → Mar 31 (not Mar 28).
 */
export function addMonthsClamped(anchor: LocalDate, n: number): LocalDate {
  const [y, m, day] = parts(anchor);
  const lastDay = new Date(Date.UTC(y, m + n + 1, 0)).getUTCDate();
  return toLocalDate(new Date(Date.UTC(y, m + n, Math.min(day, lastDay))));
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0; // ISO dates sort lexicographically
}
