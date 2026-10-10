import { createMemo, createSignal, Errored, For, Loading, Match, refresh, Show, Switch } from "solid-js";
import {
  activateCommittee, createInvitation, getDashboard, latestInvitation,
  type Dashboard, type DashboardMember, type DashboardRound
} from "../lib/api";
import { describeError } from "../lib/errors";
import { formatPKR } from "../domain/money";
import { contributionLabel, daysBetween, dayDate, longDate, shortDate, whatsappLink } from "../domain/display";
import { formatPkMobile } from "../domain/phone";
import { Button, Card, Chip, ErrorNote, Screen, SectionTitle, Skeleton, tick } from "../ui/kit";

export function Committee(props: { id: string }) {
  const dash = createMemo(() => getDashboard(props.id));
  return (
    <Errored fallback={err => <Screen title="Committee" backTo="/"><ErrorNote message={describeError(err())} /></Screen>}>
      <Loading fallback={<Screen title="" backTo="/"><Skeleton lines={4} /></Screen>}>
        <Screen title={dash().committee.name} backTo="/">
          <Switch>
            <Match when={dash().committee.status === "forming"}>
              <Forming d={dash()} onChange={() => refresh(dash)} />
            </Match>
            <Match when={dash().committee.status !== "forming"}>
              <Running d={dash()} />
            </Match>
          </Switch>
        </Screen>
      </Loading>
    </Errored>
  );
}

const isOrganizer = (d: Dashboard) => d.me.role === "owner" || d.me.role === "organizer";

/* ───────────── Before the start: gather members ───────────── */

function Forming(props: { d: Dashboard; onChange: () => void }) {
  const joined = () => props.d.members.length;
  const full = () => joined() >= props.d.committee.member_count;
  const [confirming, setConfirming] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      await activateCommittee(props.d.committee.id);
      props.onChange();
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <Card>
        <div class="flex items-baseline justify-between">
          <p class="text-lg font-semibold text-bari-ink">{joined()} of {props.d.committee.member_count} joined</p>
          <p class="text-sm text-bari-muted">Starts {longDate(props.d.committee.start_date)}</p>
        </div>
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-bari-line/60" role="progressbar"
          aria-valuemin="0" aria-valuemax={props.d.committee.member_count} aria-valuenow={joined()}>
          <div class="h-full rounded-full bg-bari-emerald transition-[width]" style={{ width: `${(joined() / props.d.committee.member_count) * 100}%` }} />
        </div>
        <p class="mt-3 text-sm text-bari-muted">
          {contributionLabel(props.d.committee.contribution_paisa, props.d.committee.frequency, props.d.committee.interval_days)} · payout {formatPKR(props.d.committee.payout_paisa)}
        </p>
      </Card>

      <Show when={isOrganizer(props.d) && !full()}>
        <Invite d={props.d} />
      </Show>

      <SectionTitle>Members</SectionTitle>
      <Card class="divide-y divide-bari-line/60 p-0">
        <For each={props.d.members}>{m => (
          <div class="flex items-center gap-3 px-4 py-3">
            <Avatar name={m.name} />
            <p class="flex-1 truncate font-medium text-bari-ink">{m.name}</p>
            <Show when={m.role !== "member"}><Chip tone="neutral">{m.role === "owner" ? "Organizer" : "Co-organizer"}</Chip></Show>
          </div>
        )}</For>
      </Card>

      <Show when={error()}><ErrorNote message={error()} /></Show>

      <Show when={isOrganizer(props.d)} fallback={
        <p class="px-1 text-center text-sm text-bari-muted">The organizer will start the committee once everyone has joined.</p>
      }>
        <Show when={confirming()} fallback={
          <Button disabled={!full()} onClick={() => setConfirming(true)}>
            {full() ? "Start committee" : `Waiting for ${props.d.committee.member_count - joined()} more`}
          </Button>
        }>
          <Card class="flex flex-col gap-3 border-bari-gold">
            <p class="font-semibold text-bari-ink">Start now?</p>
            <p class="text-sm text-bari-muted">
              The schedule locks: first payment {longDate(props.d.committee.start_date)}. Amounts and members can't change after this.
            </p>
            <div class="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setConfirming(false)}>Not yet</Button>
              <Button disabled={busy()} onClick={start}>{busy() ? "Starting…" : "Yes, start"}</Button>
            </div>
          </Card>
        </Show>
      </Show>
    </>
  );
}

function Invite(props: { d: Dashboard }) {
  const invite = createMemo(() => latestInvitation(props.d.committee.id));
  const [made, setMade] = createSignal<string | null>(null);
  const [copied, setCopied] = createSignal(false);
  const [error, setError] = createSignal("");

  const code = () => made() ?? invite()?.code ?? null;
  const link = () => `${location.origin}/join/${code()}`;
  const message = () => `Join our committee "${props.d.committee.name}" on Bari.\nCode: ${code()}\n${link()}`;

  const make = async () => {
    try { setMade(await createInvitation(props.d.committee.id)); } catch (e) { setError(describeError(e)); }
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "Join on Bari", text: message() });
      else { await navigator.clipboard.writeText(message()); setCopied(true); }
    } catch { /* user closed the share sheet */ }
  };

  return (
    <Card class="flex flex-col gap-4">
      <div>
        <p class="font-semibold text-bari-ink">Invite members</p>
        <p class="text-sm text-bari-muted">Send this code or link to the people joining.</p>
      </div>
      <Loading fallback={<div class="skeleton h-16" />}>
        <Show when={code()} fallback={<Button variant="secondary" onClick={make}>Create invite code</Button>}>
          <p class="rounded-2xl bg-bari-mint py-4 text-center font-mono text-3xl font-bold tracking-[0.25em] text-bari-emerald-dark" aria-label={`Invite code ${code()?.split("").join(" ")}`}>{code()}</p>
          <div class="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={share}>{copied() ? "Copied" : "Share"}</Button>
            <a
              class="flex h-14 items-center justify-center rounded-2xl bg-[#1f7a4d] font-semibold text-white active:scale-[0.98]"
              href={`https://wa.me/?text=${encodeURIComponent(message())}`}
              target="_blank" rel="noopener"
              onClick={() => tick()}
            >WhatsApp</a>
          </div>
          <p class="text-center text-xs text-bari-muted">Valid for 7 days.</p>
        </Show>
      </Loading>
      <Show when={error()}><ErrorNote message={error()} /></Show>
    </Card>
  );
}

/* ───────────── Running committee ───────────── */

function Running(props: { d: Dashboard }) {
  const round = () => props.d.rounds.find(r => r.round === props.d.current_round) ?? props.d.rounds[0];
  const me = () => props.d.members.find(m => m.member_id === props.d.me.member_id);
  const notStarted = () => props.d.today < props.d.committee.start_date;

  return (
    <>
      <Show when={round()}>{r => <RoundHero d={props.d} r={r()} notStarted={notStarted()} />}</Show>
      <Show when={me()}>{m => <MyDues d={props.d} m={m()} notStarted={notStarted()} />}</Show>
      <PayTo d={props.d} />

      <SectionTitle>Members today</SectionTitle>
      <Card class="divide-y divide-bari-line/60 p-0">
        <For each={props.d.members}>{m => <MemberRow d={props.d} m={m} />}</For>
      </Card>

      <SectionTitle>Rounds</SectionTitle>
      <Card class="divide-y divide-bari-line/60 p-0">
        <For each={props.d.rounds}>{r => <RoundRow d={props.d} r={r} />}</For>
      </Card>
    </>
  );
}

function RoundHero(props: { d: Dashboard; r: DashboardRound; notStarted: boolean }) {
  const daysLeft = () => daysBetween(props.d.today, props.r.toss_date);
  const pct = () => Math.min(100, (props.r.verified_paisa / props.d.committee.payout_paisa) * 100);
  return (
    <section class="rounded-3xl bg-bari-emerald p-5 text-white">
      <div class="flex items-center justify-between text-sm text-white/85">
        <span>Round {props.r.round} of {props.d.rounds.length}</span>
        <span>{props.notStarted ? `Starts ${shortDate(props.d.committee.start_date)}` : daysLeft() === 0 ? "Toss today" : daysLeft() > 0 ? `Toss in ${daysLeft()} days` : `Toss was ${shortDate(props.r.toss_date)}`}</span>
      </div>
      <p class="mt-3 text-4xl font-bold tabular-nums">{formatPKR(props.d.committee.payout_paisa)}</p>
      <p class="text-sm text-white/85">pot on {dayDate(props.r.toss_date)}</p>
      <div class="mt-4 h-2 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-label="Verified so far"
        aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(pct())}>
        <div class="h-full rounded-full bg-bari-gold" style={{ width: `${pct()}%` }} />
      </div>
      <p class="mt-2 text-sm text-white/85">{formatPKR(props.r.verified_paisa)} confirmed in the account so far</p>
    </section>
  );
}

function MyDues(props: { d: Dashboard; m: DashboardMember; notStarted: boolean }) {
  return (
    <Card class="flex flex-col gap-2">
      <p class="text-sm font-medium text-bari-muted">You</p>
      <Switch>
        <Match when={props.notStarted}>
          <p class="text-lg font-semibold text-bari-ink">First payment on {longDate(props.d.committee.start_date)}</p>
        </Match>
        <Match when={props.m.overdue_paisa > 0}>
          <p class="text-lg font-semibold text-red-800">{formatPKR(props.m.overdue_paisa)} pending from earlier days</p>
          <p class="text-sm text-bari-muted">{props.m.overdue_count} {props.m.overdue_count === 1 ? "payment" : "payments"} missed. You can catch up any time before the toss.</p>
        </Match>
        <Match when={props.m.today_state === "due"}>
          <p class="text-lg font-semibold text-bari-ink">{formatPKR(props.d.committee.contribution_paisa)} due today</p>
        </Match>
        <Match when={props.m.today_state === "submitted"}>
          <p class="text-lg font-semibold text-bari-ink">Today's payment is being checked</p>
        </Match>
        <Match when={props.m.today_state === "verified"}>
          <p class="text-lg font-semibold text-bari-emerald">Paid for today ✓</p>
        </Match>
        <Match when={true}>
          <p class="text-lg font-semibold text-bari-ink">Nothing due today</p>
        </Match>
      </Switch>
      <Show when={props.m.pending_paisa > 0}>
        <p class="text-sm text-bari-muted">{formatPKR(props.m.pending_paisa)} sent and waiting for the organizer to confirm.</p>
      </Show>
    </Card>
  );
}

function PayTo(props: { d: Dashboard }) {
  const [copied, setCopied] = createSignal(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(props.d.committee.account_number); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* clipboard blocked */ }
  };
  return (
    <Card class="flex flex-col gap-3">
      <p class="text-sm font-medium text-bari-muted">Send with JazzCash to</p>
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="font-mono text-2xl font-semibold tracking-wide text-bari-ink">{formatPkMobile(props.d.committee.account_number)}</p>
          <p class="truncate text-bari-muted">{props.d.committee.account_title}</p>
        </div>
        <Button variant="secondary" class="h-11 shrink-0 px-4 text-sm" onClick={copy}>{copied() ? "Copied" : "Copy"}</Button>
      </div>
      <Show when={props.d.committee.instructions}><p class="text-sm text-bari-muted">{props.d.committee.instructions}</p></Show>
    </Card>
  );
}

function MemberRow(props: { d: Dashboard; m: DashboardMember }) {
  const self = () => props.m.member_id === props.d.me.member_id;
  const reminder = () =>
    `Salam ${props.m.name}, Bari reminder for "${props.d.committee.name}": ` +
    (props.m.overdue_paisa > 0
      ? `${formatPKR(props.m.overdue_paisa)} is pending (${props.m.overdue_count} ${props.m.overdue_count === 1 ? "payment" : "payments"}).`
      : `today's ${formatPKR(props.d.committee.contribution_paisa)} is due.`) +
    ` JazzCash: ${formatPkMobile(props.d.committee.account_number)} (${props.d.committee.account_title}). Shukriya!`;
  const canRemind = () =>
    isOrganizer(props.d) && !self() && !!props.m.phone && (props.m.overdue_paisa > 0 || props.m.today_state === "due");

  return (
    <div class="flex items-center gap-3 px-4 py-3">
      <Avatar name={props.m.name} />
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium text-bari-ink">{props.m.name}{self() ? " (you)" : ""}</p>
        <div class="mt-1 flex flex-wrap gap-1.5">
          <TodayChip state={props.m.today_state} />
          <Show when={props.m.overdue_paisa > 0}><Chip tone="late">{formatPKR(props.m.overdue_paisa)} late</Chip></Show>
          <Show when={props.m.paid_out}><Chip tone="neutral">Got payout</Chip></Show>
        </div>
      </div>
      <Show when={canRemind()}>
        <a
          href={whatsappLink(props.m.phone!, reminder())}
          target="_blank" rel="noopener"
          aria-label={`Remind ${props.m.name} on WhatsApp`}
          class="grid h-11 shrink-0 place-items-center rounded-xl bg-bari-mint px-3 text-sm font-semibold text-bari-emerald-dark active:scale-[0.97]"
          onClick={() => tick()}
        >Remind</a>
      </Show>
    </div>
  );
}

function TodayChip(props: { state: DashboardMember["today_state"] }) {
  return (
    <Switch>
      <Match when={props.state === "verified"}><Chip tone="ok">Paid today</Chip></Match>
      <Match when={props.state === "submitted" || props.state === "disputed"}><Chip tone="wait">Checking</Chip></Match>
      <Match when={props.state === "due" || props.state === "rejected"}><Chip tone="due">Due today</Chip></Match>
    </Switch>
  );
}

function RoundRow(props: { d: Dashboard; r: DashboardRound }) {
  const winner = () => props.d.members.find(m => m.member_id === props.r.winner_member_id)?.name;
  const current = () => props.r.round === props.d.current_round;
  return (
    <div class={["flex items-center gap-3 px-4 py-3", { "bg-bari-mint/50": current() }]}>
      <span class={["grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold",
        props.r.winner_member_id ? "bg-bari-gold text-bari-ink" : "bg-bari-line/60 text-bari-muted"]}>{props.r.round}</span>
      <div class="min-w-0 flex-1">
        <p class="font-medium text-bari-ink">{winner() ?? (current() ? "Current round" : "Upcoming")}</p>
        <p class="text-sm text-bari-muted">Toss {longDate(props.r.toss_date)}</p>
      </div>
      <Switch>
        <Match when={props.r.status === "confirmed"}><Chip tone="ok">Received</Chip></Match>
        <Match when={props.r.status === "paid"}><Chip tone="wait">Sent</Chip></Match>
        <Match when={props.r.status === "drawn"}><Chip tone="wait">Drawn</Chip></Match>
        <Match when={props.r.status === "disputed"}><Chip tone="late">Disputed</Chip></Match>
      </Switch>
    </div>
  );
}

function Avatar(props: { name: string }) {
  const initials = () => props.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("");
  return (
    <span aria-hidden="true" class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bari-mint text-sm font-bold text-bari-emerald-dark">{initials()}</span>
  );
}
