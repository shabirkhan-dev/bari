/**
 * Design screenshots of every Figma screen in light/dark × English/Urdu, for comparing
 * with the Figma frames. Skipped unless SHOTS=1:  SHOTS=1 npx playwright test shots
 * Narrow with --grep, e.g.  --grep "members en light"
 */
import type { Page } from "@playwright/test";
import { asMember, makeState, setup, test, TODAY, type State } from "./fixtures";

const OUT = process.env.SHOTS_DIR ?? "test-results/shots";
type Shot = { path: string; signedIn?: boolean; member?: boolean; state?: (s: State) => void; act?: (p: Page) => Promise<void> };

const drawn = (s: State) => {
  s.payoutRound = { id: "pr1", round: 1, toss_date: TODAY, draw_method: "app", eligible_member_ids: ["m1", "m3", "m4"], excluded: [],
    random_value: 7731, winner_member_id: "m3", drawn_at: new Date().toISOString(), status: "paid",
    payout_records: { amount_paisa: 3000000, tid: "1", paid_at: new Date().toISOString(), confirmed_at: null, dispute_reason: null } };
  s.dashboard.rounds[0]!.status = "paid";
  s.dashboard.rounds[0]!.winner_member_id = "m3";
};

const screens: Record<string, Shot> = {
  welcome: { path: "/", signedIn: false },
  home: { path: "/", member: true },
  pay: { path: "/c/c1/pay", member: true },
  ledger: { path: "/ledger", member: true },
  toss: { path: "/toss", member: true },
  receipt: { path: "/c/c1/review/s1" },
  verify: { path: "/", state: s => { s.profile.phone = null; } , act: async p => { for (const k of "0300123441") await p.getByRole("button", { name: k, exact: true }).first().click(); } },
  join: { path: "/join/K7QM2XWP", member: true },
  submitted: { path: "/c/c1/pay", member: true, act: async p => {
    await p.getByRole("button", { name: /TID/ }).click();
    await p.locator('input[inputmode="numeric"]').fill("846219370021");
    await p.getByRole("button", { name: /Slide to submit|سلائیڈ/ }).press("Enter");
    await p.waitForTimeout(300);
  } },
  members: { path: "/members", member: true },
  result: { path: "/toss", member: true, state: drawn },
  updates: { path: "/inbox", member: true },
  settings: { path: "/me", member: true },
  newc: { path: "/new" },
  invite: { path: "/c/c2" },
  orghome: { path: "/" },
  receipts: { path: "/receipts" },
  live: { path: "/toss", state: s => { s.dashboard.rounds[0]!.toss_date = TODAY; }, act: async p => {
    await p.getByRole("button", { name: /Slide to toss|قرعہ کے لیے/ }).press("Enter");
    await p.waitForTimeout(700);
  } },
  payout: { path: "/c/c1/payout/1", state: s => { drawn(s); (s.payoutRound as Record<string, unknown>).status = "drawn"; } }
};

test.describe("design shots", () => {
  test.skip(!process.env.SHOTS, "set SHOTS=1 to capture");
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  for (const lang of ["en", "ur"] as const)
    for (const theme of ["light", "dark"] as const)
      for (const [name, shot] of Object.entries(screens))
        test(`${name} ${lang} ${theme}`, async ({ page }) => {
          const state = makeState();
          if (shot.member) asMember(state);
          shot.state?.(state);
          await setup(page, { lang, signedIn: shot.signedIn ?? true, state });
          await page.addInitScript(t => localStorage.setItem("bari.theme", t), theme);
          await page.goto(shot.path);
          await page.waitForLoadState("networkidle");
          await shot.act?.(page);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(450);
          await page.screenshot({ path: `${OUT}/${name}-${lang}-${theme}.png` });
        });
});
