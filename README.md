# Bari · باری

*Har ek ki bari aati hai.*

Digital bachat committee manager for small private groups in Pakistan.
**We manage the committee; JazzCash moves the money.** The app never holds funds, never asks for a JazzCash PIN, OTP or login, and never treats a receipt as money received.

## Stack

- **SolidJS 2.0 RC** (`2.0.0-rc.14`, pinned exactly; RCs can still change) + Tailwind CSS 4
- **PWA only**: installable from Chrome, updates silently on next open. No APK to install.
- **Supabase**: Postgres, Auth, private Storage bucket for receipts
- Cloudflare Pages for hosting · Zod · Vitest

## Committee rules as implemented

| Rule | Where it's enforced |
|---|---|
| Payout = members × periods × contribution | `committees.payout_is_consistent` check + Zod |
| Due → Submitted → Verified; "Overdue" derived from date, never stored | `src/domain/ledger.ts`, RPCs |
| A missed day can be paid any time up to toss day (e.g. on the weekend) | one transfer can cover several days via `payment_allocations` |
| A relative can pay on a member's behalf | member ticks "someone else paid", or an organizer records it for them |
| On toss day, anyone with unverified dues is **left out of that toss only** | `toss_eligibility()` |
| A member wins once, keeps paying afterwards | `one_win_per_member` index |
| Toss: in-app crypto draw (inputs stored, re-checkable) or record a physical toss | `draw_toss(…, 'app' \| 'manual')` |
| Late or missing money is settled within the family; the app reminds (WhatsApp) and never blocks a payout, but a short pot is recorded in the audit log | `record_payout()` |
| Optional late fine: a day is late when nothing was sent by the daily deadline; the fine is owed, reminded, and marked paid or waived by an organizer, never blocks anything | `_late()`, `settle_fine()` |
| Recipient confirms receipt (second confirmation) | `confirm_payout()` |
| Organizers verify; nobody verifies their own payment (so appoint a co-organizer) | `verify_submission()` |
| Same TID or same receipt image can't back two claims | partial unique index / `sha256` unique |
| Every sensitive change is audited; audit log is read-only | `audit_events` |

Money is integer **paisa** everywhere. Schedule dates are **Pakistan calendar dates** (`Asia/Karachi`).

## Setup

```bash
npm install
cp .env.example .env        # fill in your Supabase project URL + anon key
npm run dev
```

Database: apply `supabase/migrations/*` with the Supabase CLI (`supabase db push`) or paste them into the SQL editor in order.

## Supabase setup (free plan)

1. Create a project at supabase.com. Pick the **Singapore or Mumbai** region (closest to Pakistan).
2. Migrations apply automatically: `.github/workflows/migrate.yml` runs `supabase db push` whenever `supabase/migrations/` changes on `main` (or run it by hand from the Actions tab). It uses the `SUPABASE_DB_URL` secret below.
3. Put the **Project URL** and **publishable key** in `.env`. Never put a secret key in the app.
4. The free plan pauses a project after a week with no activity, so daily payments keep it awake. It has **no automatic backups**, which is why the nightly backup below exists.

## Hosting: https://bari.rabtx.dev

Cloudflare **Workers with static assets** (`wrangler.jsonc`); static requests are free.

- Cloudflare dashboard → **Workers & Pages → Create → Import a repository** → `shabirkhan-dev/bari`. Build command `npm run build`, deploy command `npx wrangler deploy`. Every push to `main` then deploys.
- `wrangler.jsonc` claims `bari.rabtx.dev` as a custom domain, and Cloudflare creates the DNS record itself. **Don't add a DNS record for it by hand**, or the deploy fails with a conflict.
- `.env.production` is committed on purpose: the URL and publishable key are public (they're in the browser bundle); RLS protects the data.
- `public/_headers` sets a strict Content-Security-Policy (only this site and Supabase). Fonts and the OCR engine are self-hosted, so nothing else is loaded. When adding a new outside service, add it there first.
- Unknown paths fall back to the app (`not_found_handling: single-page-application`), so invite links like `/join/ABCD2345` work.

## Nightly backup

`.github/workflows/backup.yml` runs at 02:17 PKT. It dumps the database, **encrypts** the dump (AES-256), restores it into a throwaway Postgres to prove it works, and keeps it as a 90-day GitHub artifact.

Repo secrets to add (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `SUPABASE_DB_URL` | Supabase → Connect → **Session pooler** connection string, with your database password filled in (IPv4; GitHub runners can't use the IPv6 direct one). If the password has symbols like `@ # / ?`, percent-encode them, or reset it to letters and digits only |
| `BACKUP_PASSPHRASE` | A long random passphrase. **Store it somewhere safe; without it the backups can't be opened.** |

Restore manually: `RESTORE_ADMIN_URL=… BACKUP_PASSPHRASE=… scripts/restore-check.sh file.gpg` (restores into a temporary database and checks row counts).

Receipt images live in Supabase Storage and are **not** in this backup yet (see limitations).

## Push notifications (daily reminder, payment checked, toss, fines)

The Worker in `worker/index.ts` serves the app and, every 5 minutes (Cron Trigger in `wrangler.jsonc`), asks Supabase (`push_jobs()`) for due reminders, "late fine added" notices and new in-app notifications, then sends them as Web Push. Until its three secrets are set it does nothing, and the reminder switch says reminders aren't on yet.

1. On your computer: `node scripts/vapid-keys.mjs` prints `VAPID_PUBLIC_KEY=…` and `VAPID_PRIVATE_KEY=…`.
2. Cloudflare → Workers & Pages → **bari** → Settings → Variables and Secrets → add three **Secrets** (type "Secret", not "Text"):
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `SUPABASE_SECRET_KEY` (Supabase → Project Settings → API Keys → a **secret** key `sb_secret_…`).
3. Redeploy (or push any commit). Never paste these into chat, the repo or `.env.production`.

## Environment variables

| Name | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` key (safe in the browser; RLS protects data). Never a `sb_secret_…` key |
| `TEST_DATABASE_URL` | *Tests only.* Superuser URL of a throwaway Postgres 16 server |

## Tests

```bash
npm test                         # unit tests (money, dates, schedules, receipt parser, errors)
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres npm test   # + database suite
npm run test:e2e                 # end-to-end: production build in mobile Chrome, Supabase mocked
SHOTS=1 npx playwright test shots   # screenshots of the Figma screens, light/dark × English/Urdu, into test-results/shots
```

- **Database suite** (`tests/db`): runs every migration on a throwaway Postgres with a Supabase `auth` stand-in and plays a whole round with real users: joining, catch-up transfers, rejection, a relative paying, the toss with a member in arrears, a short payout, recipient confirmation, settings and leaving, plus RLS (outsiders see nothing; nobody writes tables directly). It also checks Postgres builds exactly the same schedule as the TypeScript.
- **End-to-end suite** (`tests/e2e`): welcome (English/Urdu, RTL), home (pot, what's owed, switcher, hidden amounts), ledger (filter), slide to submit / approve / toss (keyboard and drag), receipt checks, notifications, creating a committee (exact request), paying with **on-device OCR of a rendered receipt**, recording for a member, review, **JazzCash share target through the service worker**, toss draw with verification, payout, settings, activity.
- CI (`.github/workflows/test.yml`) runs typecheck, unit, database and end-to-end tests on every push and pull request.

## Screens and states (for design)

Built from the Figma file (glass design, `src/ui/glass.tsx`, `src/screens/g/`). Every screen is in light/dark × English/Urdu.

| Route | Screen | Notes |
|---|---|---|
| `/` signed out | Welcome | Google sign-in; "Join with an invite code" asks for the code, then signs in |
| `/` | Home | running committee picked in the switcher (remembered per phone); falls back to the committee list when none is running |
| `/ledger` | Ledger | paid / still to pay per round (no fines: late money is settled in the family), searchable history |
| `/toss` | Toss | who's in the draw; organizer slides to toss on toss day; payout details stay on `/c/:id/round/:n` |
| `/c/:id/pay` | Pay today | oldest unpaid days first (1 / 3 / 7 adapts to what's owed); receipt read on the phone |
| `/c/:id/review/:sid` | Receipt check | checks: amount read off the receipt, receipt says successful, TID present (unique by rule) |
| first sign-in | Your JazzCash number | Figma "Verify phone" look on a keypad, without SMS (sign-in stays Google); then your name |
| `/join/:code` | Join | preview (organizer, amounts, rules incl. fine, who joined), slide to join |
| after paying | Payment submitted | sent → receipt uploaded → organizer check, streak |
| `/members` | Members | who paid today, each member's days this round; tap for WhatsApp reminder, call, record a payment, settle fines (organizer) |
| `/toss` (drawn) | Toss result | winner, payout status, draw record anyone can re-check, share |
| `/toss` (organizer, toss day) | Live toss | 3-second countdown everyone watching sees (Supabase Realtime), cancel before the pick; the server draws |
| `/inbox` | Updates | grouped by day, unread dots, mark all as read |
| `/me` | Settings | appearance, language, daily reminder (push), JazzCash number, rules, log out |
| `/new` | New committee | amount, round length, members, optional late fine, daily deadline; frequency, account and start date under "Payments go to …" |
| `/c/:id` (forming) | Invite | code, copy/share, members and open spots, slide to start when full |
| `/` (organizer) | Organizer home | collected today, receipts to check (quick approve/reject), not paid yet, this round, your own payment |
| `/receipts`, `/c/:id/review` | Receipts | waiting / approved / rejected |
| `/c/:id/payout/:n` | Payout | winner's number, attach proof (visible to all members), slide to confirm |

Still in the earlier look until their Figma frames exist:

| Route | Screen | States to design |
|---|---|---|
| `/` (nothing running) | Committee list | nothing due ("all paid up"), due + late, empty (no committees), loading |
| `/c/:id` running, via Members → Rounds | Committee (running) | rounds list, banners, limits |
| `/c/:id/pay/:member` | Record for a member (organizer) | day picker, receipt, someone else paid, sent |
| `/c/:id/round/:n` | Round details | in/out lists, in-person toss, payout form, recipient confirm/problem, disputed |
| `/c/:id/settings` | Committee settings | organizer form, daily cutoff, schedule locked, members & roles, invite codes, leave |
| `/c/:id/activity` | Activity | list, empty |
| `/share` | Shared receipt | pick committee, nothing arrived, no running committee |

## Status

- [x] Schema, RLS, transactional money rules, 53 database + unit tests
- [x] Supabase + Google sign-in, live at https://bari.rabtx.dev
- [x] Committees: create, invite, join, start, settings, co-organizers, leave/remove (before start), activity log
- [x] Payments: pick days, receipt with on-device OCR, Android share target, record for a member, organizer review
- [x] Toss (in-app verifiable draw or in-person record), payout, recipient confirmation or dispute
- [x] Notifications, WhatsApp reminders, JazzCash monthly-limit warnings, English/Urdu, light/dark
- [x] Nightly encrypted backup with restore check; CI on every push
- [x] Figma design: Welcome, Home, Pay today, Ledger, Toss, Receipt check (light/dark, English/Urdu)
- [x] Figma design for the member and organizer screens (13 more)
- [x] Optional late fines (per committee, set before it starts; organizer marks paid or waived; never blocks the toss)
- [x] Push notifications: daily reminder and every in-app update (needs the three Worker secrets above)
- [ ] Figma design for: committee settings, round details, activity
- [ ] Receipt images in the backup

## Known limitations

- **Receipt images aren't backed up yet**; only the database is. Their SHA-256 hashes are, so tampering is detectable.
- **Storage policies** (`…_storage.sql`) use Supabase's `storage` schema and aren't covered by the local database tests.
- **Share target** works only when the PWA is installed through Chrome on Android. iPhone users upload a screenshot instead.
- The OCR has been checked on a 1Bill receipt and a rendered transfer receipt; a real JazzCash **money-transfer** share still needs a check on a phone.
- **Phone numbers are visible to fellow members** (needed for WhatsApp reminders).
- Account limits only produce warnings from the organizer's own numbers. The app can't see the real account.
- Reminders are in-app plus one-tap WhatsApp; the app never sends messages by itself.
