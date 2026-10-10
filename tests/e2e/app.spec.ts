import { expect, makeState, renderReceipt, setup, test, TODAY } from "./fixtures";

test.describe("sign-in", () => {
  test("shows Google sign-in, in English and Urdu (right-to-left)", async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await page.getByRole("button", { name: "اردو" }).click();
    await expect(page.getByRole("button", { name: "گوگل کے ساتھ جاری رکھیں" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});

test.describe("home", () => {
  test("leads with today's total and lists committees", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await expect(page.getByText("Due today")).toBeVisible();
    await expect(page.getByText("Plus Rs 400 from earlier days")).toBeVisible();
    await expect(page.getByText("Family committee")).toBeVisible();
    await expect(page.getByText("3 of 8 joined")).toBeVisible();
    await expect(page.getByRole("link", { name: "Notifications (2)" })).toBeVisible();
  });

  test("notifications read as sentences and get marked read", async ({ page }) => {
    const { calls } = await setup(page);
    await page.goto("/inbox");
    await expect(page.getByText("Sumera Khan sent Rs 200 to check")).toBeVisible();
    await expect(page.getByText("Payment rejected: Not in the account history")).toBeVisible();
    await expect.poll(() => calls.some(c => c.method === "PATCH" && c.path === "/rest/v1/notifications")).toBe(true);
    await page.getByText("Sumera Khan sent Rs 200 to check").click();
    await expect(page).toHaveURL(/\/c\/c1\/review$/);
  });
});

test.describe("committee", () => {
  test("new committee: live payout maths and the exact request", async ({ page }) => {
    const { rpcCalls } = await setup(page);
    await page.goto("/new");
    await page.getByPlaceholder("Family committee").fill("Cousins");
    await expect(page.getByLabel("Each payout").getByText("30,000")).toBeVisible(); // 5 × Rs 200 × 30
    await page.getByRole("radio", { name: "Weekly" }).click();
    await expect(page.getByLabel("Each payout").getByText("4,000")).toBeVisible(); // 5 × Rs 200 × 4
    await page.getByRole("button", { name: "Create committee" }).click();
    await expect(page).toHaveURL(/\/c\/c-new$/);
    expect(rpcCalls("create_committee")[0]!.body).toMatchObject({
      p_name: "Cousins", p_member_count: 5, p_contribution_paisa: 20000, p_frequency: "weekly",
      p_periods_per_round: 4, p_payout_paisa: 400000, p_account_number: "03001234567"
    });
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
  test("pay: missed days preselected, OCR reads the receipt, exact submission", async ({ page }) => {
    const receipt = await renderReceipt(page, "731900426615", "600.00");
    const { rpcCalls, calls } = await setup(page);
    await page.goto("/c/c1/pay");
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(3); // two missed + today
    await page.locator('input[type="file"]').setInputFiles({ name: "r.png", mimeType: "image/png", buffer: receipt });
    await expect(page.locator('input[inputmode="numeric"][dir="ltr"]')).toHaveValue("731900426615", { timeout: 45_000 });
    await expect(page.getByText("Receipt amount matches")).toBeVisible();
    await page.getByRole("button", { name: "Send for checking" }).click();
    await expect(page.getByText("Sent for checking")).toBeVisible();
    expect(rpcCalls("submit_payment")[0]!.body).toMatchObject({
      p_member_id: "m0", p_obligation_ids: ["o0", "o1", "o2"], p_amount_paisa: 60000, p_tid: "731900426615"
    });
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

  test("review: reject needs a reason; confirm sends the amount", async ({ page }) => {
    const { rpcCalls } = await setup(page);
    await page.goto("/c/c1/review");
    await page.getByRole("button", { name: "Reject" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Reject" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Amount is different" }).click();
    await dialog.getByRole("button", { name: "Reject" }).click();
    await expect.poll(() => rpcCalls("reject_submission").length).toBe(1);
    expect(rpcCalls("reject_submission")[0]!.body).toEqual({ p_submission_id: "s1", p_reason: "Amount is different" });
    await page.getByRole("button", { name: "Confirm received" }).click();
    await expect.poll(() => rpcCalls("verify_submission").length).toBe(1);
    expect(rpcCalls("verify_submission")[0]!.body).toEqual({ p_submission_id: "s1", p_confirmed_amount_paisa: 20000 });
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
    await expect(page.locator('input[inputmode="numeric"][dir="ltr"]')).toHaveValue("880011223344", { timeout: 45_000 });
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

  test("the toss can't be drawn before toss day", async ({ page }) => {
    await setup(page);
    await page.goto("/c/c1/round/1");
    await expect(page.getByText(/The toss opens on/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Draw in the app/ })).toHaveCount(0);
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
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect.poll(() => rpcCalls("update_committee").length).toBe(1);
    expect(rpcCalls("update_committee")[0]!.body).toMatchObject({ p_committee_id: "c1", p_monthly_receive_limit_paisa: 30000000 });
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
});

