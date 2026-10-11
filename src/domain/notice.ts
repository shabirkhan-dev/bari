/**
 * A notification as two lines (title + detail) in English or Urdu. Pure: used by the
 * Updates screen and by the push worker, which has no app state.
 */
import { en, ur, type Key } from "../i18n/strings";

export type NoticeIcon = "check" | "bell" | "receipt" | "clock" | "toss" | "money" | "info";
export interface NoticeLines { title: string; sub: string; icon: NoticeIcon; tone: "ok" | "due" | "late" | "plain" }

type Lang = "en" | "ur";
const group = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function fill(l: Lang, key: Key, params: Record<string, string | number> = {}) {
  let s: string = (l === "ur" ? ur : en)[key];
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
const money = (l: Lang, paisa: unknown) => {
  if (typeof paisa !== "number") return "";
  const n = paisa % 100 === 0 ? group.format(paisa / 100) : (paisa / 100).toFixed(2);
  return l === "ur" ? `${n} روپے` : `Rs ${n}`;
};
function clockLabel(l: Lang, hhmm: unknown) {
  if (typeof hhmm !== "string") return "";
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = m ? `:${String(m).padStart(2, "0")}` : "";
  if (l === "ur") return `${h < 12 ? "صبح" : h < 16 ? "دوپہر" : h < 19 ? "شام" : "رات"} ${h12}${mm}`;
  return `${h12}${mm} ${h < 12 ? "am" : "pm"}`;
}
const freqOf = (p: Record<string, unknown>) =>
  (["daily", "weekly", "monthly", "custom"].includes(String(p.frequency)) ? String(p.frequency) : "daily") as "daily";

/** "Day 17", "Days 16–18" (or "payment" when the days aren't known). */
function what(l: Lang, p: Record<string, unknown>) {
  const refs = Array.isArray(p.periods) ? (p.periods as { n?: number }[]).map(r => r?.n).filter((n): n is number => typeof n === "number") : [];
  if (typeof p.n === "number") refs.push(p.n);
  const f = freqOf(p);
  if (!refs.length) return fill(l, "u.payment");
  const a = Math.min(...refs), b = Math.max(...refs);
  if (a === b) return fill(l, `g.one.${f}` as Key, { n: a });
  return fill(l, `g.range.${f}` as Key, l === "ur" ? { a: `⁦${a}`, b: `${b}⁩` } : { a, b });
}

export function noticeLines(kind: string, payload: Record<string, unknown>, l: Lang): NoticeLines {
  const p = payload ?? {};
  const name = typeof p.member_name === "string" ? p.member_name.split(/\s+/)[0]! : "";
  const by = typeof p.by_name === "string" ? p.by_name.split(/\s+/)[0]! : "";
  switch (kind) {
    case "payment.verified":
      return { icon: "check", tone: "ok", title: by ? fill(l, "u.verified", { by, what: what(l, p) }) : fill(l, "u.verifiedSub", { amount: money(l, p.amount_paisa) }),
        sub: typeof p.streak === "number" && p.streak > 1 ? fill(l, "u.streak", { n: p.streak }) : fill(l, "u.verifiedSub", { amount: money(l, p.amount_paisa) }) };
    case "payment.rejected":
      return { icon: "info", tone: "late", title: by ? fill(l, "u.rejected", { by, what: what(l, p) }) : fill(l, "g.l.rejected"),
        sub: typeof p.reason === "string" ? p.reason : "" };
    case "payment.submitted":
      return { icon: "receipt", tone: "plain", title: fill(l, "u.submitted", { name }), sub: fill(l, "u.submittedSub", { amount: money(l, p.amount_paisa) }) };
    case "payment.due":
      return { icon: "bell", tone: "due", title: fill(l, "u.due", { amount: money(l, p.amount_paisa), time: clockLabel(l, p.cutoff) }), sub: fill(l, "u.dueSub") };
    case "fine.added":
      return { icon: "clock", tone: "due", title: fill(l, "u.fine"), sub: fill(l, "u.fineSub", { amount: money(l, p.amount_paisa), what: what(l, p) }) };
    case "toss.drawn":
      return { icon: "toss", tone: "plain", title: fill(l, "u.drawn", { round: Number(p.round) || "" }),
        sub: typeof p.winner_name === "string" ? fill(l, "u.drawnSub", { name: p.winner_name }) : "" };
    case "payout.recorded":
      return { icon: "money", tone: "ok", title: fill(l, "u.payout"), sub: fill(l, "u.payoutSub", { amount: money(l, p.amount_paisa) }) };
    case "payout.confirmed":
      return { icon: "check", tone: "ok", title: fill(l, "u.payoutConfirmed"), sub: "" };
    case "payout.disputed":
      return { icon: "info", tone: "late", title: fill(l, "u.payoutDisputed"), sub: typeof p.reason === "string" ? p.reason : "" };
    case "committee.activated":
      return { icon: "info", tone: "plain", title: fill(l, "u.started"), sub: "" };
    case "committee.account_changed":
      return { icon: "info", tone: "plain", title: fill(l, "u.account"), sub: typeof p.number === "string" ? p.number : "" };
    default:
      return { icon: "info", tone: "plain", title: fill(l, "u.other"), sub: "" };
  }
}

/** Where tapping a notification goes. */
export function noticeTarget(kind: string, payload: Record<string, unknown>, committeeId: string | null): string {
  if (!committeeId) return "/inbox";
  if (kind === "payment.submitted") return typeof payload.submission_id === "string" ? `/c/${committeeId}/review/${payload.submission_id}` : `/c/${committeeId}/review`;
  if (kind === "payment.due") return `/c/${committeeId}/pay`;
  if (kind === "fine.added" || kind === "payment.verified" || kind === "payment.rejected") return "/ledger";
  if ((kind === "toss.drawn" || kind.startsWith("payout.")) && typeof payload.round === "number") return `/c/${committeeId}/round/${payload.round}`;
  return `/c/${committeeId}`;
}
