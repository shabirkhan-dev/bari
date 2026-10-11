import { freshness } from "../lib/live";
import { createMemo, Errored, For, Loading, Match, refresh, Show, Switch } from "solid-js";
import {
  getDashboard,
  type Dashboard, type DashboardMember, type DashboardRound
} from "../lib/api";
import { describeError } from "../lib/errors";
import { InviteG } from "./g/InviteG";
import { daysBetween, whatsappLink } from "../domain/display";
import { formatPkMobile } from "../domain/phone";
import { dateDay, dateLong, dateShort, money, t } from "../i18n";
import {
  Avatar, Badge, Button, Card, ErrorNote, Money, Pill, Screen, Skeleton, tick, useCopy
} from "../ui/kit";
import { MemberRing, type Seat, type SeatStatus } from "../ui/MemberRing";
import { IconChat, IconCheck, IconChevron, IconClock, IconCopy, IconGear, IconWallet } from "../ui/icons";
import { navigate } from "../lib/router";

export function Committee(props: { id: string }) {
  const dash = createMemo(() => { freshness(); return getDashboard(props.id); });
  return (
    <Errored fallback={err => <Screen backTo="/"><ErrorNote message={describeError(err())} /></Screen>}>
      <Loading fallback={<Screen backTo="/"><Skeleton lines={4} /></Screen>}>
        <Switch>
          <Match when={dash().committee.status === "forming"}>
            <InviteG d={dash()} onChange={() => refresh(dash)} />
          </Match>
          <Match when={dash().committee.status !== "forming"}>
            <Running d={dash()} />
          </Match>
        </Switch>
      </Loading>
    </Errored>
  );
}

const isOrganizer = (d: Dashboard) => d.me.role === "owner" || d.me.role === "organizer";

function seatStatus(m: DashboardMember): SeatStatus {
  if (m.overdue_paisa > 0) return "late";
  if (m.today_state === "verified") return "paid";
  if (m.today_state === "submitted" || m.today_state === "disputed") return "checking";
  if (m.today_state === "due" || m.today_state === "rejected") return "due";
  return "none";
}

/* ───────────── Before the start ───────────── */

/* ───────────── Running ───────────── */

function Running(props: { d: Dashboard }) {
  const round = () => props.d.rounds.find(r => r.round === props.d.current_round) ?? props.d.rounds[0];
  const me = () => props.d.members.find(m => m.member_id === props.d.me.member_id);
  const notStarted = () => props.d.today < props.d.committee.start_date;
  const { copied, copy } = useCopy();
  const seats = (): Seat[] => props.d.members.map(m => ({ name: m.name, status: notStarted() ? "none" : seatStatus(m), gold: m.paid_out, self: m.member_id === props.d.me.member_id }));
  const tossIn = () => (round() ? daysBetween(props.d.today, round()!.toss_date) : 0);

  return (
    <Screen backTo="/" title={props.d.committee.name} action={<button type="button" aria-label={t("c.settings")} onClick={() => { tick(); navigate(`/c/${props.d.committee.id}/settings`); }}
      class="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink active:scale-95"><IconGear /></button>} bottom={props.d.committee.status !== "active" ? undefined :
      <div class="flex gap-3">
        <button type="button" aria-label={t("pay.copyNumber")} onClick={() => { tick(); void copy(props.d.committee.account_number); }}
          class="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink active:scale-95">
          {copied() ? <IconCheck size={20} /> : <IconCopy />}
        </button>
        <Button class="flex-1" onClick={() => navigate(`/c/${props.d.committee.id}/pay`)}>{t("pay.paidButton")}</Button>
      </div>
    }>
      <Show when={props.d.pending_reviews > 0}>
        <a href={`/c/${props.d.committee.id}/review`} onClick={e => { e.preventDefault(); tick(); navigate(`/c/${props.d.committee.id}/review`); }}
          class="flex items-center gap-3 rounded-[24px] bg-warn-soft p-4 text-warn active:scale-[0.99]">
          <span class="grid h-11 w-11 place-items-center rounded-full bg-surface"><IconClock size={20} /></span>
          <span class="flex-1 text-[17px] font-semibold">{t("review.banner", { n: props.d.pending_reviews })}</span>
          <span class="rtl:-scale-x-100"><IconChevron /></span>
        </a>
      </Show>
      <Banners d={props.d} />
      <Show when={round()}>{r => (
        <section class="flex flex-col items-center gap-3 pt-1 text-center">
          <Pill class="bg-surface">{t("c.round", { n: r().round, total: props.d.rounds.length })}</Pill>
          <MemberRing total={props.d.committee.member_count} seats={seats()} size={300}
            progress={r().verified_paisa / props.d.committee.payout_paisa}
            label={t("c.ringLabel", { total: props.d.committee.member_count, joined: props.d.members.length })}>
            <Money paisa={props.d.committee.payout_paisa} size="lg" />
            <span class="mt-2 text-[15px] font-semibold text-ink-2">
              {notStarted() ? t("status.starts", { date: dateShort(props.d.committee.start_date) })
                : tossIn() === 0 ? t("status.tossToday") : t("status.tossIn", { n: tossIn() })}
            </span>
            <span class="text-sm text-ink-3">{t("c.tossOn", { date: dateDay(r().toss_date) })}</span>
          </MemberRing>
        </section>
      )}</Show>

      <div class="grid grid-cols-2 gap-3">
        <Show when={me()}>{m => <MyTile d={props.d} m={m()} notStarted={notStarted()} />}</Show>
        <div class="flex flex-col justify-between gap-3 rounded-[24px] bg-surface p-4">
          <span class="text-sm font-medium text-ink-2">{t("c.confirmed")}</span>
          <Money paisa={round()?.verified_paisa ?? 0} size="md" />
        </div>
      </div>

      <Card class="flex flex-col gap-1">
        <span class="text-sm font-medium text-ink-2">{t("c.payTo")}</span>
        <span class="num text-[28px] font-bold" dir="ltr">{formatPkMobile(props.d.committee.account_number)}</span>
        <span class="text-[15px] text-ink-2">{props.d.committee.account_title}</span>
        <Show when={props.d.committee.instructions}><p class="mt-2 text-sm text-ink-3">{props.d.committee.instructions}</p></Show>
      </Card>

      <Card class="p-2">
        <h2 class="px-3 pb-1 pt-3 text-lg font-semibold">{t("c.membersToday")}</h2>
        <ul><For each={props.d.members}>{m => <li><MemberRow d={props.d} m={m} /></li>}</For></ul>
      </Card>

      <Card class="p-2">
        <h2 class="px-3 pb-1 pt-3 text-lg font-semibold">{t("c.rounds")}</h2>
        <ol><For each={props.d.rounds}>{r => <li><RoundRow d={props.d} r={r} /></li>}</For></ol>
      </Card>
    </Screen>
  );
}

function MyTile(props: { d: Dashboard; m: DashboardMember; notStarted: boolean }) {
  return (
    <div class={["flex flex-col justify-between gap-3 rounded-[24px] p-4", props.m.overdue_paisa > 0 ? "bg-late-soft" : "bg-surface"]}>
      <span class="text-sm font-medium text-ink-2">{t("c.yourToday")}</span>
      <span class="text-[16px] font-semibold leading-snug">
        <Switch fallback={t("c.nothing")}>
          <Match when={props.notStarted}>{t("c.notStarted", { date: dateShort(props.d.committee.start_date) })}</Match>
          <Match when={props.m.overdue_paisa > 0}><span class="text-late">{t("c.pendingEarlier", { amount: money(props.m.overdue_paisa) })}</span></Match>
          <Match when={props.m.today_state === "due" || props.m.today_state === "rejected"}>{t("c.dueToday", { amount: money(props.d.committee.contribution_paisa) })}</Match>
          <Match when={props.m.today_state === "submitted"}>{t("c.checkingToday")}</Match>
          <Match when={props.m.today_state === "verified"}><span class="text-ok">{t("c.paidToday")}</span></Match>
        </Switch>
      </span>
    </div>
  );
}

function MemberRow(props: { d: Dashboard; m: DashboardMember }) {
  const self = () => props.m.member_id === props.d.me.member_id;
  const status = () => seatStatus(props.m);
  const reminder = () => props.m.overdue_paisa > 0
    ? t("c.reminderLate", { name: props.m.name, committee: props.d.committee.name, amount: money(props.m.overdue_paisa), n: props.m.overdue_count, phone: formatPkMobile(props.d.committee.account_number), title: props.d.committee.account_title })
    : t("c.reminderToday", { name: props.m.name, committee: props.d.committee.name, amount: money(props.d.committee.contribution_paisa), phone: formatPkMobile(props.d.committee.account_number), title: props.d.committee.account_title });
  const canRemind = () => isOrganizer(props.d) && !self() && !!props.m.phone && (status() === "late" || status() === "due");
  const ring = () => ({ paid: "var(--ok)", checking: "var(--warn)", late: "var(--late)", due: undefined, none: undefined })[status()];

  const canRecord = () => isOrganizer(props.d) && !self() && props.d.committee.status === "active";
  const recordHref = () => `/c/${props.d.committee.id}/pay/${props.m.member_id}`;
  return (
    <div class="flex items-center gap-3 rounded-[20px] p-3">
      <Avatar name={props.m.name} ring={props.m.paid_out ? "var(--turn)" : ring()} />
      <div class="min-w-0 flex-1">
        <p class="truncate text-[17px] font-medium">{props.m.name}<Show when={self()}><span class="text-ink-3"> ({t("common.you")})</span></Show></p>
        <div class="mt-1 flex flex-wrap gap-1.5">
          <Switch>
            <Match when={status() === "late"}><Badge tone="late">{t("status.late", { amount: money(props.m.overdue_paisa) })}</Badge></Match>
            <Match when={status() === "paid"}><Badge tone="paid">{t("status.paid")}</Badge></Match>
            <Match when={status() === "checking"}><Badge tone="checking">{t("status.checking")}</Badge></Match>
            <Match when={status() === "due"}><Badge tone="due">{t("status.due")}</Badge></Match>
          </Switch>
          <Show when={props.m.paid_out}><Badge tone="turn">{t("status.gotPayout")}</Badge></Show>
        </div>
      </div>
      <Show when={canRemind()}>
        <a href={whatsappLink(props.m.phone!, reminder())} target="_blank" rel="noopener"
          aria-label={t("c.remindAria", { name: props.m.name })} onClick={() => tick()}
          class="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-[15px] font-semibold active:scale-95">
          <IconChat />{t("c.remind")}
        </a>
      </Show>
      <Show when={canRecord()}>
        <a href={recordHref()} aria-label={`${t("payOn.action")}: ${props.m.name}`}
          onClick={e => { e.preventDefault(); tick(); navigate(recordHref()); }}
          class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 active:scale-95"><IconWallet /></a>
      </Show>
    </div>
  );
}

/** Things that need attention: toss due, a payout to confirm, JazzCash limits. */
function Banners(props: { d: Dashboard }) {
  const tossDue = () => props.d.rounds.find(r => r.status === null && r.toss_date <= props.d.today);
  const toConfirm = () => props.d.rounds.find(r => r.status === "paid" && r.winner_member_id === props.d.me.member_id);
  const m = () => props.d.month;
  const near = (used: number, limit: number | null) => limit !== null && limit > 0 && used >= limit * 0.8;
  const banner = (tone: string, text: string, to?: string) => (
    <a href={to ?? "#"} onClick={e => { e.preventDefault(); if (to) { tick(); navigate(to); } }}
      class={["flex items-center gap-3 rounded-[24px] p-4 active:scale-[0.99]", tone]}>
      <span class="flex-1 text-[16px] font-semibold leading-snug">{text}</span>
      <Show when={to}><span class="rtl:-scale-x-100"><IconChevron /></span></Show>
    </a>
  );
  return (
    <>
      <Show when={isOrganizer(props.d) && tossDue()}>
        {r => banner("bg-turn/20 text-ink", t("round.tossBanner", { n: r().round }), `/c/${props.d.committee.id}/round/${r().round}`)}
      </Show>
      <Show when={toConfirm()}>
        {r => banner("bg-ok-soft text-ok", t("round.didReceive", { amount: money(props.d.committee.payout_paisa) }), `/c/${props.d.committee.id}/round/${r().round}`)}
      </Show>
      <Show when={isOrganizer(props.d) && near(m().expected_paisa, m().receive_limit_paisa)}>
        {banner("bg-warn-soft text-warn", t("limit.receive", { amount: money(m().expected_paisa), limit: money(m().receive_limit_paisa ?? 0) }), `/c/${props.d.committee.id}/settings`)}
      </Show>
      <Show when={isOrganizer(props.d) && near(Math.max(m().sent_paisa, m().payouts_due_paisa), m().send_limit_paisa)}>
        {banner("bg-warn-soft text-warn", t("limit.send", { amount: money(Math.max(m().sent_paisa, m().payouts_due_paisa)), limit: money(m().send_limit_paisa ?? 0) }), `/c/${props.d.committee.id}/settings`)}
      </Show>
    </>
  );
}

function RoundRow(props: { d: Dashboard; r: DashboardRound }) {
  const winner = () => props.d.members.find(m => m.member_id === props.r.winner_member_id)?.name;
  const current = () => props.r.round === props.d.current_round;
  const href = () => `/c/${props.d.committee.id}/round/${props.r.round}`;
  return (
    <a href={href()} onClick={e => { e.preventDefault(); tick(); navigate(href()); }}
      class={["flex items-center gap-3 rounded-[20px] p-3 active:bg-surface-2", { "bg-surface-2": current() }]}>
      <span class={["num grid h-11 w-11 shrink-0 place-items-center rounded-full text-[17px] font-bold",
        props.r.winner_member_id ? "bg-turn text-[#0d1a16]" : current() ? "bg-cta text-cta-ink" : "bg-surface-2 text-ink-2"]}>{props.r.round}</span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-[17px] font-medium">{winner() ?? (current() ? t("c.currentRound") : t("c.upcoming"))}</p>
        <p class="text-sm text-ink-2">{t("c.tossOn", { date: dateLong(props.r.toss_date) })}</p>
      </div>
      <Switch>
        <Match when={props.r.status === "confirmed"}><Badge tone="paid">{t("c.received")}</Badge></Match>
        <Match when={props.r.status === "paid"}><Badge tone="checking">{t("c.sent")}</Badge></Match>
        <Match when={props.r.status === "drawn"}><Badge tone="turn">{t("c.drawn")}</Badge></Match>
        <Match when={props.r.status === "disputed"}><Badge tone="late">{t("c.disputed")}</Badge></Match>
      </Switch>
      <span class="text-ink-3 rtl:-scale-x-100"><IconChevron /></span>
    </a>
  );
}

