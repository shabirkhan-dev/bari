import { z } from "zod";
import { addDays, addMonthsClamped, isLocalDate, type LocalDate } from "./dates";
import type { Paisa } from "./money";

export const Frequency = z.enum(["daily", "weekly", "monthly", "custom"]);
export type Frequency = z.infer<typeof Frequency>;

/**
 * Committee shape. One payout per member, so rounds === memberCount.
 *
 * Example: 5 members × Rs 200 daily × 30 periods per round
 *   → round pot Rs 30,000, each member pays Rs 6,000 per round, 150 days total.
 */
export const CommitteeConfig = z
  .object({
    memberCount: z.number().int().min(2).max(50),
    contributionPaisa: z.number().int().positive(),
    frequency: Frequency,
    /** Only for "custom": a contribution falls due every N days. */
    intervalDays: z.number().int().min(1).max(366).optional(),
    /** Contribution periods per payout round (30 in the daily example). */
    periodsPerRound: z.number().int().min(1).max(366),
    startDate: z.string().refine(isLocalDate, "Must be a valid YYYY-MM-DD date"),
    /** Stated pot per round — must equal what the schedule actually collects. */
    payoutPaisa: z.number().int().positive()
  })
  .superRefine((c, ctx) => {
    if (c.frequency === "custom" && c.intervalDays === undefined) {
      ctx.addIssue({ code: "custom", path: ["intervalDays"], message: "Custom schedules need an interval in days" });
    }
    if (c.frequency !== "custom" && c.intervalDays !== undefined) {
      ctx.addIssue({ code: "custom", path: ["intervalDays"], message: "Interval only applies to custom schedules" });
    }
    const expected = c.memberCount * c.periodsPerRound * c.contributionPaisa;
    if (!Number.isSafeInteger(expected)) {
      ctx.addIssue({ code: "custom", path: ["payoutPaisa"], message: "Amounts are too large" });
    } else if (c.payoutPaisa !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["payoutPaisa"],
        message: `Payout must equal members × periods × contribution (${expected / 100} rupees)`
      });
    }
  });
export type CommitteeConfig = z.infer<typeof CommitteeConfig>;

export interface Period {
  /** 0-based across the whole committee. */
  index: number;
  /** 1-based. */
  round: number;
  dueDate: LocalDate;
}

export interface Round {
  round: number;
  firstDueDate: LocalDate;
  lastDueDate: LocalDate;
  /**
   * Toss / payout day = the round's last due date. Missed contributions in this
   * round may be paid up to and including this day; anyone still in arrears is
   * left out of this round's toss.
   */
  tossDate: LocalDate;
  potPaisa: Paisa;
  /** What each member owes for this round. */
  perMemberPaisa: Paisa;
}

export function periodDueDate(c: CommitteeConfig, index: number): LocalDate {
  switch (c.frequency) {
    case "daily":
      return addDays(c.startDate, index);
    case "weekly":
      return addDays(c.startDate, index * 7);
    case "custom":
      return addDays(c.startDate, index * c.intervalDays!);
    case "monthly":
      return addMonthsClamped(c.startDate, index);
  }
}

export function totalPeriods(c: CommitteeConfig): number {
  return c.memberCount * c.periodsPerRound;
}

export function buildPeriods(c: CommitteeConfig): Period[] {
  const n = totalPeriods(c);
  return Array.from({ length: n }, (_, index) => ({
    index,
    round: Math.floor(index / c.periodsPerRound) + 1,
    dueDate: periodDueDate(c, index)
  }));
}

export function buildRounds(c: CommitteeConfig): Round[] {
  return Array.from({ length: c.memberCount }, (_, i) => {
    const first = i * c.periodsPerRound;
    const last = first + c.periodsPerRound - 1;
    const lastDue = periodDueDate(c, last);
    return {
      round: i + 1,
      firstDueDate: periodDueDate(c, first),
      lastDueDate: lastDue,
      tossDate: lastDue,
      potPaisa: c.payoutPaisa,
      perMemberPaisa: c.periodsPerRound * c.contributionPaisa
    };
  });
}

/** Sum of contributions passing through the receiving account in a calendar month (in + out). */
export function projectedMonthlyFlow(c: CommitteeConfig, year: number, month1: number) {
  const prefix = `${year}-${String(month1).padStart(2, "0")}`;
  const incoming = buildPeriods(c).filter(p => p.dueDate.startsWith(prefix)).length * c.memberCount * c.contributionPaisa;
  const outgoing = buildRounds(c).filter(r => r.tossDate.startsWith(prefix)).length * c.payoutPaisa;
  return { incomingPaisa: incoming, outgoingPaisa: outgoing };
}
