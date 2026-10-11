import { afterEach, describe, expect, it, vi } from "vitest";
import { runPushJobs } from "../worker/index";
import { noticeLines, noticeTarget } from "../src/domain/notice";

const b64url = (b: ArrayBuffer) => Buffer.from(b).toString("base64url");

async function keys() {
  const vapid = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const client = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return {
    VAPID_PUBLIC_KEY: b64url(await crypto.subtle.exportKey("raw", vapid.publicKey)),
    VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey("jwk", vapid.privateKey)).d!,
    p256dh: b64url(await crypto.subtle.exportKey("raw", client.publicKey)),
    auth: b64url(crypto.getRandomValues(new Uint8Array(16)).buffer)
  };
}

describe("push worker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("makes a key pair once and stores it when none exists", async () => {
    const saved: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/rpc/push_vapid")) return new Response("null");
      if (url.endsWith("/rpc/save_push_vapid")) { const b = JSON.parse(init.body as string); saved.push(b); return new Response(JSON.stringify({ public_key: b.p_public, private_key: b.p_private })); }
      if (url.endsWith("/rpc/push_jobs")) return new Response(JSON.stringify({ notifications: [], subscriptions: [] }));
      return new Response(null, { status: 204 });
    }));
    expect(await runPushJobs({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_test", ASSETS: { fetch: vi.fn() } })).toEqual({ sent: 0, gone: 0 });
    expect(saved).toHaveLength(1);
    const k = saved[0] as { p_public: string; p_private: string };
    expect(Buffer.from(k.p_public, "base64url")).toHaveLength(65); // uncompressed P-256 point
    expect(Buffer.from(k.p_private, "base64url")).toHaveLength(32);
  });

  it("does nothing until the secret is set", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await runPushJobs({ SUPABASE_URL: "https://x.supabase.co", ASSETS: { fetch: f } })).toEqual({ sent: 0, gone: 0 });
    expect(f).not.toHaveBeenCalled();
  });

  it("sends each notification, encrypted, to the user's phones and forgets dead subscriptions", async () => {
    const k = await keys();
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/rpc/push_jobs")) return new Response(JSON.stringify({
        notifications: [{ id: "n1", user_id: "u1", kind: "payment.due", committee_id: "c1", committee: "Gulshan Bachat", lang: "en",
          payload: { amount_paisa: 20000, cutoff: "21:00" } }],
        subscriptions: [
          { user_id: "u1", endpoint: "https://push.example/live", p256dh: k.p256dh, auth: k.auth },
          { user_id: "u1", endpoint: "https://push.example/dead", p256dh: k.p256dh, auth: k.auth },
          { user_id: "u2", endpoint: "https://push.example/other", p256dh: k.p256dh, auth: k.auth }
        ]
      }));
      if (url.endsWith("/rpc/push_gone")) return new Response(null, { status: 204 });
      return new Response("", { status: url.endsWith("/dead") ? 410 : 201 });
    }));
    const r = await runPushJobs({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_test", ASSETS: { fetch: vi.fn() }, ...k });
    expect(r).toEqual({ sent: 1, gone: 1 });
    const live = calls.find(c => c.url === "https://push.example/live")!;
    const h = live.init.headers as Record<string, string>;
    expect(Object.entries(h).map(([n, v]) => [n.toLowerCase(), v])).toEqual(expect.arrayContaining([
      ["content-encoding", "aes128gcm"], expect.arrayContaining(["authorization", expect.stringMatching(/^vapid t=.+, k=/)])
    ]));
    expect(calls.some(c => c.url === "https://push.example/other")).toBe(false); // other users' phones untouched
    expect(JSON.parse(calls.find(c => c.url.endsWith("/rpc/push_gone"))!.init.body as string)).toEqual({ p_endpoints: ["https://push.example/dead"] });
    expect((calls[0]!.init.headers as Record<string, string>).apikey).toBe("sb_secret_test");
  });
});

describe("notification text", () => {
  it("reads like the design, in both languages", () => {
    expect(noticeLines("payment.verified", { by_name: "Ayesha Khan", periods: [{ n: 17 }], streak: 17, amount_paisa: 20000 }, "en"))
      .toMatchObject({ title: "Ayesha verified Day 17", sub: "Your streak is 17 days" });
    expect(noticeLines("payment.due", { amount_paisa: 20000, cutoff: "21:00" }, "en").title).toBe("Rs 200 due by 9 pm");
    expect(noticeLines("payment.due", { amount_paisa: 20000, cutoff: "21:00" }, "ur").title).toBe("رات 9 بجے تک 200 روپے ادا کریں");
    expect(noticeLines("fine.added", { amount_paisa: 5000, n: 16 }, "en")).toMatchObject({ title: "Late fine added", sub: "Rs 50 for Day 16" });
    expect(noticeLines("payment.submitted", { member_name: "Bilal Ahmed", amount_paisa: 20000 }, "en").title).toBe("Bilal sent a receipt");
    expect(noticeLines("weird.kind", {}, "ur").title).toBe("نئی اطلاع");
    expect(noticeTarget("payment.submitted", { submission_id: "s1" }, "c1")).toBe("/c/c1/review/s1");
    expect(noticeTarget("payment.due", {}, "c1")).toBe("/c/c1/pay");
  });
});
