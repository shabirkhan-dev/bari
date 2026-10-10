import { createMemo, createSignal, Errored, For, Loading, Match, onSettled, Show, Switch } from "solid-js";
import { attachReceipt, getDashboard, memberPayable, myPayable, submitPayment, type Payable } from "../lib/api";
import { describeError } from "../lib/errors";
import { navigate } from "../lib/router";
import { prepareReceipt, readReceipt, ReceiptError, type PreparedReceipt } from "../lib/receipt";
import { takeShared } from "../lib/shared";
import { parseJazzCashReceipt, type ParsedReceipt } from "../domain/receipt";
import { todayInPKT } from "../domain/dates";
import { dateShort, lang, money, t, weekday } from "../i18n";
import { Badge, Button, Card, ErrorNote, Field, inputClass, Money, Screen, Skeleton, tick } from "../ui/kit";
import { IconCheck, IconPlus } from "../ui/icons";

/** `memberId` set: an organizer recording a payment on that member's behalf. */
export function Pay(props: { id: string; memberId?: string }) {
  const dash = createMemo(() => getDashboard(props.id));
  const payable = createMemo(() => (props.memberId ? memberPayable(props.memberId) : myPayable(props.id)));
  const forName = () => (props.memberId ? dash().members.find(m => m.member_id === props.memberId)?.name : undefined);
  return (
    <Errored fallback={err => <Screen backTo={`/c/${props.id}`}><ErrorNote message={describeError(err())} /></Screen>}>
      <Loading fallback={<Screen backTo={`/c/${props.id}`} title={t("pay.title")}><Skeleton lines={3} /></Screen>}>
        <PayForm committeeId={props.id} memberId={props.memberId ?? dash().me.member_id} forName={forName()} items={payable()} />
      </Loading>
    </Errored>
  );
}

type OcrState = "idle" | "reading" | "done" | "failed";

function PayForm(props: { committeeId: string; memberId: string; forName?: string; items: Payable[] }) {
  const today = todayInPKT();
  const requestId = crypto.randomUUID(); // same id on retry → no duplicate payment
  const [picked, setPicked] = createSignal<Record<string, boolean> | null>(null);
  const [receipt, setReceipt] = createSignal<PreparedReceipt | null>(null);
  const [ocr, setOcr] = createSignal<OcrState>("idle");
  const [parsed, setParsed] = createSignal<ParsedReceipt | null>(null);
  const [tid, setTid] = createSignal("");
  const [someoneElse, setSomeoneElse] = createSignal(false);
  const [paidBy, setPaidBy] = createSignal("");
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [sent, setSent] = createSignal<{ amount: number; warning: string | null } | null>(null);
  let fileInput: HTMLInputElement | undefined;

  const isPicked = (p: Payable) => picked()?.[p.id] ?? p.due_date <= today;
  const selection = () => props.items.filter(isPicked);
  const total = () => selection().reduce((s, p) => s + p.amount_paisa, 0);
  const toggle = (p: Payable) => {
    tick();
    const base = Object.fromEntries(props.items.map(i => [i.id, isPicked(i)]));
    setPicked({ ...base, [p.id]: !isPicked(p) });
  };

  const useFile = async (file: Blob) => {
    setError("");
    try {
      const r = await prepareReceipt(file);
      setReceipt(r);
      setParsed(null);
      if (r.mime === "application/pdf") return setOcr("idle");
      setOcr("reading");
      try {
        const p = await readReceipt(r.blob);
        setParsed(p);
        if (p.tid && !tid()) setTid(p.tid);
        setOcr(p.tid || p.amountPaisa ? "done" : "failed");
      } catch {
        setOcr("failed");
      }
    } catch (e) {
      setError(e instanceof ReceiptError && e.message === "size" ? t("pay.errSize") : t("pay.errType"));
    }
  };

  // A receipt shared from JazzCash arrives here ready to use.
  onSettled(() => {
    const shared = takeShared();
    if (shared?.file) void useFile(shared.file);
    else if (shared?.text) {
      const p = parseJazzCashReceipt(shared.text);
      setParsed(p);
      if (p.tid) setTid(p.tid);
    }
  });

  const submit = async () => {
    if (selection().length === 0) return setError(t("pay.errNone"));
    setBusy(true);
    setError("");
    try {
      const id = await submitPayment({
        memberId: props.memberId,
        obligationIds: selection().map(p => p.id),
        amountPaisa: total(),
        tid: tid().replace(/\D/g, "") || null,
        transferredAt: parsed()?.occurredAt ?? null,
        paidByName: someoneElse() ? paidBy().trim() || null : null,
        requestId
      });
      let warning: string | null = null;
      const r = receipt();
      if (r) {
        try { await attachReceipt(props.committeeId, id, r); }
        catch (e) { warning = t("pay.errUpload", { error: describeError(e) }); }
      }
      tick();
      setSent({ amount: total(), warning });
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  const back = `/c/${props.committeeId}`;
  return (
    <Show when={!sent()} fallback={
      <Screen backTo={back}>
        <section class="flex flex-1 flex-col items-center justify-center gap-5 py-10 text-center">
          <span class="grid h-24 w-24 place-items-center rounded-full bg-warn-soft text-warn"><IconCheck size={44} /></span>
          <h1 class="text-[28px] font-bold">{t("pay.sentTitle")}</h1>
          <p class="max-w-[19rem] text-[17px] text-ink-2">{t("pay.sentBody", { amount: money(sent()!.amount) })}</p>
          <Show when={sent()!.warning}><ErrorNote message={sent()!.warning!} /></Show>
          <Button class="mt-4 w-full" onClick={() => navigate(back, { replace: true, direction: "back" })}>{t("pay.done")}</Button>
        </section>
      </Screen>
    }>
      <Screen backTo={back} title={props.forName ? t("payOn.title", { name: props.forName }) : t("pay.title")} bottom={
        <Button class="w-full" disabled={busy() || selection().length === 0} onClick={submit}>
          {busy() ? t("pay.sending") : t("pay.send")}
        </Button>
      }>
        <Show when={props.items.length > 0} fallback={<Card><p class="text-[17px]">{t("pay.nothingDue")}</p></Card>}>
          <section class="flex flex-col items-center gap-2 py-4 text-center" aria-live="polite">
            <p class="text-[15px] font-medium text-ink-2">{t("pay.total")}</p>
            <Money paisa={total()} size="hero" />
            <Show when={selection().length > 0}>
              <p class="num text-[15px] text-ink-3">{t("pay.count", { n: selection().length, amount: money(props.items[0]!.amount_paisa) })}</p>
            </Show>
          </section>

          <Card class="flex flex-col gap-4">
            <div>
              <h2 class="text-lg font-semibold">{t("pay.which")}</h2>
              <p class="text-sm text-ink-3">{t("pay.ahead")}</p>
            </div>
            <div class="grid grid-cols-4 gap-2">
              <For each={props.items}>{p => {
                const late = () => p.due_date < today;
                const isToday = () => p.due_date === today;
                return (
                  <button type="button" aria-pressed={isPicked(p) ? "true" : "false"} onClick={() => toggle(p)}
                    class={["flex h-16 flex-col items-center justify-center rounded-2xl border-2 text-center transition-colors",
                      isPicked(p) ? "border-cta bg-cta text-cta-ink" : late() ? "border-late/50 bg-surface text-ink" : isToday() ? "border-ink/40 bg-surface text-ink" : "border-transparent bg-surface-2 text-ink-2"]}>
                    <span class="text-[11px] font-medium opacity-75">{late() ? t("pay.missed") : isToday() ? t("pay.today") : weekday(p.due_date)}</span>
                    <span class="num text-[15px] font-semibold">{dateShort(p.due_date)}</span>
                  </button>
                );
              }}</For>
            </div>
          </Card>

          <Card class="flex flex-col gap-4">
            <h2 class="text-lg font-semibold">{t("pay.receipt")}</h2>
            <input ref={el => (fileInput = el)} type="file" accept="image/*,application/pdf" class="sr-only"
              onChange={e => { const f = e.currentTarget.files?.[0]; if (f) void useFile(f); e.currentTarget.value = ""; }} />
            <Show when={receipt()} fallback={
              <button type="button" onClick={() => { tick(); fileInput?.click(); }}
                class="flex items-center gap-4 rounded-[20px] border-2 border-dashed border-line p-4 text-start active:bg-surface-2">
                <span class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface-2"><IconPlus /></span>
                <span>
                  <span class="block text-[17px] font-semibold">{t("pay.addReceipt")}</span>
                  <span class="block text-sm text-ink-2">{t("pay.addReceiptSub")}</span>
                </span>
              </button>
            }>
              {r => (
                <div class="flex items-center gap-4">
                  <Show when={r().previewUrl} fallback={<span class="grid h-24 w-20 place-items-center rounded-xl bg-surface-2 text-sm font-semibold">PDF</span>}>
                    <img src={r().previewUrl!} alt="" class="h-24 w-20 rounded-xl object-cover object-top" />
                  </Show>
                  <div class="min-w-0 flex-1">
                    <Switch>
                      <Match when={ocr() === "reading"}><p class="text-[15px] text-ink-2" aria-live="polite">{t("pay.reading")}</p></Match>
                      <Match when={ocr() === "failed"}><p class="text-[15px] text-warn">{t("pay.readFail")}</p></Match>
                      <Match when={ocr() === "done" && parsed()?.amountPaisa !== undefined && parsed()!.amountPaisa !== total()}>
                        <p class="text-[15px] text-late">{t("pay.mismatch", { receipt: money(parsed()!.amountPaisa!), selected: money(total()) })}</p>
                      </Match>
                      <Match when={ocr() === "done" && parsed()?.amountPaisa === total()}><Badge tone="paid">{t("pay.matches")}</Badge></Match>
                    </Switch>
                    <Show when={ocr() === "done" && parsed() && !parsed()!.saysSuccessful}><p class="mt-1 text-sm text-warn">{t("pay.notSuccessful")}</p></Show>
                  </div>
                  <Button variant="soft" class="h-11 px-4 text-[15px]" onClick={() => fileInput?.click()}>{t("pay.change")}</Button>
                </div>
              )}
            </Show>
            <Field label={t("pay.tid")} hint={t("pay.tidHint")}>
              <input class={[inputClass, "num tracking-wider"]} inputmode="numeric" dir="ltr" placeholder="726755086850"
                value={tid()} onInput={e => setTid(e.currentTarget.value.replace(/[^\d]/g, "").slice(0, 20))} />
            </Field>
          </Card>

          <Card class="flex flex-col gap-4">
            <label class="flex min-h-11 items-center justify-between gap-4">
              <span class="text-[17px] font-medium">{t("pay.someoneElse")}</span>
              <input type="checkbox" class="h-6 w-6 accent-[var(--brand)]" checked={someoneElse()} onChange={e => setSomeoneElse(e.currentTarget.checked)} />
            </label>
            <Show when={someoneElse()}>
              <Field label={t("pay.paidBy")}>
                <input class={inputClass} placeholder={t("pay.paidByPh")} value={paidBy()} onInput={e => setPaidBy(e.currentTarget.value)} maxlength="80" />
              </Field>
            </Show>
          </Card>

          <Show when={error()}><ErrorNote message={error()} /></Show>
          <p class={["px-2 text-center text-sm text-ink-3", { "leading-loose": lang() === "ur" }]}>{t("pay.note")}</p>
        </Show>
      </Screen>
    </Show>
  );
}
