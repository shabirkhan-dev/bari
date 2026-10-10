import { t } from "../i18n";
import type { Key } from "../i18n/strings";

/** Server/network messages we know, mapped to friendly text in the user's language. */
const KNOWN: [RegExp, Key | ((m: RegExpMatchArray) => string)][] = [
  [/Failed to fetch|NetworkError|Load failed|network request failed/i, "err.offline"],
  [/JWT expired|invalid JWT|refresh[_ ]token|Not signed in/i, "err.session"],
  [/Only organizers|Only the owner/i, "err.organizerOnly"],
  [/Invitation code is invalid or expired/i, "err.badCode"],
  [/Committee is full/i, "err.full"],
  [/no longer accepting members/i, "err.notAccepting"],
  [/transaction ID has already been submitted/i, "err.tidUsed"],
  [/receipt image was already used/i, "err.receiptUsed"],
  [/Another organizer must/i, "err.otherOrganizer"],
  [/not payable/i, "err.notPayable"],
  [/does not match the selected contributions/i, "err.amountMismatch"],
  [/Toss day is/i, "err.tossNotYet"],
  [/Nobody is eligible/i, "err.nobodyEligible"],
  [/schedule is locked/i, "err.locked"],
  [/Start date (is in the past|has passed)/i, "err.startPast"],
  [/Draw round \d+ first/i, "err.drawPrevious"],
  [/Not a member of this committee/i, "err.notMember"],
  [/Need (\d+) members, have (\d+)/i, m => t("err.needMembers", { need: m[1]!, have: m[2]! })]
];

function rawMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; code?: unknown; hint?: unknown };
    const parts = [
      typeof o.message === "string" ? o.message : undefined,
      typeof o.hint === "string" && o.hint ? `Hint: ${o.hint}` : undefined,
      typeof o.code === "string" && o.code && !/^\d/.test(o.code) ? `(code ${o.code})` : undefined
    ].filter(Boolean);
    if (parts.length) return parts.join(" ");
  }
  return "Unknown error";
}

/**
 * Turns anything thrown (Error, Supabase error objects, strings) into a readable message:
 * a friendly translation when we recognise it, otherwise the original text (never "[object Object]").
 */
export function describeError(e: unknown): string {
  const raw = rawMessage(e);
  for (const [re, key] of KNOWN) {
    const m = raw.match(re);
    if (m) return typeof key === "function" ? key(m) : t(key);
  }
  return raw;
}
