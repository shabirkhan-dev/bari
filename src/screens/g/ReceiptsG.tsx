import { createMemo, createSignal, Errored, For, Loading, refresh, Show } from "solid-js";
import { receiptUrl, rejectSubmission, reviewHistory, reviewQueue, verifySubmission, type DecidedItem, type ReviewItem } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { freshness } from "../../lib/live";
import { navigate } from "../../lib/router";
import { addDays, todayInPKT } from "../../domain/dates";
import { clock, dateShort, pktDate, t } from "../../i18n";
import { GAvatar, GMoney, GNote, GScreen, GSegmented, GSheet, GSkeleton, gInput, gInputStyle, WideHalo } from "../../ui/glass";
import { tick } from "../../ui/kit";
import { groupedTid } from "./common";

/** Checks shown on a receipt (same three as the Receipt check screen). */
export function checksPassed(i: ReviewItem) {
  return [i.receipt_amount_paisa === i.amount_paisa, i.receipt_successful === true, !!i.tid].filter(Boolean).length;
}

type Tab = "waiting" | "verified" | "rejected";

/** Figma "Receipts queue" (organizer tab). Also serves /c/:id/review. */
export function ReceiptsG(props: { id: string; nav?: boolean }) {
  const queue = createMemo(() => { freshness(); return reviewQueue(props.id); });
  const history = createMemo(() => { freshness(); return reviewHistory(props.id); });
  const [tab, setTab] = createSignal<Tab>("waiting");
  const reload = () => { refresh(queue); refresh(history); };
  return (
    <GScreen title={t("rq.title")} nav={props.nav ? props.id : undefined} left={props.nav ? undefined : "back"} backTo="/">
      <Errored fallback={err => <GNote tone="error">{describeError(err())}</GNote>}>
        <Loading fallback={<GSkeleton />}>
          <div class="mt-3">
            <GSegmented<Tab> label={t("rq.title")} value={tab()} onChange={setTab}
              options={[{ value: "waiting", label: t("rq.waiting", { n: queue().length }) }, { value: "verified", label: t("rq.approved") }, { value: "rejected", label: t("rq.rejected") }]} />
          </div>
          <Show when={tab() === "waiting"} fallback={<Decided items={history().filter(h => h.status === tab())} />}>
            <Show when={queue().length > 0} fallback={<div class="mt-8"><GNote>{t("review.empty")}</GNote></div>}>
              <ul class="mt-4 flex flex-col gap-3">
                <For each={queue()}>{i => <li><Waiting cid={props.id} i={i} onDone={reload} /></li>}</For>
              </ul>
            </Show>
            <Show when={history().some(h => pktDate(h.decided_at) === todayInPKT())}>
              <h2 class="mb-2 mt-5 px-1 text-[13px]" style={{ color: "var(--g-muted)" }}>{t("rq.earlier")}</h2>
              <DecidedList items={history().filter(h => pktDate(h.decided_at) === todayInPKT())} />
            </Show>
          </Show>
        </Loading>
      </Errored>
    </GScreen>
  );
}

function Waiting(props: { cid: string; i: ReviewItem; onDone: () => void }) {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [rejecting, setRejecting] = createSignal(false);
  const url = createMemo(() => (props.i.receipt_path && props.i.receipt_type !== "application/pdf" ? receiptUrl(props.i.receipt_path) : Promise.resolve(null)));
  const n = () => checksPassed(props.i);
  const open = () => navigate(`/c/${props.cid}/review/${props.i.id}`);
  const approve = async () => {
    setBusy(true); setError("");
    try { await verifySubmission(props.i.id, props.i.amount_paisa); tick(); props.onDone(); }
    catch (e) { setError(describeError(e)); setBusy(false); }
  };
  return (
    <article class="g-card px-4 pb-4 pt-4">
      <button type="button" class="flex w-full items-start gap-3 text-start" onClick={() => { tick(); open(); }}>
        <GAvatar name={props.i.member_name} seed={props.i.member_id} size={42} />
        <span class="min-w-0 flex-1">
          <span class="g-serif block truncate text-[18px]">{props.i.member_name}</span>
          <span class="mt-0.5 block truncate text-[11px]" style={{ color: "var(--g-muted)" }} dir="auto">JazzCash{props.i.tid ? ` · TID ${groupedTid(props.i.tid)}` : ""}</span>
        </span>
        <span class="shrink-0 text-end">
          <GMoney paisa={props.i.amount_paisa} size={17} />
          <span class="mt-1 block text-[11px]" style={{ color: "var(--g-faint)" }}>{clock(props.i.created_at)}</span>
        </span>
      </button>
      <div class="mt-3 flex items-end gap-3">
        <button type="button" class="shrink-0" aria-label={t("review.viewReceipt")} onClick={() => { tick(); open(); }}>
          <Loading fallback={<span class="skeleton block h-[56px] w-[42px] rounded-[9px]" />}>
            <Show when={url()} fallback={<Doc />}>{u => <img src={u()} alt="" class="h-[56px] w-[42px] rounded-[9px] object-cover object-top" style={{ border: "1px solid var(--g-card-border)" }} />}</Show>
          </Loading>
        </button>
        <div class="min-w-0 flex-1">
          <span class={["g-chip", n() === 3 ? "g-chip-green" : "g-chip-amber"]}>{n() === 3 ? t("g.r.allPassed") : t("g.r.somePassed", { n: n() })}</span>
          <Show when={props.i.can_decide} fallback={<p class="mt-3 text-[12px]" style={{ color: "var(--g-muted)" }}>{t("review.own")}</p>}>
            <div class="mt-3 flex justify-end gap-2">
              <WideHalo h={46} class="max-w-[96px]" disabled={busy()} onClick={() => setRejecting(true)}><span class="text-[13px] font-medium">{t("g.r.reject")}</span></WideHalo>
              <WideHalo h={46} dark class="max-w-[96px]" disabled={busy()} onClick={approve} label={t("oh.approve", { name: props.i.member_name })}>
                <span class="text-[13px] font-medium">{t("rq.approve")}</span>
              </WideHalo>
            </div>
          </Show>
        </div>
      </div>
      <Show when={error()}><div class="mt-3"><GNote tone="error">{error()}</GNote></div></Show>
      <RejectQuick open={rejecting()} item={props.i} onClose={() => setRejecting(false)} onDone={() => { setRejecting(false); props.onDone(); }} />
    </article>
  );
}

function Decided(props: { items: DecidedItem[] }) {
  const today = todayInPKT();
  const groups = () => {
    const out: { day: string; items: DecidedItem[] }[] = [];
    for (const i of props.items) {
      const d = pktDate(i.decided_at);
      const g = out.at(-1);
      if (g && g.day === d) g.items.push(i); else out.push({ day: d, items: [i] });
    }
    return out;
  };
  const name = (d: string) => (d === today ? t("g.l.today") : d === addDays(today, -1) ? t("g.l.yesterday") : dateShort(d));
  return (
    <Show when={props.items.length > 0} fallback={<div class="mt-8"><GNote>{t("rq.empty")}</GNote></div>}>
      <For each={groups()}>{g => (
        <>
          <h2 class="mb-2 mt-5 px-1 text-[13px]" style={{ color: "var(--g-muted)" }}>{name(g.day)}</h2>
          <DecidedList items={g.items} />
        </>
      )}</For>
    </Show>
  );
}

function DecidedList(props: { items: DecidedItem[] }) {
  return (
    <ul class="g-card px-4">
      <For each={props.items}>{(i, k) => (
        <li class={["flex items-center gap-3 py-3", k() < props.items.length - 1 && "border-b"]} style={{ "border-color": "var(--g-divider)" }}>
          <GAvatar name={i.member_name} seed={i.member_id} size={42} />
          <span class="min-w-0 flex-1">
            <span class="g-serif block truncate text-[17px]">{i.member_name}</span>
            <span class="mt-0.5 block truncate text-[12px]" style={{ color: i.status === "verified" ? "var(--g-emerald)" : "var(--g-red)" }}>
              {i.status === "verified" ? t("rq.approvedAt", { time: clock(i.decided_at) }) : t("rq.rejectedAt", { time: clock(i.decided_at) })}
              {i.status === "rejected" && i.decision_reason ? ` · ${i.decision_reason}` : ""}
            </span>
          </span>
          <GMoney paisa={i.amount_paisa} size={16} noCents />
        </li>
      )}</For>
    </ul>
  );
}

function Doc() {
  return (
    <span aria-hidden="true" class="relative block h-[56px] w-[42px] overflow-hidden rounded-[9px]" style={{ background: "var(--g-inner)", border: "1px solid var(--g-dash)" }}>
      <span class="absolute inset-x-0 top-0 h-[12px]" style={{ background: "var(--g-cta)" }} />
      <For each={[20, 27, 34, 41]}>{(y, i) => <span class="absolute h-[3px] rounded-sm" style={{ top: `${y}px`, left: i() === 1 ? "14px" : "6px", width: i() === 1 ? "18px" : "26px", background: "var(--g-tick)" }} />}</For>
    </span>
  );
}

export function RejectQuick(props: { open: boolean; item: ReviewItem; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const quick = () => [t("review.r1"), t("review.r2"), t("review.r3")];
  const reject = async () => {
    if (reason().trim().length < 3) return;
    setBusy(true); setError("");
    try { await rejectSubmission(props.item.id, reason().trim()); setBusy(false); props.onDone(); }
    catch (e) { setError(describeError(e)); setBusy(false); }
  };
  return (
    <GSheet open={props.open} onClose={props.onClose} label={t("review.rejectTitle")}>
      <h2 class="g-serif text-[24px]">{t("review.rejectTitle")}</h2>
      <p class="text-[14px]" style={{ color: "var(--g-ink-2)" }}>{t("review.rejectBody", { name: props.item.member_name })}</p>
      <div class="flex flex-wrap gap-2">
        <For each={quick()}>{q => (
          <button type="button" onClick={() => { tick(); setReason(q); }} class="h-10 rounded-full px-4 text-[13px] font-medium"
            style={reason() === q ? { background: "var(--g-cta)", color: "var(--g-cta-ink)" } : { background: "var(--g-inner)" }}>{q}</button>
        )}</For>
      </div>
      <input class={gInput} style={gInputStyle} aria-label={t("review.reason")} placeholder={t("review.reason")} value={reason()} maxlength="500" onInput={e => setReason(e.currentTarget.value)} />
      <Show when={error()}><GNote tone="error">{error()}</GNote></Show>
      <WideHalo h={56} dark disabled={busy() || reason().trim().length < 3} onClick={reject}><span class="text-[14px] font-medium">{t("g.r.reject")}</span></WideHalo>
    </GSheet>
  );
}
