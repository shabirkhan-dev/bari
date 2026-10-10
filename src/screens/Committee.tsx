import { createMemo, createSignal, Errored, For, Loading, Match, refresh, Show, Switch } from "solid-js";
import {
  activateCommittee, createInvitation, getDashboard, latestInvitation,
  type Dashboard, type DashboardMember, type DashboardRound
} from "../lib/api";
import { describeError } from "../lib/errors";
import { contributionLabel, daysBetween, whatsappLink } from "../domain/display";
import { formatPkMobile } from "../domain/phone";
import { dateDay, dateLong, dateShort, money, t } from "../i18n";
import {
  Avatar, Badge, Button, Card, ErrorNote, Money, Pill, Screen, Sheet, Skeleton, tick, useCopy
} from "../ui/kit";
import { MemberRing, type Seat, type SeatStatus } from "../ui/MemberRing";
import { IconChat, IconCopy, IconPlus } from "../ui/icons";

export function Committee(props: { id: string }) {
  const dash = createMemo(() => getDashboard(props.id));
  return (
    <Errored fallback={err => <Screen backTo="/"><ErrorNote message={describeError(err())} /></Screen>}>
      <Loading fallback={<Screen backTo="/"><Skeleton lines={4} /></Screen>}>
        <Switch>
          <Match when={dash().committee.status === "forming"}>
            <Forming d={dash()} onChange={() => refresh(dash)} />
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

function Forming(props: { d: Dashboard; onChange: () => void }) {
  const joined = () => props.d.members.length;
  const total = () => props.d.committee.member_count;
  const full = () => joined() >= total();
  const [confirm, setConfirm] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const invite = createMemo(() => (isOrganizer(props.d) ? latestInvitation(props.d.committee.id) : Promise.resolve(null)));
  const [made, setMade] = createSignal<string | null>(null);
  const code = () => made() ?? invite()?.code ?? null;
  const message = () => t("c.inviteMsg", { name: props.d.committee.name, code: code() ?? "", link: `${location.origin}/join/${code()}` });
  const { copied, copy } = useCopy();

  const ensureCode = async () => {
    if (code()) return code()!;
    const c = await createInvitation(props.d.committee.id);
    setMade(c);
    return c;
  };
  const share = async () => {
    try {
      await ensureCode();
      if (navigator.share) await navigator.share({ title: "Bari", text: message() });
      else await copy(message());
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") setError(describeError(e));
    }
  };
  const start = async () => {
    setBusy(true);
    setError("");
    try { await activateCommittee(props.d.committee.id); setConfirm(false); props.onChange(); }
    catch (e) { setError(describeError(e)); setBusy(false); setConfirm(false); }
  };

  const seats = (): Seat[] => props.d.members.map(m => ({ name: m.name, status: "none", self: m.member_id === props.d.me.member_id }));

  return (
    <Screen backTo="/" bottom={
      <Show when={isOrganizer(props.d)} fallback={<p class="pb-2 text-center text-[15px] text-ink-2">{t("c.organizerWillStart")}</p>}>
        <Show when={full()} fallback={<Button class="w-full" onClick={share} trailing={<IconPlus size={14} />}>{t("c.shareInvite")}</Button>}>
          <Button class="w-full" onClick={() => setConfirm(true)}>{t("c.start")}</Button>
        </Show>
      </Show>
    }>
      <section class="flex flex-col items-center gap-5 pb-2 text-center">
        <MemberRing total={total()} seats={seats()} size={264} label={t("c.ringLabel", { total: total(), joined: joined() })}>
          <span class="num text-[44px] font-bold leading-none">{joined()}<span class="text-ink-3">/{total()}</span></span>
        </MemberRing>
        <div>
          <h1 class="text-[30px] font-bold leading-tight">{props.d.committee.name}</h1>
          <p class="mx-auto mt-2 max-w-[20rem] text-[16px] text-ink-2">{full() ? t("c.organizerWillStart") : t("c.waitingSub")}</p>
        </div>
        <div class="flex flex-wrap justify-center gap-2">
          <Pill>{contributionLabel(props.d.committee.contribution_paisa, props.d.committee.frequency, props.d.committee.interval_days)}</Pill>
          <Pill>{t("status.starts", { date: dateShort(props.d.committee.start_date) })}</Pill>
        </div>
      </section>

      <Show when={isOrganizer(props.d) && !full()}>
        <Card class="flex flex-col gap-4">
          <p class="text-[15px] font-medium text-ink-2">{t("c.inviteCode")}</p>
          <Loading fallback={<div class="skeleton h-16" />}>
            <Show when={code()} fallback={<Button variant="soft" onClick={() => ensureCode().catch(e => setError(describeError(e)))}>{t("c.createInvite")}</Button>}>
              <p class="latin text-center text-[34px] font-bold tracking-[0.3em]" dir="ltr" aria-label={code()!.split("").join(" ")}>{code()}</p>
              <div class="grid grid-cols-2 gap-3">
                <Button variant="soft" onClick={() => copy(message())}><IconCopy />{copied() ? t("common.copied") : t("common.copy")}</Button>
                <a href={`https://wa.me/?text=${encodeURIComponent(message())}`} target="_blank" rel="noopener" onClick={() => tick()}
                  class="flex h-14 items-center justify-center gap-2 rounded-full bg-surface-2 text-[17px] font-semibold active:scale-[0.98]">
                  <IconChat />{t("common.whatsapp")}
                </a>
              </div>
              <p class="text-center text-sm text-ink-3">{t("c.valid")}</p>
            </Show>
          </Loading>
        </Card>
      </Show>

      <Card class="p-2">
        <h2 class="px-3 pb-1 pt-3 text-lg font-semibold">{t("c.members")}</h2>
        <ul>
          <For each={props.d.members}>{m => (
            <li class="flex items-center gap-3 rounded-[20px] p-3">
              <Avatar name={m.name} />
              <span class="min-w-0 flex-1 truncate text-[17px] font-medium">
                {m.name}<Show when={m.member_id === props.d.me.member_id}><span class="text-ink-3"> ({t("common.you")})</span></Show>
              </span>
              <Show when={m.role !== "member"}><Badge tone="neutral">{m.role === "owner" ? t("c.organizer") : t("c.coOrganizer")}</Badge></Show>
            </li>
          )}</For>
        </ul>
      </Card>

      <Show when={error()}><ErrorNote message={error()} /></Show>

      <Sheet open={confirm()} onClose={() => setConfirm(false)} label={t("c.startNow")}>
        <div class="flex flex-col gap-5 px-2">
          <div>
            <h2 class="text-2xl font-bold">{t("c.startNow")}</h2>
            <p class="mt-2 text-[16px] text-ink-2">{t("c.startWarn", { date: dateLong(props.d.committee.start_date) })}</p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <Button variant="soft" onClick={() => setConfirm(false)}>{t("c.notYet")}</Button>
            <Button disabled={busy()} onClick={start}>{busy() ? t("c.starting") : t("c.yesStart")}</Button>
          </div>
        </div>
      </Sheet>
    </Screen>
  );
}

/* ───────────── Running ───────────── */

function Running(props: { d: Dashboard }) {
  const round = () => props.d.rounds.find(r => r.round === props.d.current_round) ?? props.d.rounds[0];
  const me = () => props.d.members.find(m => m.member_id === props.d.me.member_id);
  const notStarted = () => props.d.today < props.d.committee.start_date;
  const { copied, copy } = useCopy();
  const seats = (): Seat[] => props.d.members.map(m => ({ name: m.name, status: notStarted() ? "none" : seatStatus(m), gold: m.paid_out, self: m.member_id === props.d.me.member_id }));
  const tossIn = () => (round() ? daysBetween(props.d.today, round()!.toss_date) : 0);

  return (
    <Screen backTo="/" title={props.d.committee.name} bottom={
      <Button class="w-full" onClick={() => copy(props.d.committee.account_number)}>
        <IconCopy />{copied() ? t("common.copied") : `${t("common.copy")} ${formatPkMobile(props.d.committee.account_number)}`}
      </Button>
    }>
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
    </div>
  );
}

function RoundRow(props: { d: Dashboard; r: DashboardRound }) {
  const winner = () => props.d.members.find(m => m.member_id === props.r.winner_member_id)?.name;
  const current = () => props.r.round === props.d.current_round;
  return (
    <div class={["flex items-center gap-3 rounded-[20px] p-3", { "bg-surface-2": current() }]}>
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
    </div>
  );
}

