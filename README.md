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
| A relative can pay on a member's behalf | organizer submits for the member with `paid_by_name` |
| On toss day, anyone with unverified dues is **left out of that toss only** | `toss_eligibility()` |
| A member wins once, keeps paying afterwards | `one_win_per_member` index |
| Toss: in-app crypto draw (inputs stored, re-checkable) or record a physical toss | `draw_toss(…, 'app' \| 'manual')` |
| Payout only when the round's full pot is verified | `record_payout()` |
| Recipient confirms receipt (second confirmation) | `confirm_payout()` |
| Organizers verify; nobody verifies their own payment | `verify_submission()` |
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
- `public/_headers` sets a strict Content-Security-Policy (only this site, Supabase and Google Fonts). When adding a new outside service (e.g. OCR), add it there first.
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

## Environment variables

| Name | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` key (safe in the browser; RLS protects data). Never a `sb_secret_…` key |
| `TEST_DATABASE_URL` | *Tests only.* Superuser URL of a throwaway Postgres 16 server |

## Tests

```bash
npm test                                     # domain logic (no DB needed)
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres npm test   # + full DB lifecycle
```

The DB suite creates a temporary database, runs the real migration against a small Supabase `auth` stand-in (`tests/db/supabase-stub.sql`), plays a full first round with five users (joins, catch-up transfers, rejection, family payment, toss with a member in arrears, payout, recipient confirmation), checks RLS, and drops the database afterwards. It also checks that Postgres generates exactly the same 150-day schedule as the TypeScript code.

## Status

- [x] Milestone 1: schema, RLS, transactional RPCs, domain logic, 31 tests
- [x] Nightly encrypted backup with automatic restore check (tested locally; runs in CI once secrets are set)
- [ ] Milestone 2: Supabase project + auth wiring (client ready; waiting on project keys)
- [ ] Milestone 3: screens (dashboard, submit receipt, verification queue, ledger, toss, payouts)
- [ ] Milestone 4: PWA share target for JazzCash receipt images, in-browser OCR (Tesseract)
- [ ] Milestone 5: reconciliation report, backups, pilot

## Known limitations / open questions

- **Short pot after a toss.** A member left out of the toss still owes the round. The payout stays blocked until their share is verified (or someone pays for them). Confirm this is what the committee wants.
- **Member who already won and then stops paying**: no rule implemented yet.
- **Receipt images aren't backed up yet**; only the database is. Their SHA-256 hashes are, so tampering is detectable. A weekly copy to Cloudflare R2 is planned.
- **Storage policies** (`…_storage.sql`) use Supabase's `storage` schema and aren't covered by the local DB tests.
- **Share target** works only when the PWA is installed through Chrome on Android. iPhone users upload a screenshot instead.
- The sample receipt was a **1Bill payment**. A real committee transfer receipt still needs testing against the parser.
- Account limits (Rs 3 lakh/month in and out, as configured by the organizer) only produce warnings. The app can't see the real account.
