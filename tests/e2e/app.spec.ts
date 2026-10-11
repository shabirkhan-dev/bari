import { asMember, expect, makeState, renderReceipt, setup, test, TODAY } from "./fixtures";

test.describe("sign-in", () => {
  test("shows Google sign-in, in English and Urdu (right-to-left)", async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByText("Save together,")).toBeVisible();
    await page.getByRole("radio", { name: "اردو" }).click();
    await expect(page.getByRole("button", { name: "گوگل کے ساتھ جاری رکھیں" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});

test.describe("home", () => {
  test("shows the running committee: pot, what's owed, next toss", async ({ page }) => {
    await setup(page, { state: asMember(makeState()) });
    await page.goto("/");
    await expect(page.getByText("Pot this round")).toBeVisible();
    await expect(page.getByText("3 days still to pay")).toBeVisible(); // two missed + today
    await expect(page.getByRole("link", { name: /Pay Rs 600 now/ })).toHaveAttribute("href", "/c/c1/pay");
    await expect(page.getByText(/Next toss/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Notifications (2)" })).toBeVisible();
    // Hide amounts
    await page.getByRole("button", { name: "Hide amounts" }).click();
    await expect(page.getByRole("button", { name: "Show amounts" })).toBeVisible();
    // Switcher lists the forming committee too
    await page.getByRole("button", { name: /Your committees/ }).click();
    await expect(page.getByRole("dialog").getByText("Still forming · 3/8")).toBeVisible();
  });

  test("with no running committee, lists committees", async ({ page }) => {
    const state = makeState();
    state.home = state.home.filter(h => h.status === "forming");
    await setup(page, { state });
    await page.goto("/");
    await expect(page.getByText("Office friends")).toBeVisible();
    await expect(page.getByText("3 of 8 joined")).toBeVisible();
  });

  test("ledger: paid and still to pay for the round, searchable history", async ({ page }) => {
    await setup(page);
    await page.goto("/ledger");
    await expect(page.getByText("You paid in")).toBeVisible();
    await expect(page.getByText("Rs 1,400.00", { exact: true })).toBeVisible();
    await expect(page.getByText("Still to pay")).toBeVisible();
    await expect(page.getByText("Day 7 · You")).toBeVisible();
    await expect(page.getByText("Days 1–6 · You")).toBeVisible();
    await page.getByRole("button", { name: "Filter: All" }).click(); // → pending only
    await expect(page.getByText("Days 1–6 · You")).toHaveCount(0);
    await page.getByRole("button", { name: "Filter: Pending" }).click(); // → verified only
    await expect(page.getByText("Day 7 · You")).toHaveCount(0);
    await expect(page.getByText("Days 1–6 · You")).toBeVisible();
  });

  test("organizer home: today's money, what to check, quick approve", async ({ page }) => {
    const { rpcCalls } = await setup(page);
    await page.goto("/");
    await expect(page.getByText("Collected today")).toBeVisible();
    await expect(page.getByText("Waiting for you")).toBeVisible();
    await expect(page.getByRole("link", { name: "Receipts", exact: true })).toBeVisible(); // organizer tab
    await page.getByRole("button", { name: "Approve Sumera Khan" }).click();
    await expect.poll(() => rpcCalls("verify_submission").length).toBe(1);
    expect(rpcCalls("verify_submission")[0]!.body).toEqual({ p_submission_id: "s1", p_confirmed_amount_paisa: 20000 });
  });

  test("updates read as sentences; mark all as read; tap opens the right screen", async ({ page }) => {
    const { calls } = await setup(page);
    await page.goto("/inbox");
    await expect(page.getByText("Sumera sent a receipt")).toBeVisible();
    await expect(page.getByText(/Not in the account history/)).toBeVisible();
    expect(calls.some(c => c.method === "PATCH" && c.path === "/rest/v1/notifications")).toBe(false);
    await page.getByRole("button", { name: "Mark all as read" }).click();
    await expect.poll(() => calls.some(c => c.method === "PATCH" && c.path === "/rest/v1/notifications")).toBe(true);
    await page.getByText("Sumera sent a receipt").click();
    await expect(page).toHaveURL(/\/c\/c1\/review$/);
  });

  test("members: who paid today, each member's days, remind and record", async ({ page }) => {
    await setup(page);
    await page.goto("/members");
    await expect(page.getByText("1 of 5 paid today")).toBeVisible();
    await expect(page.getByText("10/10 days")).toBeVisible();
    await page.getByRole("button", { name: /Imran Ali/ }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Remind on WhatsApp")).toBeVisible();
    await sheet.getByText("Record a payment for Imran").click();
    await expect(page).toHaveURL(/\/c\/c1\/pay\/m2$/);
  });
});

test.describe("committee", () => {
  test("new committee: live pot maths, optional fine, the exact request", async ({ page }) => {
    const { rpcCalls } = await setup(page);
    await page.goto("/new");
    await page.getByLabel("Committee name").fill("Cousins");
    await expect(page.getByText("Rs 30,000", { exact: true })).toBeVisible(); // 5 × Rs 200 × 30
    await expect(page.getByText("5 rounds · 150 days · everyone wins once")).toBeVisible();
    await page.getByRole("button", { name: "+ Members" }).click();
    await expect(page.getByText("Rs 36,000", { exact: true })).toBeVisible(); // 6 × Rs 200 × 30
    await page.getByRole("switch", { name: "Late fine" }).click();
    await page.getByRole("button", { name: /Payments go to/ }).click();
    await page.getByRole("dialog").getByRole("radio", { name: "Weekly" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Rs 48,000", { exact: true })).toBeVisible(); // 6 × Rs 2,000 × 4 weeks
    await page.getByRole("button", { name: "Slide to create" }).press("Enter");
    await expect(page).toHaveURL(/\/c\/c-new$/);
    expect(rpcCalls("create_committee")[0]!.body).toMatchObject({
      p_name: "Cousins", p_member_count: 6, p_contribution_paisa: 200000, p_frequency: "weekly",
      p_periods_per_round: 4, p_payout_paisa: 4800000, p_account_number: "03001234567"
    });
    expect(rpcCalls("set_late_fine")[0]!.body).toEqual({ p_committee_id: "c-new", p_fine_paisa: 5000 });
  });

  test("invite: the code, who joined, open spots", async ({ page }) => {
    await setup(page);
    await page.goto("/c/c2");
    await expect(page.getByText("K7QM-2XWP")).toBeVisible();
    await expect(page.getByText("Members · 3 of 5")).toBeVisible();
    await expect(page.getByText("Open spot")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Slide to start" })).toHaveCount(0); // not full yet
  });

  test("join: preview the committee, then slide to join", async ({ page }) => {
    const { rpcCalls } = await setup(page);
    await page.goto("/join/k7qm-2xwp");
    await expect(page.getByRole("heading", { name: "Office friends" })).toBeVisible();
    await expect(page.getByText("Rs 50 fine if you pay late")).toBeVisible();
    await expect(page.getByText("3 members joined · 2 spots left")).toBeVisible();
    await page.getByRole("button", { name: "Slide to join" }).press("Enter");
    await expect.poll(() => rpcCalls("join_committee").length).toBe(1);
    expect(rpcCalls("join_committee")[0]!.body).toEqual({ p_code: "K7QM2XWP" });
    await expect(page).toHaveURL(/\/c\/c2$/);
  });

  test("join: a wrong code says so", async ({ page }) => {
    await setup(page);
    await page.goto("/join/WRONG234");
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("running committee shows banners, members and the pay button", async ({ page }) => {
    await setup(page);
    await page.goto("/c/c1");
    await expect(page.getByText("1 to check")).toBeVisible();
    await expect(page.getByText(/This month Rs 28,000 is due in/)).toBeVisible(); // ≥ 80% of the Rs 30,000 limit
    await expect(page.getByText("Rs 600 late")).toBeVisible();
    await expect(page.getByRole("link", { name: "Remind Imran Ali on WhatsApp" })).toHaveAttribute("href", /wa\.me\/923001234562/);
    await expect(page.getByRole("button", { name: "I've paid" })).toBeVisible();
  });
});

test.describe("payments", () => {
  test("pay: oldest days first, OCR reads the receipt, slide to submit", async ({ page }) => {
    const receipt = await renderReceipt(page, "731900426615", "600.00");
    const { rpcCalls, calls } = await setup(page);
    await page.goto("/c/c1/pay");
    await expect(page.getByRole("radio", { name: "3 days" })).toHaveAttribute("aria-checked", "true"); // two missed + today
    await expect(page.getByText("Send Rs 600 to Shabir")).toBeVisible();
    await expect(page.getByText("Days 8–10 · Family committee")).toBeVisible();
    // Sliding without a receipt or TID asks for one
    await page.getByRole("button", { name: "Slide to submit" }).press("Enter");
    await expect(page.getByText("Attach the receipt or type the TID to submit.")).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({ name: "r.png", mimeType: "image/png", buffer: receipt });
    await expect(page.getByText("TID 7319 0042 6615")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Receipt amount matches")).toBeVisible();
    await page.getByRole("button", { name: "Slide to submit" }).press("Enter");
    await expect(page.getByRole("heading", { name: "Payment submitted" })).toBeVisible();
    await expect(page.getByText("TID 7319 0042 6615")).toBeVisible();
    await expect(page.getByText("6-day streak · keep going")).toBeVisible();
    expect(rpcCalls("submit_payment")[0]!.body).toMatchObject({
      p_member_id: "m0", p_obligation_ids: ["d7", "d8", "d9"], p_amount_paisa: 60000, p_tid: "731900426615"
    });
    expect(rpcCalls("record_receipt_reading")[0]!.body).toEqual({ p_submission_id: "sub-123", p_amount_paisa: 60000, p_successful: true });
    expect(calls.some(c => c.path.startsWith("/storage/v1/object/receipts/c1/sub-123/"))).toBe(true);
    expect(rpcCalls("attach_receipt")[0]!.body.p_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test("organizer records a payment for a member", async ({ page }) => {
    const { rpcCalls } = await setup(page);
    await page.goto("/c/c1/pay/m2");
    await expect(page.getByRole("heading", { name: "Record for Imran Ali" })).toBeVisible();
    await page.getByRole("button", { name: "Send for checking" }).click();
    await expect(page.getByText("Sent for checking")).toBeVisible();
    expect(rpcCalls("member_payable")[0]!.body).toEqual({ p_member_id: "m2" });
    expect(rpcCalls("submit_payment")[0]!.body.p_member_id).toBe("m2");
  });

  test("receipts: reject needs a reason; approve sends the amount; history tabs", async ({ page }) => {
    const { rpcCalls } = await setup(page);
    await page.goto("/receipts");
    await expect(page.getByRole("radio", { name: "Waiting · 1" })).toBeVisible();
    await expect(page.getByText("All 3 checks passed")).toBeVisible();
    await page.getByRole("button", { name: "Reject" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Reject" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Amount is different" }).click();
    await dialog.getByRole("button", { name: "Reject" }).click();
    await expect.poll(() => rpcCalls("reject_submission").length).toBe(1);
    expect(rpcCalls("reject_submission")[0]!.body).toEqual({ p_submission_id: "s1", p_reason: "Amount is different" });
    await page.getByRole("button", { name: "Approve Sumera Khan" }).click();
    await expect.poll(() => rpcCalls("verify_submission").length).toBe(1);
    expect(rpcCalls("verify_submission")[0]!.body).toEqual({ p_submission_id: "s1", p_confirmed_amount_paisa: 20000 });
    await page.getByRole("radio", { name: "Approved" }).click();
    await expect(page.getByText(/Approved · /)).toBeVisible();
  });

  test("receipt check: the three checks, then drag to approve", async ({ page }) => {
    const { rpcCalls } = await setup(page);
    await page.goto("/c/c1/review/s1");
    await expect(page.getByRole("heading", { name: "Sumera Khan" })).toBeVisible();
    await expect(page.getByText("Day 10 of 30")).toBeVisible();
    await expect(page.getByText("All 3 checks passed")).toBeVisible();
    await expect(page.getByText("7267 5508 6850")).toBeVisible();
    const slider = page.getByRole("button", { name: "Slide to approve" });
    const box = (await slider.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up(); // released halfway: nothing happens
    expect(rpcCalls("verify_submission")).toHaveLength(0);
    await page.waitForTimeout(400); // the knob springs back
    await page.mouse.move(box.x + 30, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => rpcCalls("verify_submission").length).toBe(1);
    expect(rpcCalls("verify_submission")[0]!.body).toEqual({ p_submission_id: "s1", p_confirmed_amount_paisa: 20000 });
    await expect(page).toHaveURL(/\/c\/c1\/review$/);
  });

  test("share from JazzCash lands on the payment screen with the receipt read", async ({ page }) => {
    const receipt = await renderReceipt(page, "880011223344", "200.00");
    const state = makeState();
    state.home = state.home.filter(h => h.status === "active");
    await setup(page, { state });
    await page.goto("/");
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 }).catch(() => page.reload());
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 });
    const status = await page.evaluate(async b64 => {
      const fd = new FormData();
      fd.append("receipt", new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], "jc.png", { type: "image/png" }));
      return (await fetch("/share-receipt", { method: "POST", body: fd, redirect: "manual" })).type;
    }, receipt.toString("base64"));
    expect(status).toBe("opaqueredirect");
    await page.goto("/share");
    await expect(page).toHaveURL(/\/c\/c1\/pay$/);
    await expect(page.getByText("TID 8800 1122 3344")).toBeVisible({ timeout: 45_000 });
  });
});

test.describe("toss and payout", () => {
  test("eligibility, app draw, payout, and the recipient's view", async ({ page }) => {
    const state = makeState();
    state.dashboard.rounds[0]!.toss_date = TODAY; // toss day
    const { rpcCalls } = await setup(page, { state });
    await page.goto("/c/c1/round/1");
    await expect(page.getByText("Rs 600 not yet confirmed")).toBeVisible(); // Imran is out of this toss
    await page.getByRole("button", { name: /Draw in the app/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Draw" }).click();
    await expect(page.getByText("Sumera Khan gets the pot")).toBeVisible();
    // Anyone can re-check: 7 % 3 = 1 → second of the sorted eligible ids (m1, m3, m4) → m3.
    await expect(page.getByText("Check: number 7 gives seat 2.")).toBeVisible();
    expect(rpcCalls("draw_toss")[0]!.body).toMatchObject({ p_round: 1, p_method: "app" });

    await page.getByRole("button", { name: "Save payout" }).click();
    await expect(page.getByText("Waiting for Sumera Khan to confirm it arrived.")).toBeVisible();
    expect(rpcCalls("record_payout")[0]!.body).toMatchObject({ p_payout_round_id: "pr1", p_amount_paisa: 3000000, p_paid_at: `${TODAY}T12:00:00+05:00` });
  });

  test("toss tab: who's in, slide to toss on toss day", async ({ page }) => {
    const state = makeState();
    state.dashboard.rounds[0]!.toss_date = TODAY;
    const { rpcCalls } = await setup(page, { state });
    await page.goto("/toss");
    await expect(page.getByText("3 members still in the draw")).toBeVisible();
    await expect(page.getByText("2 sitting out: payment not verified")).toBeVisible();
    await page.getByRole("button", { name: "Slide to toss" }).press("Enter");
    await expect(page.getByText("Drawing now")).toBeVisible(); // live countdown everyone sees
    await expect(page.getByRole("button", { name: "Cancel draw" })).toBeVisible();
    await expect.poll(() => rpcCalls("draw_toss").length, { timeout: 15_000 }).toBe(1);
    expect(rpcCalls("draw_toss")[0]!.body).toMatchObject({ p_round: 1, p_method: "app" });
    await expect(page.getByText("This round goes to")).toBeVisible();
    await expect(page.getByText("Sumera Khan")).toBeVisible();
    await page.getByRole("button", { name: /Draw record R1-0007/ }).click();
    await expect(page.getByRole("dialog").getByText(/7 ÷ 3 leaves 1, so seat 2 won/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: "Send the payout" })).toHaveAttribute("href", "/c/c1/payout/1");
  });

  test("live toss can be cancelled before the pick", async ({ page }) => {
    const state = makeState();
    state.dashboard.rounds[0]!.toss_date = TODAY;
    const { rpcCalls } = await setup(page, { state });
    await page.goto("/toss");
    await page.getByRole("button", { name: "Slide to toss" }).press("Enter");
    await page.getByRole("button", { name: "Cancel draw" }).click();
    await page.waitForTimeout(3500);
    expect(rpcCalls("draw_toss")).toHaveLength(0);
    await expect(page.getByRole("button", { name: "Slide to toss" })).toBeVisible();
  });

  test("payout: send to the winner, slide to confirm", async ({ page }) => {
    const state = makeState();
    state.payoutRound = { id: "pr1", round: 1, toss_date: TODAY, draw_method: "app", eligible_member_ids: ["m1", "m3", "m4"], excluded: [],
      random_value: 7, winner_member_id: "m3", drawn_at: new Date().toISOString(), status: "drawn", payout_records: null };
    const { rpcCalls } = await setup(page, { state });
    await page.goto("/c/c1/payout/1");
    await expect(page.getByText("Send to Sumera Khan")).toBeVisible();
    await expect(page.getByText("0300 123 4563")).toBeVisible();
    await page.getByRole("button", { name: "Slide to confirm" }).press("Enter");
    await expect.poll(() => rpcCalls("record_payout").length).toBe(1);
    expect(rpcCalls("record_payout")[0]!.body).toMatchObject({ p_payout_round_id: "pr1", p_amount_paisa: 3000000, p_evidence_path: null });
  });

  test("toss tab before toss day: no slider", async ({ page }) => {
    await setup(page);
    await page.goto("/toss");
    await expect(page.getByText(/Toss on/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Slide to toss" })).toHaveCount(0);
  });

  test("the toss can't be drawn before toss day", async ({ page }) => {
    await setup(page);
    await page.goto("/c/c1/round/1");
    await expect(page.getByText(/The toss opens on/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Draw in the app/ })).toHaveCount(0);
  });
});

test.describe("profile and settings", () => {
  test("first sign-in asks for the JazzCash number on a keypad, then the name", async ({ page }) => {
    const state = makeState();
    state.profile.phone = null;
    const { calls } = await setup(page, { state });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your JazzCash number" })).toBeVisible();
    for (const k of "03001234567") await page.getByRole("button", { name: k, exact: true }).click();
    await expect(page.getByText("Saved as 0300 1234567")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("textbox", { name: "Your name" }).fill("Shabir Khan");
    await page.getByRole("button", { name: "Done" }).click();
    await expect.poll(() => calls.find(c => c.method === "PATCH" && c.path === "/rest/v1/profiles")?.body).toEqual({ display_name: "Shabir Khan", phone: "03001234567" });
  });

  test("settings: appearance, language, details", async ({ page }) => {
    await setup(page);
    await page.goto("/me");
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("radio", { name: "اردو" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "ترتیبات" })).toBeVisible();
  });
});

test.describe("settings", () => {
  test("make a co-organizer and save details", async ({ page }) => {
    const { rpcCalls } = await setup(page);
    await page.goto("/c/c1/settings");
    await expect(page.getByText("Add a co-organizer so someone can confirm your own payments.")).toBeVisible();
    await page.getByRole("button", { name: "Make co-organizer" }).first().click();
    await expect.poll(() => rpcCalls("set_member_role").length).toBe(1);
    expect(rpcCalls("set_member_role")[0]!.body).toEqual({ p_member_id: "m1", p_role: "organizer" });

    await expect(page.getByLabel("First payment date")).toBeDisabled(); // running: schedule locked
    await page.getByLabel("Can receive per month").fill("300000");
    await page.getByLabel("Daily cutoff").fill("22:30");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect.poll(() => rpcCalls("update_committee").length).toBe(1);
    expect(rpcCalls("update_committee")[0]!.body).toMatchObject({ p_committee_id: "c1", p_monthly_receive_limit_paisa: 30000000 });
    await expect.poll(() => rpcCalls("set_daily_cutoff").length).toBe(1);
    expect(rpcCalls("set_daily_cutoff")[0]!.body).toEqual({ p_committee_id: "c1", p_cutoff: "22:30" });
  });

  test("activity reads as plain sentences", async ({ page }) => {
    await setup(page);
    await page.goto("/c/c1/activity");
    await expect(page.getByText("Ayesha Bibi confirmed Rs 600")).toBeVisible();
    await expect(page.getByText("Shabir Khan created the committee")).toBeVisible();
  });
});

test.describe("urdu", () => {
  test("committee screen in Urdu", async ({ page }) => {
    await setup(page, { lang: "ur" });
    await page.goto("/c/c1");
    await expect(page.getByRole("button", { name: "میں نے ادائیگی کر دی" })).toBeVisible();
    await expect(page.getByText("600 روپے باقی")).toBeVisible();
  });

  test("home in Urdu, right to left", async ({ page }) => {
    await setup(page, { lang: "ur", state: asMember(makeState()) });
    await page.goto("/");
    await expect(page.getByText("اس راؤنڈ کی کمیٹی")).toBeVisible();
    await expect(page.getByRole("link", { name: /ابھی 600 روپے ادا کریں/ })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});

