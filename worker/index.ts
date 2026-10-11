/**
 * Cloudflare Worker in front of the static app.
 * - fetch: serves the PWA (static assets) plus /api/push/key (the public VAPID key).
 * - scheduled (every 5 minutes): asks Supabase for due reminders, "fine added" notices and
 *   every new notification, then delivers them as Web Push to each subscribed phone.
 *
 * Secrets (Cloudflare → Workers → bari → Settings → Variables and secrets), never in the repo:
 *   SUPABASE_SECRET_KEY  sb_secret_… key (server only)
 *   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  from `node scripts/vapid-keys.mjs`
 */
import { buildPushPayload, type PushSubscription, type VapidKeys } from "@block65/webcrypto-web-push";
import { noticeLines, noticeTarget } from "../src/domain/notice";

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}
interface Ctx { waitUntil(p: Promise<unknown>): void }

interface Job {
  notifications: { id: string; user_id: string; kind: string; payload: Record<string, unknown>; committee_id: string | null; committee: string | null; lang: "en" | "ur" }[];
  subscriptions: { user_id: string; endpoint: string; p256dh: string; auth: string }[];
}

async function rpc<T>(env: Env, fn: string, body: unknown): Promise<T> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SECRET_KEY!, authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function runPushJobs(env: Env): Promise<{ sent: number; gone: number }> {
  if (!env.SUPABASE_SECRET_KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { sent: 0, gone: 0 };
  const job = await rpc<Job>(env, "push_jobs", {});
  const vapid: VapidKeys = { subject: env.VAPID_SUBJECT ?? "https://bari.rabtx.dev", publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  const gone: string[] = [];
  let sent = 0;
  for (const n of job.notifications) {
    const lines = noticeLines(n.kind, n.payload, n.lang);
    const data = JSON.stringify({
      title: lines.title,
      body: [lines.sub, n.committee].filter(Boolean).join(" · "),
      url: noticeTarget(n.kind, n.payload, n.committee_id),
      tag: n.kind === "payment.due" ? `due-${n.committee_id}` : n.id
    });
    for (const s of job.subscriptions.filter(s => s.user_id === n.user_id)) {
      const sub: PushSubscription = { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        const payload = await buildPushPayload({ data, options: { ttl: 60 * 60 * 12, urgency: "normal" } }, sub, vapid);
        const res = await fetch(s.endpoint, payload);
        if (res.status === 404 || res.status === 410) gone.push(s.endpoint);
        else if (res.ok) sent++;
      } catch { /* one bad subscription shouldn't stop the rest */ }
    }
  }
  if (gone.length) await rpc(env, "push_gone", { p_endpoints: [...new Set(gone)] });
  return { sent, gone: gone.length };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/push/key") {
      return new Response(JSON.stringify({ key: env.VAPID_PUBLIC_KEY ?? null }), {
        headers: { "content-type": "application/json", "cache-control": "no-store" }
      });
    }
    return env.ASSETS.fetch(req);
  },
  async scheduled(_event: unknown, env: Env, ctx: Ctx) {
    ctx.waitUntil(runPushJobs(env).catch(e => console.error("push jobs failed", e)));
  }
};
