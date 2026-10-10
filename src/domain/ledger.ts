import { compareDates, type LocalDate } from "./dates";
import type { Paisa } from "./money";

/** Stored states. "overdue" is never stored — it is derived from the date. */
export type ObligationState = "due" | "submitted" | "verified" | "rejected" | "disputed" | "cancelled";
export type DisplayStatus = ObligationState | "overdue";

export interface Obligation {
  id: string;
  memberId: string;
  round: number;
  dueDate: LocalDate;
  amountPaisa: Paisa;
  state: ObligationState;
  /** Amount the organizer confirmed against the real account history. Only set when verified. */
  verifiedPaisa?: Paisa;
}

/** Allowed transitions; anything else is a bug and the DB rejects it too. */
export const TRANSITIONS: Record<ObligationState, readonly ObligationState[]> = {
  due: ["submitted", "cancelled"],
  submitted: ["verified", "rejected", "disputed"],
  rejected: ["submitted", "cancelled"],
  disputed: ["verified", "rejected"],
  verified: ["disputed"],
  cancelled: []
};

export function canTransition(from: ObligationState, to: ObligationState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function displayStatus(o: Obligation, today: LocalDate): DisplayStatus {
  if ((o.state === "due" || o.state === "rejected") && compareDates(o.dueDate, today) < 0) return "overdue";
  return o.state;
}

export interface LedgerSummary {
  /** Owed for dates up to and including today (cancelled excluded). */
  expectedToDatePaisa: Paisa;
  /** Awaiting organizer check. NOT money received. */
  submittedPaisa: Paisa;
  /** Confirmed against the receiving account. The only "money received" figure. */
  verifiedPaisa: Paisa;
  outstandingPaisa: Paisa;
  overdueCount: number;
}

export function summarize(obligations: readonly Obligation[], today: LocalDate): LedgerSummary {
  let expected = 0, submitted = 0, verified = 0, overdue = 0;
  for (const o of obligations) {
    if (o.state === "cancelled") continue;
    if (o.state === "verified") verified += o.verifiedPaisa ?? 0;
    if (o.state === "submitted" || o.state === "disputed") submitted += o.amountPaisa;
    if (compareDates(o.dueDate, today) <= 0) expected += o.amountPaisa;
    if (displayStatus(o, today) === "overdue") overdue++;
  }
  return {
    expectedToDatePaisa: expected,
    submittedPaisa: submitted,
    verifiedPaisa: verified,
    outstandingPaisa: Math.max(0, expected - verified),
    overdueCount: overdue
  };
}
