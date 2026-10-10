import { compareDates, type LocalDate } from "./dates";
import type { Obligation } from "./ledger";
import type { Paisa } from "./money";

/**
 * Committee rule (agreed with the organizer):
 * - A missed daily contribution can be caught up any time up to toss day
 *   (weekend, or on toss day itself). A family member may pay on the member's behalf.
 * - On toss day, a member with unverified dues up to that day is left out of
 *   THAT round's toss only. They stay in the committee.
 * - A member who already received a payout is not in later tosses, but keeps paying.
 */
export type Exclusion =
  | { memberId: string; reason: "already_paid_out" }
  | { memberId: string; reason: "arrears"; arrearsPaisa: Paisa };

export interface TossEligibility {
  eligible: string[];
  excluded: Exclusion[];
}

export function tossEligibility(input: {
  memberIds: readonly string[];
  paidOutMemberIds: ReadonlySet<string>;
  obligations: readonly Obligation[];
  tossDate: LocalDate;
}): TossEligibility {
  const eligible: string[] = [];
  const excluded: Exclusion[] = [];
  for (const memberId of input.memberIds) {
    if (input.paidOutMemberIds.has(memberId)) {
      excluded.push({ memberId, reason: "already_paid_out" });
      continue;
    }
    const arrears = arrearsFor(memberId, input.obligations, input.tossDate);
    if (arrears > 0) excluded.push({ memberId, reason: "arrears", arrearsPaisa: arrears });
    else eligible.push(memberId);
  }
  return { eligible, excluded };
}

/** Owed-but-not-verified up to a date. Submitted receipts still count as arrears. */
export function arrearsFor(memberId: string, obligations: readonly Obligation[], upTo: LocalDate): Paisa {
  let owed = 0;
  for (const o of obligations) {
    if (o.memberId !== memberId || o.state === "cancelled" || o.state === "verified") continue;
    if (compareDates(o.dueDate, upTo) <= 0) owed += o.amountPaisa;
  }
  return owed;
}

export interface PayoutReadiness {
  ready: boolean;
  targetPaisa: Paisa;
  verifiedPaisa: Paisa;
  shortfallPaisa: Paisa;
}

/** A payout can be marked ready only when the round's full pot is verified. */
export function payoutReadiness(roundObligations: readonly Obligation[], targetPaisa: Paisa): PayoutReadiness {
  const verified = roundObligations.reduce(
    (sum, o) => (o.state === "verified" ? sum + (o.verifiedPaisa ?? 0) : sum),
    0
  );
  const shortfall = Math.max(0, targetPaisa - verified);
  return { ready: shortfall === 0, targetPaisa, verifiedPaisa: verified, shortfallPaisa: shortfall };
}

/**
 * Deterministic pick from a recorded random uint32. The DB performs the real
 * draw with cryptographic randomness and stores the random value and the
 * eligible list, so anyone can re-run this to check the result. (Modulo bias
 * with ≤50 members over 2^32 values is below one in 80 million.)
 */
export function pickWinner(eligibleSorted: readonly string[], randomUint32: number): string {
  if (eligibleSorted.length === 0) throw new Error("No eligible members for the toss");
  return eligibleSorted[randomUint32 % eligibleSorted.length]!;
}
