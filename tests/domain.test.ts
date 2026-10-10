import { describe, expect, it } from "vitest";
import { addMonthsClamped, isLocalDate, todayInPKT } from "../src/domain/dates";
import { formatPKR, rupees } from "../src/domain/money";
import { buildPeriods, buildRounds, CommitteeConfig, projectedMonthlyFlow } from "../src/domain/schedule";
import { canTransition, displayStatus, summarize, type Obligation } from "../src/domain/ledger";
import { arrearsFor, payoutReadiness, pickWinner, tossEligibility } from "../src/domain/toss";
import { parseJazzCashReceipt } from "../src/domain/receipt";

const pilot = CommitteeConfig.parse({
  memberCount: 5,
  contributionPaisa: rupees(200),
  frequency: "daily",
  periodsPerRound: 30,
  startDate: "2026-11-01",
  payoutPaisa: rupees(30_000)
});

describe("money", () => {
  it("formats PKR", () => {
    expect(formatPKR(rupees(30_000))).toBe("Rs 30,000");
    expect(formatPKR(rupees(7030.5))).toBe("Rs 7,030.50");
  });
  it("rejects negative and non-integer paisa", () => {
    expect(() => rupees(-1)).toThrow();
  });
});

describe("dates (PKT)", () => {
  it("uses Pakistan's calendar date, not the device's", () => {
    // 2026-10-10 20:30 UTC is already Oct 11 01:30 in Pakistan.
    expect(todayInPKT(new Date("2026-10-10T20:30:00Z"))).toBe("2026-10-11");
    expect(todayInPKT(new Date("2026-10-10T18:59:00Z"))).toBe("2026-10-10");
  });
  it("clamps month-end but keeps the anchor day", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
  });
  it("validates dates", () => {
    expect(isLocalDate("2026-02-30")).toBe(false);
    expect(isLocalDate("2026-02-28")).toBe(true);
  });
});

describe("pilot committee: 5 × Rs 200 daily × 30", () => {
  it("has 150 periods over 5 rounds, ending on day 150", () => {
    const periods = buildPeriods(pilot);
    expect(periods).toHaveLength(150);
    expect(periods[0]!.dueDate).toBe("2026-11-01");
    expect(periods[149]!.dueDate).toBe("2027-03-30");
    expect(periods[29]!.round).toBe(1);
    expect(periods[30]!.round).toBe(2);
  });
  it("each round pots Rs 30,000 and costs each member Rs 6,000", () => {
    const rounds = buildRounds(pilot);
    expect(rounds).toHaveLength(5);
    expect(rounds[0]).toMatchObject({ tossDate: "2026-11-30", potPaisa: rupees(30_000), perMemberPaisa: rupees(6_000) });
    expect(rounds[4]!.tossDate).toBe("2027-03-30");
  });
  it("rejects an inconsistent payout", () => {
    const r = CommitteeConfig.safeParse({ ...pilot, payoutPaisa: rupees(25_000) });
    expect(r.success).toBe(false);
  });
  it("stays far under a Rs 3 lakh monthly limit", () => {
    const nov = projectedMonthlyFlow(pilot, 2026, 11);
    expect(nov.incomingPaisa).toBe(rupees(30_000));
    expect(nov.outgoingPaisa).toBe(rupees(30_000));
  });
});

describe("other schedules", () => {
  it("weekly and monthly", () => {
    const weekly = CommitteeConfig.parse({ ...pilot, frequency: "weekly", periodsPerRound: 4, payoutPaisa: 5 * 4 * rupees(200) });
    expect(buildPeriods(weekly)[1]!.dueDate).toBe("2026-11-08");
    const monthly = CommitteeConfig.parse({ ...pilot, frequency: "monthly", periodsPerRound: 1, payoutPaisa: 5 * rupees(200) });
    expect(buildRounds(monthly).map(r => r.tossDate)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01"]);
  });
  it("custom needs an interval", () => {
    expect(CommitteeConfig.safeParse({ ...pilot, frequency: "custom" }).success).toBe(false);
    const c = CommitteeConfig.parse({ ...pilot, frequency: "custom", intervalDays: 3 });
    expect(buildPeriods(c)[2]!.dueDate).toBe("2026-11-07");
  });
});

const ob = (memberId: string, dueDate: string, state: Obligation["state"], round = 1): Obligation => ({
  id: `${memberId}-${dueDate}`,
  memberId,
  round,
  dueDate,
  amountPaisa: rupees(200),
  state,
  verifiedPaisa: state === "verified" ? rupees(200) : undefined
});

describe("ledger", () => {
  it("never counts submitted receipts as money received", () => {
    const s = summarize([ob("a", "2026-11-01", "verified"), ob("b", "2026-11-01", "submitted")], "2026-11-01");
    expect(s.verifiedPaisa).toBe(rupees(200));
    expect(s.submittedPaisa).toBe(rupees(200));
    expect(s.outstandingPaisa).toBe(rupees(200));
  });
  it("derives overdue from the date", () => {
    expect(displayStatus(ob("a", "2026-11-01", "due"), "2026-11-02")).toBe("overdue");
    expect(displayStatus(ob("a", "2026-11-01", "due"), "2026-11-01")).toBe("due");
    expect(displayStatus(ob("a", "2026-11-01", "submitted"), "2026-11-05")).toBe("submitted");
  });
  it("forbids skipping verification", () => {
    expect(canTransition("due", "verified")).toBe(false);
    expect(canTransition("submitted", "verified")).toBe(true);
  });
});

describe("toss", () => {
  const obligations = [
    ob("a", "2026-11-01", "verified"), ob("a", "2026-11-02", "verified"),
    ob("b", "2026-11-01", "verified"), ob("b", "2026-11-02", "submitted"), // receipt not yet checked
    ob("c", "2026-11-01", "verified"), ob("c", "2026-11-02", "verified"),
    ob("d", "2026-11-01", "verified"), ob("d", "2026-11-02", "verified")
  ];
  it("leaves out members in arrears and members already paid", () => {
    const r = tossEligibility({ memberIds: ["a", "b", "c", "d"], paidOutMemberIds: new Set(["d"]), obligations, tossDate: "2026-11-02" });
    expect(r.eligible).toEqual(["a", "c"]);
    expect(r.excluded).toContainEqual({ memberId: "b", reason: "arrears", arrearsPaisa: rupees(200) });
    expect(r.excluded).toContainEqual({ memberId: "d", reason: "already_paid_out" });
  });
  it("ignores dues after toss day", () => {
    expect(arrearsFor("a", [...obligations, ob("a", "2026-11-03", "due")], "2026-11-02")).toBe(0);
  });
  it("payout needs the full pot verified", () => {
    expect(payoutReadiness(obligations, rupees(1600))).toMatchObject({ ready: false, shortfallPaisa: rupees(200) });
  });
  it("picks deterministically from the recorded random value", () => {
    expect(pickWinner(["a", "c"], 7)).toBe("c");
    expect(() => pickWinner([], 1)).toThrow();
  });
});

// OCR output of a real JazzCash receipt; name and consumer number replaced.
const RECEIPT_OCR = `October 10,2026 at 20:16

Transaction Successful

1Bill Paid

Rs. 7,030°

transferred to
1bill Invoice & Voucher
TEST PAYEE NAME

100000000000000000
October
Transaction Amount Rs. 7,030.00
Transaction Fee Free
TID 726755086850

securely sent via JX`;

describe("receipt parser", () => {
  it("extracts amount, TID and PKT time from the real layout", () => {
    expect(parseJazzCashReceipt(RECEIPT_OCR)).toEqual({
      kind: "bill_payment",
      saysSuccessful: true,
      amountPaisa: rupees(7030),
      tid: "726755086850",
      occurredAt: "2026-10-10T20:16:00+05:00",
      counterparty: "1bill Invoice & Voucher"
    });
  });
  it("returns nothing it cannot read", () => {
    expect(parseJazzCashReceipt("blurry")).toEqual({ kind: "unknown", saysSuccessful: false });
  });
});
