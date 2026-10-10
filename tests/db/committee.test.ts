/**
 * Runs the real migration against a throwaway Postgres and exercises the money rules
 * and authorization as real users would hit them through Supabase.
 * Requires TEST_DATABASE_URL pointing at a superuser connection to an empty server.
 * Skipped when it isn't set.
 */
import { readdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPeriods, CommitteeConfig } from "../../src/domain/schedule";
import { pickWinner } from "../../src/domain/toss";

const url = process.env.TEST_DATABASE_URL;
const dbName = `committee_test_${Date.now()}`;
let admin: pg.Client;
let db: pg.Client;

const users = { owner: randomUUID(), org2: randomUUID(), m3: randomUUID(), m4: randomUUID(), m5: randomUUID(), outsider: randomUUID() };
type Who = keyof typeof users;

/** Run SQL as a signed-in user under RLS, exactly like a PostgREST request. */
async function as<T extends pg.QueryResultRow = any>(who: Who, sql: string, params: unknown[] = []) {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [users[who]]);
    const r = await db.query<T>(sql, params);
    await db.query("commit");
    return r;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}
const rpc = async (who: Who, fn: string, args: unknown[]) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(", ");
  return (await as(who, `select public.${fn}(${ph}) as v`, args)).rows[0]?.v;
};
const setToday = (d: string) =>
  db.query(`create or replace function public.pkt_today() returns date language sql stable as $$ select '${d}'::date $$`);

let committeeId: string;
const members: Record<string, string> = {}; // who → committee_members.id

describe.skipIf(!url)("database: committee lifecycle", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`create database ${dbName}`);
    db = new pg.Client({ connectionString: url!.replace(/\/[^/?]*(\?|$)/, `/${dbName}$1`) });
    await db.connect();
    await db.query(readFileSync("tests/db/supabase-stub.sql", "utf8"));
    // Every migration except storage (needs Supabase's storage schema).
    for (const f of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql") && !f.includes("storage")).sort()) {
      await db.query(readFileSync(`supabase/migrations/${f}`, "utf8"));
    }
    for (const [name, id] of Object.entries(users)) {
      await db.query("insert into auth.users (id, raw_user_meta_data) values ($1, $2)", [id, { display_name: name }]);
    }
    await setToday("2026-10-10");
  });
  afterAll(async () => {
    await db?.end();
    await admin?.query(`drop database if exists ${dbName}`);
    await admin?.end();
  });

  it("takes the name from Google and only accepts Pakistani mobile numbers", async () => {
    const g = randomUUID();
    await db.query("insert into auth.users (id, raw_user_meta_data) values ($1, $2)", [g, { full_name: "Ayesha Khan", email: "a@x.pk" }]);
    expect((await db.query("select display_name from profiles where id = $1", [g])).rows[0].display_name).toBe("Ayesha Khan");
    await expect(as("owner", "update profiles set phone = '0511234567' where id = auth.uid()")).rejects.toThrow(/profiles_phone_check/);
    await as("owner", "update profiles set phone = '03001234567' where id = auth.uid()");
    // Someone else's profile is untouchable.
    const r = await as("m3", "update profiles set display_name = 'hacked' where id = $1", [users.owner]);
    expect(r.rowCount).toBe(0);
  });

  it("repairs an account that signed in before its profile existed", async () => {
    const early = randomUUID();
    // Simulate signing in with Google before the schema (and its trigger) existed.
    await db.query("alter table auth.users disable trigger on_auth_user_created");
    await db.query("insert into auth.users (id, raw_user_meta_data) values ($1, $2)", [early, { full_name: "Early Bird" }]);
    await db.query("alter table auth.users enable trigger on_auth_user_created");
    expect((await db.query("select 1 from profiles where id = $1", [early])).rowCount).toBe(0);

    const asEarly = async (sql: string) => {
      await db.query("begin");
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [early]);
      const r = await db.query(sql);
      await db.query("commit");
      return r;
    };
    await asEarly("select public.ensure_my_profile()");
    await asEarly("select public.ensure_my_profile()"); // idempotent
    expect((await asEarly("select display_name from profiles where id = auth.uid()")).rows).toEqual([{ display_name: "Early Bird" }]);
  });

  it("rejects an inconsistent committee at the database level", async () => {
    await expect(rpc("owner", "create_committee", ["Bad", null, 5, 20000, "daily", null, 30, "2026-11-01",
      2500000, "Committee Account", "03001234567", null, 30000000, 30000000, null])).rejects.toThrow(/payout_is_consistent/);
  });

  it("creates the pilot committee and lets 4 people join with a code", async () => {
    committeeId = await rpc("owner", "create_committee", ["Pilot", "5 × Rs 200 daily", 5, 20000, "daily", null, 30,
      "2026-11-01", 3000000, "Committee Account", "03001234567", "Send to this JazzCash number", 30000000, 30000000, null]);
    const code: string = await rpc("owner", "create_invitation", [committeeId, 72]);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    await expect(rpc("m3", "create_invitation", [committeeId, 72])).rejects.toThrow(/organizers/);
    for (const who of ["org2", "m3", "m4", "m5"] as Who[]) await rpc(who, "join_committee", [code.toLowerCase()]);
    expect(await rpc("m5", "join_committee", [code])).toBe(committeeId); // idempotent
    await expect(rpc("outsider", "join_committee", [code])).rejects.toThrow(/full/);
    const rows = (await as("owner", "select id, user_id from committee_members where committee_id = $1", [committeeId])).rows;
    for (const r of rows) members[Object.entries(users).find(([, id]) => id === r.user_id)![0]] = r.id;
    await rpc("owner", "set_member_role", [members.org2, "organizer"]);
  });

  it("generates the same 150-day schedule as the app's TypeScript", async () => {
    await rpc("owner", "activate_committee", [committeeId]);
    await expect(rpc("owner", "activate_committee", [committeeId])).rejects.toThrow(/already/);
    const sql = (await as("m3", "select period_index, round, to_char(due_date, 'YYYY-MM-DD') d from contribution_schedules where committee_id = $1 order by period_index", [committeeId])).rows;
    const ts = buildPeriods(CommitteeConfig.parse({ memberCount: 5, contributionPaisa: 20000, frequency: "daily",
      periodsPerRound: 30, startDate: "2026-11-01", payoutPaisa: 3000000 }));
    expect(sql.map(r => [r.period_index, r.round, r.d])).toEqual(ts.map(p => [p.index, p.round, p.dueDate]));
    const n = (await as("m3", "select count(*)::int n from contribution_obligations where committee_id = $1", [committeeId])).rows[0].n;
    expect(n).toBe(750);
  });

  it("hides everything from outsiders and blocks direct writes", async () => {
    expect((await as("outsider", "select * from committees")).rowCount).toBe(0);
    expect((await as("outsider", "select * from contribution_obligations")).rowCount).toBe(0);
    await expect(as("m3", "update contribution_obligations set state = 'verified'")).rejects.toThrow(/permission denied/);
    await expect(as("m3", "insert into audit_events (action, entity) values ('x','y')")).rejects.toThrow(/permission denied/);
    await expect(as("m3", "delete from audit_events")).rejects.toThrow(/permission denied/);
  });

  const roundOneIds = async (who: Who) =>
    (await as(who, "select id from contribution_obligations where member_id = $1 and round = 1 order by due_date", [members[who]])).rows.map(r => r.id);

  let m3Sub: string;
  it("takes a weekend catch-up transfer covering several days, as Submitted", async () => {
    const ids = (await roundOneIds("m3")).slice(0, 2);
    const req = randomUUID();
    m3Sub = await rpc("m3", "submit_payment", [members.m3, ids, 40000, "726755086850", "2026-11-02T20:16:00+05:00", null, null, req]);
    expect(await rpc("m3", "submit_payment", [members.m3, ids, 40000, "726755086850", null, null, null, req])).toBe(m3Sub); // retry
    const states = (await as("m4", "select state from contribution_obligations where id = any($1)", [ids])).rows.map(r => r.state);
    expect(states).toEqual(["submitted", "submitted"]);
  });

  it("refuses wrong amounts, reused TIDs, and paying someone else's dues", async () => {
    const ids = await roundOneIds("m4");
    await expect(rpc("m4", "submit_payment", [members.m4, [ids[0]], 30000, null, null, null, null, randomUUID()])).rejects.toThrow(/does not match/);
    await expect(rpc("m4", "submit_payment", [members.m4, [ids[0]], 20000, "726755086850", null, null, null, randomUUID()])).rejects.toThrow(/already been submitted/);
    await expect(rpc("m4", "submit_payment", [members.m3, [ids[0]], 20000, null, null, null, null, randomUUID()])).rejects.toThrow(/your own/);
  });

  it("only organizers verify, never their own payment", async () => {
    await expect(rpc("m4", "verify_submission", [m3Sub, 40000])).rejects.toThrow(/organizers/);
    await rpc("owner", "verify_submission", [m3Sub, 40000]);
    await rpc("owner", "verify_submission", [m3Sub, 40000]); // idempotent
    const ownSub = await rpc("owner", "submit_payment", [members.owner, (await roundOneIds("owner")).slice(0, 1), 20000, "111111111", null, null, null, randomUUID()]);
    await expect(rpc("owner", "verify_submission", [ownSub, 20000])).rejects.toThrow(/Another organizer/);
    await rpc("org2", "verify_submission", [ownSub, 20000]);
  });

  it("rejection puts the days back as payable, and a family member can pay via the organizer", async () => {
    const ids = (await roundOneIds("m4")).slice(0, 1);
    const sub = await rpc("m4", "submit_payment", [members.m4, ids, 20000, "222222222", null, null, null, randomUUID()]);
    await expect(rpc("owner", "reject_submission", [sub, ""])).rejects.toThrow(/reason/);
    await rpc("owner", "reject_submission", [sub, "Not in account history"]);
    expect((await as("m4", "select state from contribution_obligations where id = $1", [ids[0]])).rows[0].state).toBe("rejected");
    const fam = await rpc("org2", "submit_payment", [members.m4, ids, 20000, "222222222", null, "Brother", null, randomUUID()]);
    expect((await as("m4", "select paid_by_name from payment_submissions where id = $1", [fam])).rows[0].paid_by_name).toBe("Brother");
  });

  let roundId: string;
  it("leaves members in arrears out of the toss, and draws auditably", async () => {
    await expect(rpc("owner", "draw_toss", [committeeId, 1, "app", null])).rejects.toThrow(/Toss day/);
    // Everyone except m5 pays the rest of round 1; organizers verify.
    for (const who of ["owner", "org2", "m3", "m4"] as Who[]) {
      const pending = (await as(who, "select id, amount_paisa from contribution_obligations where member_id = $1 and round = 1 and state in ('due','rejected')", [members[who]])).rows;
      if (pending.length === 0) continue;
      const total = pending.reduce((s, r) => s + Number(r.amount_paisa), 0);
      const sub = await rpc(who, "submit_payment", [members[who], pending.map(r => r.id), total, null, null, null, null, randomUUID()]);
      await rpc(who === "owner" ? "org2" : "owner", "verify_submission", [sub, total]);
    }
    // Remaining pending claims (e.g. the brother's payment that org2 entered) need the *other* organizer.
    const subs = (await as("owner", "select id, amount_paisa, submitted_by from payment_submissions where status = 'pending'")).rows;
    for (const s of subs) {
      const verifier: Who = s.submitted_by === users.owner ? "org2" : "owner";
      await rpc(verifier, "verify_submission", [s.id, Number(s.amount_paisa)]);
    }

    await setToday("2026-11-30");
    const elig = (await as("m3", "select * from toss_eligibility($1, 1)", [committeeId])).rows;
    expect(elig.find(e => e.member_id === members.m5)).toMatchObject({ eligible: false, reason: "arrears", arrears_paisa: "600000" });
    await expect(rpc("m3", "draw_toss", [committeeId, 1, "app", null])).rejects.toThrow(/organizers/);
    roundId = await rpc("owner", "draw_toss", [committeeId, 1, "app", null]);
    expect(await rpc("owner", "draw_toss", [committeeId, 1, "app", null])).toBe(roundId); // drawn once
    const r = (await as("m5", "select * from payout_rounds where id = $1", [roundId])).rows[0];
    expect(r.eligible_member_ids).not.toContain(members.m5);
    expect(r.eligible_member_ids).toHaveLength(4);
    // Anyone can re-check the draw from the recorded inputs.
    expect(pickWinner([...r.eligible_member_ids].sort(), Number(r.random_value))).toBe(r.winner_member_id);
  });

  it("shows the dashboard: who is behind, what's pending, which round", async () => {
    // Toss day of round 1; m5 still owes all 30 days.
    const d = (await as("m3", "select public.committee_dashboard($1) d", [committeeId])).rows[0].d;
    expect(d.today).toBe("2026-11-30");
    expect(d.current_round).toBe(1);
    expect(d.rounds).toHaveLength(5);
    expect(d.rounds[0]).toMatchObject({ round: 1, toss_date: "2026-11-30", status: "drawn" });
    const m5 = d.members.find((m: any) => m.member_id === members.m5);
    expect(m5).toMatchObject({ overdue_paisa: 580000, overdue_count: 29, today_state: "due", paid_out: false });
    expect(d.members.filter((m: any) => m.paid_out)).toHaveLength(1);
    await expect(as("outsider", "select public.committee_dashboard($1)", [committeeId])).rejects.toThrow(/Not a member/);
  });

  it("lets the organizer pay out a short pot (settled within the family), logging the shortfall", async () => {
    await expect(rpc("owner", "record_payout", [roundId, 0, null, "2026-11-30T21:00:00+05:00", null])).rejects.toThrow(/amount/);
    await rpc("owner", "record_payout", [roundId, 2400000, "333333333", "2026-11-30T21:00:00+05:00", null]);
    const log = (await as("m3", "select details from audit_events where action = 'payout.recorded' and committee_id = $1", [committeeId])).rows[0].details;
    expect(log).toMatchObject({ pot_paisa: 3000000, verified_paisa: 2400000, unverified_shortfall_paisa: 600000 });

    const winner = (await as("owner", "select winner_member_id from payout_rounds where id = $1", [roundId])).rows[0].winner_member_id;
    const winnerWho = Object.keys(members).find(k => members[k] === winner) as Who;
    const notWinner = (["owner", "org2", "m3", "m4"] as Who[]).find(w => w !== winnerWho)!;
    await expect(rpc(notWinner, "confirm_payout", [roundId, true, null])).rejects.toThrow(/recipient/);
    await rpc(winnerWho, "confirm_payout", [roundId, true, null]);
    expect((await as("m3", "select status from payout_rounds where id = $1", [roundId])).rows[0].status).toBe("confirmed");
  });

  it("keeps an audit trail members can read but not change", async () => {
    const actions = (await as("m3", "select action from audit_events where committee_id = $1 order by id", [committeeId])).rows.map(r => r.action);
    expect(actions).toEqual(expect.arrayContaining(["committee.created", "payment.verified", "payment.rejected", "toss.drawn", "payout.recorded", "payout.confirmed"]));
    await expect(as("owner", "update audit_events set action = 'x'")).rejects.toThrow(/permission denied/);
  });
});
