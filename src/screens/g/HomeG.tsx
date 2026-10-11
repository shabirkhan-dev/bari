import { createMemo, createSignal, Errored, For, Loading, Match, Show, Switch } from "solid-js";
import { getDashboard, myLedger, type Dashboard, type HomeItem, type Ledger } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { freshness } from "../../lib/live";
import { hidden, setCurrent, toggleHidden } from "../../lib/current";
import { navigate } from "../../lib/router";
import { daysBetween } from "../../domain/display";
import { dateShort, lang, money, t, timeOfDay } from "../../i18n";
import type { Key } from "../../i18n/strings";
import { firstName, GAvatar, GIcon, GMoney, GNote, GScreen, GSheet, GSkeleton, Halo, SwitchPill, WideHalo } from "../../ui/glass";
import { tick } from "../../ui/kit";
import { nowHHMM, periodOf, unitCount } from "./common";

export function HomeG(props: { id: string; items: () => HomeItem[] }) {
  const dash = createMemo(() => { freshness(); return getDashboard(props.id); });
  const ledger = createMemo(() => { freshness(); return myLedger(props.id); });
  return (
    <GScreen nav={props.id}>
      <Errored fallback={err => <GNote tone="error">{describeError(err())}</GNote>}>
        <Loading fallback={<GSkeleton />}>
          <HomeBody d={dash()} l={ledger()} items={props.items()} />
        </Loading>
      </Errored>
    </GScreen>
  );
}

function HomeBody(props: { d: Dashboard; l: Ledger; items: HomeItem[] }) {
  const [switching, setSwitching] = createSignal(false);
  const c = () => props.d.committee;
  const round = () => props.d.current_round ?? props.l.current_round;
  const thisRound = () => props.l.rounds.find(r => r.round === props.l.current_round);
  const isOrganizer = () => props.d.me.role !== "member";

  return (
    <>
      <div class="mt-5 flex justify-center">
        <SwitchPill chip={[...c().name][0]?.toUpperCase() ?? "B"} onClick={() => setSwitching(true)} label={`${c().name} · ${t("g.h.switch")}`}>
          <span class="max-w-[170px] truncate text-[13px] font-medium">{c().name}</span>
          <Show when={round()}><span class="text-[13px]" style={{ color: "var(--g-faint)" }} dir="ltr">R{round()}</span></Show>
        </SwitchPill>
      </div>

      <section class="mt-4 flex flex-col items-center text-center">
        <p class="g-serif text-[20px]" style={{ color: "var(--g-ink-2)" }}>{t("g.h.pot")}</p>
        <div class="relative mt-1 flex w-full justify-center">
          <GMoney paisa={c().payout_paisa} size={50} hideable />
          <button type="button" class="absolute end-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full"
            style={{ color: "var(--g-muted)" }} aria-label={hidden() ? t("g.h.show") : t("g.h.hide")} aria-pressed={hidden() ? "true" : "false"}
            onClick={() => { tick(); toggleHidden(); }}>
            {hidden() ? <GIcon.eyeOff /> : <GIcon.eye />}
          </button>
        </div>
      </section>

      <div class="mt-5 grid grid-cols-2 gap-2.5">
        <SavingsCard d={props.d} l={props.l} paid={thisRound()?.paid_paisa ?? 0} />
        <MembersCard d={props.d} />
      </div>

      <PayCard d={props.d} l={props.l} />

      <Show when={isOrganizer() && props.d.pending_reviews > 0}>
        <a href={`/c/${c().id}/review`} class="g-card mt-3 flex items-center gap-3 px-4 py-3"
          onClick={e => { e.preventDefault(); tick(); navigate(`/c/${c().id}/review`); }}>
          <span class="g-chip g-chip-amber">{props.d.pending_reviews}</span>
          <span class="flex-1 text-[14px] font-medium">{props.d.pending_reviews === 1 ? t("g.h.toCheck1") : t("g.h.toCheck", { n: props.d.pending_reviews })}</span>
          <span style={{ color: "var(--g-muted)" }}><GIcon.arrow /></span>
        </a>
      </Show>

      <NextToss d={props.d} />

      <SwitchSheet open={switching()} onClose={() => setSwitching(false)} items={props.items} currentId={c().id} />
    </>
  );
}

/* ───────────── Your savings: thin-line bars per week of this round ───────────── */

function SavingsCard(props: { d: Dashboard; l: Ledger; paid: number }) {
  const f = () => props.d.committee.frequency;
  const groups = createMemo(() => {
    const days = props.l.days;
    const size = f() === "daily" ? 7 : Math.max(1, Math.ceil(days.length / 6));
    const out: { label: string; frac: number; current: boolean; future: boolean }[] = [];
    for (let i = 0; i < days.length; i += size) {
      const g = days.slice(i, i + size);
      const n = out.length + 1;
      out.push({
        label: t(`g.bar.${f()}` as Key, { n: size === 1 || f() === "daily" ? n : g[0]!.n }),
        frac: g.filter(d => d.state === "verified").length / g.length,
        current: g.some(d => d.due_date === props.l.today),
        future: g[0]!.due_date > props.l.today
      });
    }
    return out;
  });
  const W = 146;
  const gap = 4;
  const gw = () => Math.min(26, (W - (groups().length - 1) * gap) / Math.max(1, groups().length));
  const lines = () => Math.max(3, Math.round(gw() / 3.1));

  return (
    <a href="/ledger" class="g-card flex h-[170px] flex-col px-3 pb-2.5 pt-3.5"
      onClick={e => { e.preventDefault(); tick(); navigate("/ledger", { replace: true, direction: "none" }); }}>
      <h2 class="g-serif px-1 text-[16px]">{t("g.h.savings")}</h2>
      <div class="mt-2 text-center"><GMoney paisa={props.paid} size={14} hideable /></div>
      <p class="mt-1.5 text-center text-[11px]" style={{ color: "var(--g-faint)" }}>{t("g.h.thisRound")}</p>
      <svg class="mt-auto w-full" viewBox={`0 0 ${W} 66`} aria-hidden="true" preserveAspectRatio="none" style={{ height: "66px" }}>
        <For each={groups()}>{(g, i) => {
          const x0 = () => (lang() === "ur" ? W - gw() - i() * (gw() + gap) : i() * (gw() + gap));
          const h = () => (g.future ? 8 : 8 + g.frac * 44);
          return (
            <>
              <For each={Array.from({ length: lines() })}>{(_, j) => (
                <rect x={x0() + j() * (gw() / lines()) + 0.5} y={52 - h()} width="1.3" height={h()}
                  fill={g.current ? "var(--g-emerald)" : "var(--g-bar)"} />
              )}</For>
              <text x={x0() + gw() / 2} y="64" text-anchor="middle" font-size="9.5" font-family="Manrope, sans-serif"
                font-weight={g.current ? 700 : 400} fill={g.current ? "var(--g-ink)" : "var(--g-faint)"}>{g.label}</text>
            </>
          );
        }}</For>
      </svg>
    </a>
  );
}

/* ───────────── Members: who has paid today ───────────── */

function MembersCard(props: { d: Dashboard }) {
  const ms = () => props.d.members;
  const shown = () => (ms().length <= 5 ? ms() : ms().slice(0, 5));
  const dot = (s: string | null): "paid" | "due" | null => (s === "verified" ? "paid" : s ? "due" : null);
  const name = (m: Dashboard["members"][number]) => (m.member_id === props.d.me.member_id ? t("g.you") : firstName(m.name));
  return (
    <a href="/members" class="g-card flex h-[170px] flex-col px-3 pt-3.5"
      onClick={e => { e.preventDefault(); tick(); navigate("/members", { replace: true, direction: "none" }); }}>
      <h2 class="g-serif px-1 text-[16px]">{t("g.h.members")}</h2>
      <ul class="mt-2.5 grid grid-cols-3 gap-x-1 gap-y-1.5">
        <For each={shown()}>{m => (
          <li class="flex flex-col items-center gap-0.5">
            <GAvatar name={m.name} seed={m.user_id} size={34} dot={dot(m.today_state)} />
            <span class="w-full truncate text-center text-[11px]" style={{ color: "var(--g-ink-2)" }}>{name(m)}</span>
          </li>
        )}</For>
        <li class="flex flex-col justify-center gap-1 ps-1 text-[11px]">
          <Show when={ms().length > 5} fallback={
            <>
              <span class="flex items-center gap-1.5"><span class="h-1.5 w-1.5 rounded-full" style={{ background: "var(--g-emerald)" }} />{t("g.h.paid")}</span>
              <span class="flex items-center gap-1.5"><span class="h-1.5 w-1.5 rounded-full" style={{ background: "var(--g-amber)" }} />{t("g.h.due")}</span>
            </>
          }>
            <span class="g-avatar mx-auto" style={{ width: "34px", height: "34px", "font-size": "12px", background: "var(--g-inner)", color: "var(--g-ink)" }} dir="ltr">+{ms().length - 5}</span>
          </Show>
        </li>
      </ul>
    </a>
  );
}

/* ───────────── Today's payment ───────────── */

export function PayCard(props: { d: Dashboard; l: Ledger }) {
  const c = () => props.d.committee;
  const me = () => props.d.members.find(m => m.member_id === props.d.me.member_id);
  const today = () => props.l.today;
  const started = () => today() >= c().start_date;
  const todayDay = () => props.l.days.find(d => d.due_date === today());
  const todayDue = () => { const s = todayDay()?.state; return s === "due" || s === "rejected"; };
  const lateCount = () => me()?.overdue_count ?? 0;
  const owed = () => (me()?.overdue_paisa ?? 0) + (todayDue() ? todayDay()!.amount_paisa : 0);
  const beforeCutoff = () => nowHHMM() < props.d.cutoff;
  const tossDate = () => props.l.rounds.find(r => r.round === props.l.current_round)?.toss_date;
  const payTo = () => `/c/${c().id}/pay`;

  return (
    <section class="g-card g-card-strong mt-4 flex flex-col px-4 pb-3.5 pt-3.5" aria-live="polite">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-[11px]" style={{ color: "var(--g-muted)" }}>
            {todayDay() ? periodOf(c().frequency, todayDay()!.n, props.l.periods_per_round) : t("g.l.round", { n: props.l.current_round })}
          </p>
          <h2 class="g-serif mt-0.5 text-[21px] leading-tight">
            <Switch fallback={t("g.h.noneToday")}>
              <Match when={!started()}>{t("g.h.starts", { date: dateShort(c().start_date) })}</Match>
              <Match when={lateCount() > 0}>{t("g.h.owe", { count: unitCount(c().frequency, lateCount() + (todayDue() ? 1 : 0)) })}</Match>
              <Match when={todayDue()}>{t("g.h.notPaid")}</Match>
              <Match when={todayDay()?.state === "submitted"}>{t("g.h.checking")}</Match>
              <Match when={todayDay()?.state === "verified"}>{t("g.h.paidToday")}</Match>
            </Switch>
          </h2>
        </div>
        <Switch>
          <Match when={todayDue() && lateCount() === 0 && beforeCutoff()}><span class="g-chip g-chip-amber">{t("g.h.closes", { time: timeOfDay(props.d.cutoff) })}</span></Match>
          <Match when={(todayDue() || lateCount() > 0) && tossDate()}><span class="g-chip g-chip-amber">{t("g.h.late", { date: dateShort(tossDate()!) })}</span></Match>
          <Match when={todayDay()?.state === "submitted"}><span class="g-chip g-chip-amber">{t("status.checking")}</span></Match>
          <Match when={todayDay()?.state === "verified"}><span class="g-chip g-chip-green">{t("g.h.paid")}</span></Match>
        </Switch>
      </div>

      <TickStrip l={props.l} label={todayDay() ? periodOf(c().frequency, todayDay()!.n, props.l.periods_per_round) : ""} />

      <Show when={owed() > 0} fallback={
        <WideHalo h={56} href={payTo()}><span class="text-[15px] font-medium">{t("g.h.payAhead")}</span></WideHalo>
      }>
        <WideHalo h={56} dark href={payTo()}>
          <span class="text-[15px] font-medium">{t("g.h.payNow", { amount: money(owed()) })}</span>
          <GIcon.arrow />
        </WideHalo>
      </Show>
    </section>
  );
}

function TickStrip(props: { l: Ledger; label: string }) {
  const color = (d: Ledger["days"][number]) => {
    if (d.due_date === props.l.today) return "var(--g-ink)";
    if (d.due_date > props.l.today) return "var(--g-tick)";
    if (d.state === "verified") return "var(--g-emerald)";
    if (d.state === "submitted" || d.state === "disputed") return "color-mix(in srgb, var(--g-emerald) 45%, transparent)";
    return "var(--g-amber)";
  };
  return (
    <div role="img" aria-label={props.label} class="my-3.5 flex h-[22px] items-center justify-between">
      <For each={props.l.days}>{d => (
        <span class="w-[2px] rounded-full" style={{ height: d.due_date === props.l.today ? "22px" : "14px", background: color(d), opacity: d.due_date < props.l.today ? 0.9 : 1 }} />
      )}</For>
    </div>
  );
}

/* ───────────── Next toss ───────────── */

export function NextToss(props: { d: Dashboard }) {
  const next = () => props.d.rounds.find(r => r.status === null);
  const left = () => props.d.members.filter(m => !m.paid_out).length;
  return (
    <a href="/toss" class="g-card mt-3 flex h-[76px] items-center gap-3 px-3"
      onClick={e => { e.preventDefault(); tick(); navigate("/toss", { replace: true, direction: "none" }); }}>
      <Halo w={52}><GIcon.toss size={18} /></Halo>
      <span class="min-w-0 flex-1">
        <Show when={next()} fallback={<span class="g-serif block text-[17px]">{t("g.h.finished")}</span>}>
          {r => (
            <>
              <span class="g-serif block truncate text-[17px]">{t("g.h.nextToss", { date: dateShort(r().toss_date) })}</span>
              <span class="mt-0.5 block truncate text-[12px]" style={{ color: "var(--g-muted)" }}>
                {daysBetween(props.d.today, r().toss_date) <= 0
                  ? t("g.h.tossToday", { m: left() })
                  : t("g.h.inDays", { n: daysBetween(props.d.today, r().toss_date), m: left() })}
              </span>
            </>
          )}
        </Show>
      </span>
      <span class="pe-2" style={{ color: "var(--g-muted)" }}><GIcon.arrow /></span>
    </a>
  );
}

/* ───────────── Committee switcher ───────────── */

export function SwitchSheet(props: { open: boolean; onClose: () => void; items: HomeItem[]; currentId: string }) {
  const go = (to: string) => { props.onClose(); navigate(to); };
  const row = "flex w-full items-center gap-3 rounded-[20px] p-2.5 text-start active:opacity-70";
  return (
    <GSheet open={props.open} onClose={props.onClose} label={t("g.h.switch")}>
      <h2 class="g-serif px-1 text-[24px]">{t("g.h.switch")}</h2>
      <ul class="flex flex-col gap-1">
        <For each={props.items.filter(i => i.status === "active" || i.status === "forming")}>{i => (
          <li>
            <button type="button" class={row} aria-current={i.id === props.currentId ? "true" : undefined}
              onClick={() => { tick(); if (i.status === "active") { setCurrent(i.id); props.onClose(); } else go(`/c/${i.id}`); }}>
              <span class="g-step h-9 w-9 text-[15px]">{[...i.name][0]?.toUpperCase()}</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[15px] font-semibold">{i.name}</span>
                <span class="block text-[12px]" style={{ color: "var(--g-muted)" }}>
                  {i.status === "forming" ? t("g.h.forming", { joined: i.joined, total: i.member_count }) : money(i.payout_paisa)}
                </span>
              </span>
              <Show when={i.id === props.currentId}><span style={{ color: "var(--g-emerald)" }}><GIcon.check /></span></Show>
            </button>
          </li>
        )}</For>
      </ul>
      <div class="g-divider" />
      <button type="button" class={row} onClick={() => go("/new")}>
        <span class="grid h-9 w-9 place-items-center rounded-full" style={{ background: "var(--g-inner)" }}><GIcon.plus /></span>
        <span class="text-[15px] font-medium">{t("sheet.new")}</span>
      </button>
      <button type="button" class={row} onClick={() => go("/join")}>
        <span class="grid h-9 w-9 place-items-center rounded-full" style={{ background: "var(--g-inner)" }}><GIcon.key /></span>
        <span class="text-[15px] font-medium">{t("sheet.join")}</span>
      </button>
    </GSheet>
  );
}
