import { createMemo, createSignal, Errored, For, Loading, refresh, Show } from "solid-js";
import { getDashboardV4, membersRound, myLedgerV2, reviewQueue, verifySubmission, type DashboardV4, type HomeItem, type LedgerV2, type MembersRound, type ReviewItem } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { freshness } from "../../lib/live";
import { navigate } from "../../lib/router";
import { clock, money, t, timeOfDay } from "../../i18n";
import { firstName, GAvatar, GIcon, GMoney, GNote, GScreen, GSkeleton, Halo, SwitchPill } from "../../ui/glass";
import { tick } from "../../ui/kit";
import { periodOf } from "./common";
import { NextToss, PayCard, SwitchSheet } from "./HomeG";
import { RejectQuick } from "./ReceiptsG";

/** Figma "Organizer home": today's money, what to check, who hasn't paid, this round. */
export function OrganizerHomeG(props: { id: string; items: () => HomeItem[] }) {
  const dash = createMemo(() => { freshness(); return getDashboardV4(props.id); });
  const mr = createMemo(() => { freshness(); return membersRound(props.id); });
  const queue = createMemo(() => { freshness(); return reviewQueue(props.id); });
  const ledger = createMemo(() => { freshness(); return myLedgerV2(props.id); });
  const reload = () => { refresh(dash); refresh(mr); refresh(queue); refresh(ledger); };
  return (
    <GScreen title={t("oh.title")} nav={props.id}>
      <Errored fallback={err => <GNote tone="error">{describeError(err())}</GNote>}>
        <Loading fallback={<GSkeleton />}>
          <Body d={dash()} mr={mr()} q={queue()} l={ledger()} items={props.items()} onChange={reload} />
        </Loading>
      </Errored>
    </GScreen>
  );
}

function Body(props: { d: DashboardV4; mr: MembersRound; q: ReviewItem[]; l: LedgerV2; items: HomeItem[]; onChange: () => void }) {
  const [switching, setSwitching] = createSignal(false);
  const c = () => props.d.committee;
  const today = () => props.mr.today;
  const verifiedToday = () => props.mr.members.filter(m => m.days.some(x => x.d === today() && x.s === "verified")).length;
  const notPaid = () => props.d.members.filter(m => m.today_state === "due" || m.today_state === "rejected");
  const round = () => props.d.rounds.find(r => r.round === props.mr.round);
  const todayN = () => props.l.days.find(x => x.due_date === today())?.n;
  const waiting = () => props.q.filter(i => i.can_decide && i.status === "pending");

  // Per day of this round: everyone verified (emerald), some (faded), nobody yet (amber), today / ahead (grey).
  const strip = createMemo(() => {
    const days = props.mr.members[0]?.days.map(x => x.d) ?? [];
    return days.map(d => {
      const states = props.mr.members.map(m => m.days.find(x => x.d === d)?.s);
      const v = states.filter(s => s === "verified").length;
      return { d, color: d === today() ? "var(--g-ink)" : d > today() ? "var(--g-tick)" : v === states.length ? "var(--g-emerald)" : v > 0 ? "color-mix(in srgb, var(--g-emerald) 45%, transparent)" : "var(--g-amber)" };
    });
  });

  return (
    <>
      <div class="mt-5 flex justify-center">
        <SwitchPill chip={[...c().name][0]?.toUpperCase() ?? "B"} onClick={() => setSwitching(true)} label={`${c().name} · ${t("g.h.switch")}`}>
          <span class="max-w-[170px] truncate text-[13px] font-medium">{c().name}</span>
          <Show when={props.mr.round}><span class="text-[13px]" style={{ color: "var(--g-faint)" }} dir="ltr">R{props.mr.round}</span></Show>
        </SwitchPill>
      </div>

      <section class="mt-4 flex flex-col items-center text-center">
        <p class="g-serif text-[20px]" style={{ color: "var(--g-ink-2)" }}>{t("oh.collected")}</p>
        <GMoney paisa={verifiedToday() * c().contribution_paisa} size={50} class="mt-1" hideable />
      </section>

      <div class="mt-5 grid grid-cols-2 gap-2.5">
        <a href="/receipts" class="g-card flex h-[120px] flex-col px-4 py-3.5" onClick={e => { e.preventDefault(); tick(); navigate("/receipts", { replace: true, direction: "none" }); }}>
          <span class="text-[12px]" style={{ color: "var(--g-muted)" }}>{t("oh.toCheck")}</span>
          <span class="g-num text-[44px] leading-none" style={{ color: props.q.length ? "var(--g-amber)" : "var(--g-ink)" }}>{props.q.length}</span>
          <span class="mt-auto text-[12px]" style={{ color: "var(--g-muted)" }}>{t("oh.receiptsWaiting")}</span>
        </a>
        <a href="/members" class="g-card flex h-[120px] flex-col px-4 py-3.5" onClick={e => { e.preventDefault(); tick(); navigate("/members", { replace: true, direction: "none" }); }}>
          <span class="text-[12px]" style={{ color: "var(--g-muted)" }}>{t("oh.notPaid")}</span>
          <span class="g-num text-[44px] leading-none">{notPaid().length}</span>
          <span class="mt-auto truncate text-[12px]" style={{ color: "var(--g-muted)" }}>
            {notPaid().length ? t("oh.dueBy", { names: notPaid().slice(0, 2).map(m => firstName(m.name)).join(", ") + (notPaid().length > 2 ? "…" : ""), time: timeOfDay(props.d.cutoff) }) : t("oh.allPaid")}
          </span>
        </a>
      </div>

      <section class="g-card mt-3 px-4 pb-1 pt-4">
        <h2 class="g-serif text-[20px]">{t("oh.waitingForYou")}</h2>
        <Show when={waiting().length > 0} fallback={<p class="py-4 text-[13px]" style={{ color: "var(--g-muted)" }}>{t("oh.nothing")}</p>}>
          <ul>
            <For each={waiting().slice(0, 3)}>{(i, k) => (
              <li><QuickRow i={i} cid={c().id} onDone={props.onChange} />
                <Show when={k() < Math.min(3, waiting().length) - 1}><div class="g-divider" /></Show></li>
            )}</For>
          </ul>
        </Show>
      </section>

      <section class="g-card mt-3 px-4 pb-4 pt-3.5">
        <p class="text-[11px]" style={{ color: "var(--g-muted)" }}>{todayN() ? periodOf(c().frequency, todayN()!, c().periods_per_round) : t("g.l.round", { n: props.mr.round })}</p>
        <p class="g-serif mt-0.5 text-[18px]">{t("oh.roundCollected", { amount: money(round()?.verified_paisa ?? 0) })}</p>
        <div class="mt-3.5 flex h-[22px] items-center justify-between" aria-hidden="true">
          <For each={strip()}>{x => <span class="w-[2px] rounded-full" style={{ height: x.d === today() ? "22px" : "14px", background: x.color }} />}</For>
        </div>
      </section>

      <h2 class="mb-1 mt-5 px-1 text-[13px]" style={{ color: "var(--g-muted)" }}>{t("oh.yours")}</h2>
      <PayCard d={props.d} l={props.l} />
      <a href="/ledger" class="mt-2 block py-2 text-center text-[12px] font-medium underline underline-offset-4" style={{ color: "var(--g-ink-2)" }}
        onClick={e => { e.preventDefault(); tick(); navigate("/ledger"); }}>{t("oh.ledger")}</a>
      <NextToss d={props.d} />

      <SwitchSheet open={switching()} onClose={() => setSwitching(false)} items={props.items} currentId={c().id} />
    </>
  );
}

function QuickRow(props: { i: ReviewItem; cid: string; onDone: () => void }) {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [rejecting, setRejecting] = createSignal(false);
  const approve = async () => {
    setBusy(true); setError("");
    try { await verifySubmission(props.i.id, props.i.amount_paisa); tick(); props.onDone(); }
    catch (e) { setError(describeError(e)); setBusy(false); }
  };
  return (
    <div class="py-3">
      <div class="flex items-center gap-3">
        <a href={`/c/${props.cid}/review/${props.i.id}`} class="flex min-w-0 flex-1 items-center gap-3"
          onClick={e => { e.preventDefault(); tick(); navigate(`/c/${props.cid}/review/${props.i.id}`); }}>
          <GAvatar name={props.i.member_name} seed={props.i.member_id} size={42} />
          <span class="min-w-0">
            <span class="g-serif block truncate text-[17px]">{props.i.member_name}</span>
            <span class="mt-0.5 block truncate text-[11px]" style={{ color: "var(--g-muted)" }}>
              {money(props.i.amount_paisa)} · {clock(props.i.created_at)} · {props.i.tid ? t("oh.tidOk") : t("oh.noTid")}
            </span>
          </span>
        </a>
        <Halo w={52} label={t("oh.reject", { name: props.i.member_name })} disabled={busy()} onClick={() => setRejecting(true)}><GIcon.x /></Halo>
        <Halo w={52} dark label={t("oh.approve", { name: props.i.member_name })} disabled={busy()} onClick={approve}><GIcon.check size={16} /></Halo>
      </div>
      <Show when={error()}><div class="mt-2"><GNote tone="error">{error()}</GNote></div></Show>
      <RejectQuick open={rejecting()} item={props.i} onClose={() => setRejecting(false)} onDone={() => { setRejecting(false); props.onDone(); }} />
    </div>
  );
}
