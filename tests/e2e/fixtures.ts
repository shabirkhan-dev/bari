/**
 * A fake Supabase for end-to-end tests: a signed-in user, realistic committee data,
 * and a log of every call the app makes so tests can assert on what was sent.
 */
import { test as base, type Page, type Route } from "@playwright/test";

export const SB = "https://ohsisapfjtesxfzihqbt.supabase.co";
export const UID = "11111111-1111-4111-8111-111111111111";
export const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

const NAMES = ["Shabir Khan", "Ayesha Bibi", "Imran Ali", "Sumera Khan", "Faisal Karim"];

export function makeState() {
  const start = addDays(TODAY, -9);
  const member = (i: number, x: Record<string, unknown> = {}) => ({
    member_id: `m${i}`, user_id: i ? `u${i}` : UID, name: NAMES[i], phone: `0300123456${i}`,
    role: i === 0 ? "owner" : "member", today_state: "due", overdue_paisa: 0, overdue_count: 0, pending_paisa: 0, paid_out: false, ...x
  });
  return {
    profile: { id: UID, display_name: "Shabir Khan", phone: "03001234567" } as { id: string; display_name: string; phone: string | null },
    home: [
      { id: "c1", name: "Family committee", status: "active", role: "owner", member_count: 5, joined: 5, contribution_paisa: 20000,
        frequency: "daily", interval_days: null, start_date: start, payout_paisa: 3000000, rounds_total: 5, current_round: 1,
        toss_date: addDays(TODAY, 20), today_state: "due", due_today_paisa: 20000, overdue_paisa: 40000 },
      { id: "c2", name: "Office friends", status: "forming", role: "owner", member_count: 8, joined: 3, contribution_paisa: 500000,
        frequency: "monthly", interval_days: null, start_date: addDays(TODAY, 20), payout_paisa: 4000000, rounds_total: 8,
        current_round: null, toss_date: null, today_state: null, due_today_paisa: 0, overdue_paisa: 0 }
    ],
    dashboard: {
      today: TODAY,
      committee: { id: "c1", name: "Family committee", description: null, status: "active", member_count: 5, contribution_paisa: 20000,
        frequency: "daily", interval_days: null, periods_per_round: 30, start_date: start, payout_paisa: 3000000,
        account_title: "Shabir Khan", account_number: "03001234567", instructions: "Send by 9 pm." },
      cutoff: "21:00",
      me: { member_id: "m0", role: "owner" },
      current_round: 1,
      pending_reviews: 1,
      month: { receive_limit_paisa: 3000000, send_limit_paisa: 30000000, received_paisa: 0, expected_paisa: 2800000, sent_paisa: 0, payouts_due_paisa: 0 },
      rounds: [1, 2, 3, 4, 5].map(r => ({ round: r, first_due: addDays(start, (r - 1) * 30), toss_date: addDays(start, r * 30 - 1),
        verified_paisa: r === 1 ? 900000 : 0, status: null as string | null, winner_member_id: null as string | null })),
      members: [member(0, { overdue_paisa: 40000, overdue_count: 2 }), member(1, { today_state: "verified" }),
        member(2, { overdue_paisa: 60000, overdue_count: 3 }), member(3, { today_state: "submitted", pending_paisa: 20000 }), member(4)]
    },
    ledger: {
      today: TODAY, member_id: "m0", current_round: 1, periods_per_round: 30,
      rounds: [1, 2, 3, 4, 5].map(r => ({ round: r, first_due: addDays(start, (r - 1) * 30), toss_date: addDays(start, r * 30 - 1),
        total_paisa: 600000, paid_paisa: r === 1 ? 140000 : 0, waiting_paisa: 0, unpaid_paisa: r === 1 ? 60000 : 0 })),
      days: Array.from({ length: 30 }, (_, i) => ({ id: `d${i}`, due_date: addDays(start, i), amount_paisa: 20000, n: i + 1,
        state: i < 7 ? "verified" : "due" })),
      history: [
        { id: "h2", created_at: new Date().toISOString(), amount_paisa: 20000, status: "pending", decision_reason: null, decided_at: null, tid: "731900426615", paid_by_name: null, periods: [{ round: 1, n: 7 }] },
        { id: "h1", created_at: new Date(Date.now() - 864e5).toISOString(), amount_paisa: 120000, status: "verified", decision_reason: null, decided_at: new Date(Date.now() - 80e6).toISOString(), tid: "726755086850", paid_by_name: null, periods: [{ round: 1, n: 1 }, { round: 1, n: 6 }] }
      ]
    },
    payable: [-2, -1, 0, 1, 2, 3, 4, 5].map(d => ({ id: `d${9 + d}`, due_date: addDays(TODAY, d), amount_paisa: 20000, state: "due" })),
    queue: [
      { id: "s1", status: "pending", member_id: "m3", member_name: "Sumera Khan", member_phone: "03001234563", submitted_by_name: "Sumera Khan",
        paid_by_name: null, amount_paisa: 20000, tid: "726755086850", transferred_at: null, created_at: TODAY, due_dates: [TODAY],
        receipt_path: null, receipt_type: null, receipt_size: null, receipt_created_at: null, receipt_amount_paisa: 20000, receipt_successful: true,
        periods: [{ round: 1, n: 10 }], can_decide: true }
    ],
    eligibility: [
      { member_id: "m0", eligible: false, reason: "arrears", arrears_paisa: 40000 },
      { member_id: "m1", eligible: true, reason: null, arrears_paisa: 0 },
      { member_id: "m2", eligible: false, reason: "arrears", arrears_paisa: 60000 },
      { member_id: "m3", eligible: true, reason: null, arrears_paisa: 0 },
      { member_id: "m4", eligible: true, reason: null, arrears_paisa: 0 }
    ],
    payoutRound: null as Record<string, unknown> | null,
    notifications: [
      { id: "n1", kind: "payment.submitted", payload: { amount_paisa: 20000, member_name: "Sumera Khan" }, read_at: null as string | null, created_at: new Date().toISOString(), committee_id: "c1", committees: { name: "Family committee" } },
      { id: "n2", kind: "payment.rejected", payload: { reason: "Not in the account history" }, read_at: null as string | null, created_at: new Date().toISOString(), committee_id: "c1", committees: { name: "Family committee" } }
    ],
    audit: [
      { id: 2, action: "payment.verified", actor_name: "Ayesha Bibi", details: { amount_paisa: 60000 }, created_at: new Date().toISOString() },
      { id: 1, action: "committee.created", actor_name: "Shabir Khan", details: {}, created_at: new Date(Date.now() - 864e5).toISOString() }
    ]
  };
}
export type State = ReturnType<typeof makeState>;
export interface Call { method: string; path: string; body: any }

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** Signs in, picks language/theme, and serves the fake backend. Returns the call log. */
export async function setup(page: Page, opts: { state?: State; lang?: "en" | "ur"; signedIn?: boolean; receipt?: Buffer } = {}) {
  const state = opts.state ?? makeState();
  const calls: Call[] = [];
  const session = {
    access_token: "x.eyJzdWIiOiIxIn0.x", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "r",
    user: { id: UID, aud: "authenticated", role: "authenticated", email: "s@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-10-10T00:00:00Z" }
  };
  await page.addInitScript(([s, lang, signedIn]) => {
    if (signedIn) localStorage.setItem("sb-ohsisapfjtesxfzihqbt-auth-token", s as string);
    localStorage.setItem("bari.lang", lang as string);
    localStorage.setItem("bari.theme", "light");
  }, [JSON.stringify(session), opts.lang ?? "en", opts.signedIn ?? true] as const);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.route(`${SB}/**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    let body: any = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    calls.push({ method: req.method(), path: url.pathname, body });
    const wantsObject = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const rpc = url.pathname.replace("/rest/v1/rpc/", "");
    switch (url.pathname) {
      case "/rest/v1/profiles": return json(route, wantsObject ? state.profile : [state.profile]);
      case "/rest/v1/notifications":
        if (req.method() === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": `*/${state.notifications.filter(n => !n.read_at).length}`, "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" }, body: "" });
        if (req.method() === "PATCH") { state.notifications.forEach(n => (n.read_at = new Date().toISOString())); return route.fulfill({ status: 204, body: "" }); }
        return json(route, state.notifications);
      case "/rest/v1/payout_rounds": return json(route, wantsObject ? state.payoutRound : state.payoutRound ? [state.payoutRound] : []);
      case "/rest/v1/committee_invitations": return json(route, wantsObject ? { code: "K7QM2XWP", expires_at: addDays(TODAY, 7) } : []);
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      switch (rpc) {
        case "my_home": return json(route, state.home);
        case "committee_dashboard_v2": case "committee_dashboard_v3": return json(route, state.dashboard);
        case "my_ledger": return json(route, state.ledger);
        case "my_payable": case "member_payable": return json(route, state.payable);
        case "review_queue": return json(route, state.queue);
        case "toss_eligibility": return json(route, state.eligibility);
        case "audit_feed": return json(route, state.audit);
        case "submit_payment": return json(route, "sub-123");
        case "attach_receipt": return json(route, "rcpt-1");
        case "create_committee": return json(route, "c-new");
        case "draw_toss":
          state.payoutRound = { id: "pr1", round: body.p_round, toss_date: TODAY, draw_method: "app", eligible_member_ids: ["m1", "m3", "m4"],
            excluded: [], random_value: 7, winner_member_id: "m3", drawn_at: new Date().toISOString(), status: "drawn", payout_records: null };
          return json(route, "pr1");
        case "record_payout":
          Object.assign(state.payoutRound!, { status: "paid", payout_records: { amount_paisa: body.p_amount_paisa, tid: body.p_tid, paid_at: body.p_paid_at, confirmed_at: null, dispute_reason: null } });
          return json(route, "rec1");
        default: return route.fulfill({ status: 204, body: "" }); // verify/reject/update/role/etc.
      }
    }
    if (url.pathname.startsWith("/storage/v1/object/receipts/")) return json(route, { Key: url.pathname });
    if (url.pathname.startsWith("/storage/v1/object/sign/")) {
      if (req.method() === "GET") return route.fulfill({ status: 200, contentType: "image/jpeg", body: opts.receipt ?? Buffer.alloc(0) });
      return json(route, { signedURL: "/object/sign/receipts/x.jpg?token=t" });
    }
    return json(route, { message: `unmocked ${url.pathname}` }, 500);
  });
  return { state, calls, rpcCalls: (name: string) => calls.filter(c => c.path === `/rest/v1/rpc/${name}`) };
}

/** A JazzCash-style receipt image rendered in the browser (synthetic data, no real names). */
export async function renderReceipt(page: Page, tid = "731900426615", amount = "600.00"): Promise<Buffer> {
  const p = await page.context().newPage();
  await p.setViewportSize({ width: 360, height: 640 });
  await p.setContent(`<div style="font-family:Arial,sans-serif;padding:28px;text-align:center;background:#fff;color:#333">
    <p style="color:#777">October 11,2026 at 09:42</p>
    <h2 style="color:#9b2c2c">Transaction Successful</h2><p style="color:#777">Money Transferred</p>
    <h1>Rs. ${amount}</h1><p>transferred to</p><h3>TEST RECEIVER</h3>
    <table style="width:100%;margin-top:24px;font-size:18px"><tr><td style="text-align:left">Transaction Amount</td><td style="text-align:right">Rs. ${amount}</td></tr>
    <tr><td style="text-align:left">TID</td><td style="text-align:right">${tid}</td></tr></table></div>`);
  const buf = await p.screenshot();
  await p.close();
  return buf;
}

export const test = base;
export { expect } from "@playwright/test";
