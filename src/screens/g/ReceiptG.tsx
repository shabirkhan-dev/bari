import { createMemo, createSignal, Errored, For, Loading, Show } from "solid-js";
import { getDashboard, receiptUrl, rejectSubmission, reviewQueue, verifySubmission, type Dashboard, type ReviewItem } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { freshness } from "../../lib/live";
import { navigate } from "../../lib/router";
import { clock, dateShort, money, pktDate, t } from "../../i18n";
import { GAvatar, GIcon, GMoney, GNote, GScreen, GSheet, GSkeleton, Halo, SlideToConfirm, WideHalo } from "../../ui/glass";
import { tick } from "../../ui/kit";
import { groupedTid, maskedPhone, periodOf, periodsLabel } from "./common";

export function ReceiptG(props: { id: string; sid: string }) {
  const queue = createMemo(() => { freshness(); return reviewQueue(props.id); });
  const dash = createMemo(() => getDashboard(props.id));
  return (
    <Errored fallback={err => <GScreen title={t("g.r.title")} left="back" backTo={`/c/${props.id}/review`}><GNote tone="error">{describeError(err())}</GNote></GScreen>}>
      <Loading fallback={<GScreen title={t("g.r.title")} left="back"><GSkeleton /></GScreen>}>
        <Show when={queue().find(i => i.id === props.sid)} fallback={
          <GScreen title={t("g.r.title")} left="back" backTo={`/c/${props.id}/review`}>
            <div class="mt-10 flex flex-col gap-4">
              <GNote>{t("g.r.gone")}</GNote>
              <WideHalo h={56} href={`/c/${props.id}/review`}><span class="text-[14px] font-medium">{t("review.title")}</span></WideHalo>
            </div>
          </GScreen>
        }>
          {item => <Check d={dash()} item={item()} queue={queue()} />}
        </Show>
      </Loading>
    </Errored>
  );
}

function Check(props: { d: Dashboard; item: ReviewItem; queue: ReviewItem[] }) {
  const [rejecting, setRejecting] = createSignal(false);
  const [viewing, setViewing] = createSignal(false);
  const [error, setError] = createSignal("");
  const c = () => props.d.committee;
  const it = () => props.item;
  const seed = () => props.d.members.find(m => m.member_id === it().member_id)?.user_id ?? it().member_id;

  const where = () => {
    const refs = it().periods ?? [];
    if (refs.length === 1) return periodOf(c().frequency, refs[0]!.n, c().periods_per_round);
    return periodsLabel(c().frequency, refs) || it().due_dates.map(dateShort).join(", ");
  };
  const checks = () => [
    { label: t("g.r.chkAmount"), ok: it().receipt_amount_paisa === null ? null : it().receipt_amount_paisa === it().amount_paisa },
    { label: t("g.r.chkSuccess"), ok: it().receipt_successful },
    { label: t("g.r.chkTid"), ok: it().tid ? true : null }
  ];
  const passed = () => checks().filter(x => x.ok === true).length;
  const time = () => {
    const iso = it().transferred_at ?? it().created_at;
    return `${dateShort(pktDate(iso))}, ${clock(iso)}`;
  };

  /** After a decision: the next payment this organizer can check, else the list. */
  const next = () => {
    const n = props.queue.find(i => i.id !== it().id && i.can_decide && i.status === "pending");
    navigate(n ? `/c/${c().id}/review/${n.id}` : `/c/${c().id}/review`, { replace: true });
  };
  const approve = async () => {
    setError("");
    try { await verifySubmission(it().id, it().amount_paisa); tick(); next(); }
    catch (e) { setError(describeError(e)); }
  };

  return (
    <GScreen title={t("g.r.title")} left="back" backTo={`/c/${c().id}/review`} bottom={
      <Show when={it().can_decide} fallback={
        <div class="g-halo flex-1" style={{ height: "64px" }}><span class="g-core px-3 text-center text-[13px]" style={{ color: "var(--g-muted)" }}>{t("review.own")}</span></div>
      }>
        <button type="button" class="g-halo shrink-0" style={{ width: "136px", height: "64px" }} onClick={() => { tick(); setRejecting(true); }}>
          <span class="g-core justify-start gap-2.5 ps-[5px]">
            <span class="grid h-10 w-10 place-items-center rounded-full border border-dashed" style={{ "border-color": "var(--g-dash)", background: "var(--g-inner)" }}><GIcon.x /></span>
            <span class="text-[13px] font-medium">{t("g.r.reject")}</span>
          </span>
        </button>
        <SlideToConfirm label={t("g.r.slide")} busyLabel={t("g.r.approving")} onConfirm={approve} />
      </Show>
    }>
      <section class="mt-2 flex flex-col items-center text-center">
        <Halo w={96}><GAvatar name={it().member_name} seed={seed()} size={82} /></Halo>
        <h2 class="g-serif mt-3 text-[26px]">{it().member_name}</h2>
        <p class="mt-1 text-[12px]" style={{ color: "var(--g-muted)" }}>JazzCash{where() ? ` · ${where()}` : ""}</p>
        <span class={["g-chip mt-3", it().status === "disputed" ? "g-chip-red" : it().can_decide ? "g-chip-amber" : "g-chip-plain"]}
          style={!it().can_decide && it().status !== "disputed" ? { background: "var(--g-inner)", color: "var(--g-muted)" } : undefined}>
          {it().status === "disputed" ? t("c.disputed") : it().can_decide ? t("g.r.waiting") : t("g.r.own")}
        </span>
        <GMoney paisa={it().amount_paisa} size={46} class="mt-3" />
      </section>

      <section class="g-card mt-5 px-4 pb-4 pt-1">
        <dl>
          <Field label={t("g.r.tid")} value={it().tid ? groupedTid(it().tid!) : t("g.r.none")} num={!!it().tid} />
          <Field label={t("g.r.from")} value={it().member_phone ? maskedPhone(it().member_phone!) : t("g.r.none")} num={!!it().member_phone} />
          <Show when={it().paid_by_name}><Field label={t("g.r.paidBy")} value={it().paid_by_name!} /></Show>
          <Field label={t("g.r.to")} value={`${c().account_title} · ${c().account_number.slice(-4)}`} />
          <Field label={t("g.r.time")} value={time()} last />
        </dl>
        <p class="mt-3 text-[12px] font-semibold" style={{ color: passed() === 3 ? "var(--g-emerald)" : "var(--g-amber)" }}>
          {passed() === 3 ? t("g.r.allPassed") : t("g.r.somePassed", { n: passed() })}
        </p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <For each={checks()}>{x => <span class={["g-chip", x.ok === true ? "g-chip-green" : x.ok === false ? "g-chip-red" : "g-chip-amber"]}>{x.label}</span>}</For>
        </div>
      </section>

      <Shot item={it()} onView={() => setViewing(true)} viewing={viewing()} onClose={() => setViewing(false)} />

      <p class="mt-3 px-1 text-center text-[12px]" style={{ color: "var(--g-muted)" }}>{t("g.r.checkNote")}</p>
      <Show when={error()}><div class="mt-3"><GNote tone="error">{error()}</GNote></div></Show>

      <RejectSheet open={rejecting()} item={it()} onClose={() => setRejecting(false)} onDone={() => { setRejecting(false); next(); }} />
    </GScreen>
  );
}

function Field(props: { label: string; value: string; num?: boolean; last?: boolean }) {
  return (
    <>
      <div class="flex items-center justify-between gap-3 py-3">
        <dt class="shrink-0 text-[12px]" style={{ color: "var(--g-muted)" }}>{props.label}</dt>
        <dd class={["min-w-0 truncate text-end", props.num ? "g-num text-[16px]" : "g-serif text-[15px]"]} dir={props.num ? "ltr" : undefined}>{props.value}</dd>
      </div>
      <Show when={!props.last}><div class="g-divider" /></Show>
    </>
  );
}

function Shot(props: { item: ReviewItem; onView: () => void; viewing: boolean; onClose: () => void }) {
  const url = createMemo(() => (props.item.receipt_path ? receiptUrl(props.item.receipt_path) : Promise.resolve(null)));
  const isPdf = () => props.item.receipt_type === "application/pdf";
  const kb = () => (props.item.receipt_size ? `${Math.max(1, Math.round(props.item.receipt_size / 1024))} KB` : "");
  return (
    <section class="g-card g-card-strong mt-3 flex h-[88px] items-center gap-3 px-3.5">
      <Show when={props.item.receipt_path} fallback={<p class="flex-1 text-center text-[13px]" style={{ color: "var(--g-muted)" }}>{t("g.r.noShot")}</p>}>
        <Loading fallback={<span class="skeleton h-[60px] w-[46px] shrink-0 rounded-[10px]" />}>
          <Show when={url() && !isPdf()} fallback={<DocThumb />}>
            <img src={url()!} alt="" class="h-[60px] w-[46px] shrink-0 rounded-[10px] object-cover object-top" style={{ border: "1px solid var(--g-card-border)" }} />
          </Show>
        </Loading>
        <div class="min-w-0 flex-1">
          <p class="g-serif truncate text-[15px]">{t("g.r.shot")}</p>
          <p class="mt-1 truncate text-[11px]" style={{ color: "var(--g-muted)" }}>
            {t("g.r.uploaded", { time: clock(props.item.receipt_created_at ?? props.item.created_at), size: kb() })}
          </p>
        </div>
        <Loading fallback={<span />}>
          <Show when={isPdf()} fallback={<Halo w={74} h={48} onClick={props.onView}><span class="text-[12px] font-medium">{t("g.r.view")}</span></Halo>}>
            <a href={url() ?? "#"} target="_blank" rel="noopener" class="g-halo" style={{ width: "74px", height: "48px" }}>
              <span class="g-core text-[12px] font-medium">{t("g.r.view")}</span>
            </a>
          </Show>
          <GSheet open={props.viewing} onClose={props.onClose} label={t("g.r.shot")}>
            <img src={url() ?? ""} alt={t("g.r.shot")} class="max-h-[75dvh] w-full rounded-2xl object-contain" />
          </GSheet>
        </Loading>
      </Show>
    </section>
  );
}

function DocThumb() {
  return (
    <span aria-hidden="true" class="relative h-[60px] w-[46px] shrink-0 overflow-hidden rounded-[10px]" style={{ background: "var(--g-inner)", border: "1px solid var(--g-dash)" }}>
      <span class="absolute inset-x-0 top-0 h-[14px]" style={{ background: "var(--g-cta)" }} />
      <For each={[22, 30, 38, 46]}>{(y, i) => <span class="absolute h-[3px] rounded-sm" style={{ top: `${y}px`, left: i() === 1 ? "16px" : "7px", width: i() === 1 ? "20px" : "30px", background: "var(--g-tick)" }} />}</For>
    </span>
  );
}

function RejectSheet(props: { open: boolean; item: ReviewItem; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const quick = () => [t("review.r1"), t("review.r2"), t("review.r3")];
  const reject = async () => {
    if (reason().trim().length < 3) return;
    setBusy(true);
    setError("");
    try { await rejectSubmission(props.item.id, reason().trim()); setBusy(false); props.onDone(); }
    catch (e) { setError(describeError(e)); setBusy(false); }
  };
  return (
    <GSheet open={props.open} onClose={props.onClose} label={t("review.rejectTitle")}>
      <div>
        <h2 class="g-serif text-[24px]">{t("review.rejectTitle")}</h2>
        <p class="mt-1 text-[14px]" style={{ color: "var(--g-ink-2)" }}>{money(props.item.amount_paisa)}. {t("review.rejectBody", { name: props.item.member_name })}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <For each={quick()}>{q => (
          <button type="button" onClick={() => { tick(); setReason(q); }} class="h-10 rounded-full px-4 text-[13px] font-medium"
            style={reason() === q ? { background: "var(--g-cta)", color: "var(--g-cta-ink)" } : { background: "var(--g-inner)" }}>{q}</button>
        )}</For>
      </div>
      <label class="flex flex-col gap-1.5">
        <span class="text-[12px]" style={{ color: "var(--g-muted)" }}>{t("review.reason")}</span>
        <input class="h-12 w-full rounded-2xl px-4 text-[15px] outline-none" style={{ background: "var(--g-inner)", color: "var(--g-ink)" }}
          value={reason()} onInput={e => setReason(e.currentTarget.value)} maxlength="500" />
      </label>
      <Show when={error()}><GNote tone="error">{error()}</GNote></Show>
      <div class="grid grid-cols-2 gap-2">
        <WideHalo h={56} onClick={props.onClose}><span class="text-[14px] font-medium">{t("common.cancel")}</span></WideHalo>
        <WideHalo h={56} dark disabled={busy() || reason().trim().length < 3} onClick={reject}><span class="text-[14px] font-medium">{t("g.r.reject")}</span></WideHalo>
      </div>
    </GSheet>
  );
}
