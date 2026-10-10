import { createMemo, createSignal, Errored, For, Loading, refresh, Show } from "solid-js";
import { receiptUrl, rejectSubmission, reviewQueue, verifySubmission, type ReviewItem } from "../lib/api";
import { describeError } from "../lib/errors";
import { dateShort, lang, money, t } from "../i18n";
import { Avatar, Badge, Button, Card, ErrorNote, inputClass, Money, Screen, Sheet, Skeleton, tick, useCopy } from "../ui/kit";
import { IconCheck, IconCopy } from "../ui/icons";

export function Review(props: { id: string }) {
  const queue = createMemo(() => reviewQueue(props.id));
  const [rejecting, setRejecting] = createSignal<ReviewItem | null>(null);
  const reload = () => refresh(queue);

  return (
    <Screen backTo={`/c/${props.id}`} title={t("review.title")}>
      <p class="px-1 text-[15px] text-ink-2">{t("review.howTo")}</p>
      <Errored fallback={err => <ErrorNote message={describeError(err())} />}>
        <Loading fallback={<Skeleton lines={2} />}>
          <Show when={queue().length > 0} fallback={
            <section class="flex flex-col items-center gap-3 py-16 text-center">
              <span class="grid h-20 w-20 place-items-center rounded-full bg-ok-soft text-ok"><IconCheck size={36} /></span>
              <h2 class="text-2xl font-bold">{t("review.empty")}</h2>
              <p class="text-ink-2">{t("review.emptyBody")}</p>
            </section>
          }>
            <ul class="flex flex-col gap-4">
              <For each={queue()}>{item => <li><ReviewCard item={item} onDone={reload} onReject={() => setRejecting(item)} /></li>}</For>
            </ul>
          </Show>
        </Loading>
      </Errored>
      <RejectSheet item={rejecting()} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); reload(); }} />
    </Screen>
  );
}

function ReviewCard(props: { item: ReviewItem; onDone: () => void; onReject: () => void }) {
  const url = createMemo(() => (props.item.receipt_path ? receiptUrl(props.item.receipt_path) : Promise.resolve(null)));
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [zoom, setZoom] = createSignal(false);
  const { copied, copy } = useCopy();
  const dates = () => props.item.due_dates.map(dateShort).join(lang() === "ur" ? "، " : ", ");

  const confirm = async () => {
    setBusy(true);
    setError("");
    try { await verifySubmission(props.item.id, props.item.amount_paisa); tick(); props.onDone(); }
    catch (e) { setError(describeError(e)); setBusy(false); }
  };

  return (
    <Card class="flex flex-col gap-4">
      <div class="flex items-center gap-3">
        <Avatar name={props.item.member_name} />
        <div class="min-w-0 flex-1">
          <p class="truncate text-[17px] font-semibold">{props.item.member_name}</p>
          <p class="text-sm text-ink-2">{t("review.covers", { dates: dates() })}</p>
        </div>
        <Money paisa={props.item.amount_paisa} size="md" />
      </div>

      <div class="flex gap-4">
        <Loading fallback={<div class="skeleton h-36 w-28 shrink-0" />}>
          <Show when={url()} fallback={<span class="h-fit shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-sm text-ink-3">{t("review.noReceipt")}</span>}>
            {u => (
              <Show when={props.item.receipt_type !== "application/pdf"} fallback={
                <a href={u()} target="_blank" rel="noopener" class="grid h-36 w-28 shrink-0 place-items-center rounded-2xl bg-surface-2 font-semibold">PDF</a>
              }>
                <button type="button" aria-label={t("review.viewReceipt")} onClick={() => { tick(); setZoom(true); }} class="shrink-0">
                  <img src={u()} alt="" class="h-36 w-28 rounded-2xl object-cover object-top" />
                </button>
                <Sheet open={zoom()} onClose={() => setZoom(false)} label={t("review.viewReceipt")}>
                  <img src={u()} alt={t("review.viewReceipt")} class="max-h-[75dvh] w-full rounded-2xl object-contain" />
                </Sheet>
              </Show>
            )}
          </Show>
        </Loading>
        <dl class="flex min-w-0 flex-1 flex-col gap-2 text-[15px]">
          <Show when={props.item.tid}>
            <div>
              <dt class="text-sm text-ink-3">TID</dt>
              <dd class="flex items-center gap-2">
                <span class="num truncate font-semibold" dir="ltr">{props.item.tid}</span>
                <button type="button" aria-label={t("common.copy")} class="grid h-9 w-9 place-items-center rounded-full bg-surface-2"
                  onClick={() => copy(props.item.tid!)}>{copied() ? <IconCheck size={14} /> : <IconCopy />}</button>
              </dd>
            </div>
          </Show>
          <Show when={props.item.paid_by_name}><dd class="text-ink-2">{t("review.paidBy", { name: props.item.paid_by_name! })}</dd></Show>
          <Show when={props.item.submitted_by_name !== props.item.member_name}><dd class="text-ink-2">{t("review.enteredBy", { name: props.item.submitted_by_name })}</dd></Show>
          <Show when={props.item.status === "disputed"}><dd><Badge tone="late">{t("c.disputed")}</Badge></dd></Show>
        </dl>
      </div>

      <Show when={error()}><ErrorNote message={error()} /></Show>
      <Show when={props.item.can_decide} fallback={<p class="text-sm text-ink-3">{t("review.own")}</p>}>
        <div class="grid grid-cols-[auto_1fr] gap-3">
          <Button variant="soft" onClick={props.onReject} disabled={busy()}>{t("review.reject")}</Button>
          <Button onClick={confirm} disabled={busy()}>{busy() ? "…" : t("review.confirm")}</Button>
        </div>
      </Show>
    </Card>
  );
}

function RejectSheet(props: { item: ReviewItem | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const quick = () => [t("review.r1"), t("review.r2"), t("review.r3")];

  const reject = async () => {
    const item = props.item;
    if (!item || reason().trim().length < 3) return;
    setBusy(true);
    setError("");
    try { await rejectSubmission(item.id, reason().trim()); setReason(""); setBusy(false); props.onDone(); }
    catch (e) { setError(describeError(e)); setBusy(false); }
  };

  return (
    <Sheet open={!!props.item} onClose={props.onClose} label={t("review.rejectTitle")}>
      <div class="flex flex-col gap-4 px-2">
        <div>
          <h2 class="text-2xl font-bold">{t("review.rejectTitle")}</h2>
          <p class="mt-1 text-ink-2">
            {props.item ? `${money(props.item.amount_paisa)}. ` : ""}{t("review.rejectBody", { name: props.item?.member_name ?? "" })}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <For each={quick()}>{q => (
            <button type="button" onClick={() => { tick(); setReason(q); }}
              class={["h-10 rounded-full px-4 text-[15px] font-medium", reason() === q ? "bg-cta text-cta-ink" : "bg-surface-2"]}>{q}</button>
          )}</For>
        </div>
        <label class="flex flex-col gap-2">
          <span class="text-[15px] font-medium text-ink-2">{t("review.reason")}</span>
          <input class={inputClass} value={reason()} onInput={e => setReason(e.currentTarget.value)} maxlength="500" />
        </label>
        <Show when={error()}><ErrorNote message={error()} /></Show>
        <div class="grid grid-cols-2 gap-3">
          <Button variant="soft" onClick={props.onClose}>{t("common.cancel")}</Button>
          <Button variant="danger" disabled={busy() || reason().trim().length < 3} onClick={reject}>{t("review.reject")}</Button>
        </div>
      </div>
    </Sheet>
  );
}
