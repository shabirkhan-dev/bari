import { createMemo, createSignal, Errored, For, Loading, Match, refresh, Show, Switch } from "solid-js";
import {
  confirmPayout, drawToss, getDashboard, payoutRound, recordPayout, tossEligibility,
  type Dashboard, type DashboardRound, type PayoutRound
} from "../lib/api";
import { describeError } from "../lib/errors";
import { freshness } from "../lib/live";
import { todayInPKT } from "../domain/dates";
import { rupees } from "../domain/money";
import { pickWinner } from "../domain/toss";
import { dateDay, dateLong, money, t } from "../i18n";
import { ActionRow, Avatar, Badge, Button, Card, ErrorNote, Field, inputClass, Money, Screen, Sheet, Skeleton, tick } from "../ui/kit";
import { IconCheck, IconCircle, IconUser } from "../ui/icons";

export function Round(props: { id: string; n: number }) {
  const dash = createMemo(() => { freshness(); return getDashboard(props.id); });
  const payout = createMemo(() => { freshness(); return payoutRound(props.id, props.n); });
  const reload = () => { refresh(dash); refresh(payout); };
  return (
    <Screen backTo={`/c/${props.id}`} title={t("round.title", { n: props.n })}>
      <Errored fallback={err => <ErrorNote message={describeError(err())} />}>
        <Loading fallback={<Skeleton lines={3} />}>
          <Show when={dash().rounds.find(r => r.round === props.n)} fallback={<ErrorNote message="Round not found" />}>
            {r => (
              <>
                <section class="flex flex-col items-center gap-1 py-4 text-center">
                  <Money paisa={dash().committee.payout_paisa} size="xl" />
                  <p class="text-[15px] text-ink-2">{t("c.tossOn", { date: dateDay(r().toss_date) })}</p>
                  <p class="text-sm text-ink-3">{t("c.confirmed")}: {money(r().verified_paisa)}</p>
                </section>
                <Show when={payout()} fallback={<BeforeDraw d={dash()} r={r()} onDone={reload} />}>
                  {p => <AfterDraw d={dash()} r={r()} p={p()} onDone={reload} />}
                </Show>
              </>
            )}
          </Show>
        </Loading>
      </Errored>
    </Screen>
  );
}

const isOrganizer = (d: Dashboard) => d.me.role === "owner" || d.me.role === "organizer";
const nameOf = (d: Dashboard, memberId: string | null | undefined) => d.members.find(m => m.member_id === memberId)?.name ?? "—";

/* ───────────── Before the draw ───────────── */

function BeforeDraw(props: { d: Dashboard; r: DashboardRound; onDone: () => void }) {
  const elig = createMemo(() => { freshness(); return tossEligibility(props.d.committee.id, props.r.round); });
  const [sheet, setSheet] = createSignal<"app" | "manual" | null>(null);
  const [winner, setWinner] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const open = () => todayInPKT() >= props.r.toss_date;

  const draw = async (method: "app" | "manual") => {
    setBusy(true);
    setError("");
    try {
      await drawToss(props.d.committee.id, props.r.round, method, method === "manual" ? winner() ?? undefined : undefined);
      tick();
      setSheet(null);
      props.onDone();
    } catch (e) { setError(describeError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Loading fallback={<Skeleton lines={2} />}>
      <Card class="p-2">
        <h2 class="px-3 pt-3 text-lg font-semibold">{t("round.eligible")}</h2>
        <ul>
          <For each={elig().filter(e => e.eligible)}>{e => (
            <li class="flex items-center gap-3 rounded-[20px] p-3"><Avatar name={nameOf(props.d, e.member_id)} /><span class="text-[17px] font-medium">{nameOf(props.d, e.member_id)}</span></li>
          )}</For>
        </ul>
      </Card>
      <Show when={elig().some(e => !e.eligible)}>
        <Card class="p-2">
          <h2 class="px-3 pt-3 text-lg font-semibold">{t("round.excluded")}</h2>
          <ul>
            <For each={elig().filter(e => !e.eligible)}>{e => (
              <li class="flex items-center gap-3 rounded-[20px] p-3">
                <Avatar name={nameOf(props.d, e.member_id)} />
                <span class="min-w-0 flex-1 text-[17px] font-medium">{nameOf(props.d, e.member_id)}</span>
                <Show when={e.reason === "arrears"} fallback={<Badge tone="turn">{t("round.reasonPaid")}</Badge>}>
                  <Badge tone="late">{t("round.reasonArrears", { amount: money(e.arrears_paisa) })}</Badge>
                </Show>
              </li>
            )}</For>
          </ul>
        </Card>
      </Show>

      <Show when={isOrganizer(props.d)}>
        <Show when={open()} fallback={<p class="px-1 text-center text-ink-2">{t("round.notYet", { date: dateLong(props.r.toss_date) })}</p>}>
          <Card class="p-2">
            <ActionRow icon={<IconCircle />} title={t("round.drawApp")} sub={t("round.drawAppSub")} onClick={() => setSheet("app")} />
            <ActionRow icon={<IconUser />} title={t("round.drawManual")} sub={t("round.drawManualSub")} onClick={() => setSheet("manual")} />
          </Card>
        </Show>
      </Show>
      <Show when={error() && !sheet()}><ErrorNote message={error()} /></Show>

      <Sheet open={sheet() === "app"} onClose={() => setSheet(null)} label={t("round.drawConfirm", { n: props.r.round })}>
        <div class="flex flex-col gap-5 px-2">
          <div>
            <h2 class="text-2xl font-bold">{t("round.drawConfirm", { n: props.r.round })}</h2>
            <p class="mt-2 text-ink-2">{t("round.drawWarn")}</p>
          </div>
          <Show when={error()}><ErrorNote message={error()} /></Show>
          <div class="grid grid-cols-2 gap-3">
            <Button variant="soft" onClick={() => setSheet(null)}>{t("common.cancel")}</Button>
            <Button disabled={busy()} onClick={() => draw("app")}>{busy() ? t("round.drawing") : t("round.draw")}</Button>
          </div>
        </div>
      </Sheet>

      <Sheet open={sheet() === "manual"} onClose={() => setSheet(null)} label={t("round.pickWinner")}>
        <div class="flex flex-col gap-4 px-2">
          <h2 class="text-2xl font-bold">{t("round.pickWinner")}</h2>
          <div role="radiogroup" aria-label={t("round.pickWinner")} class="flex flex-col gap-1">
            <For each={elig().filter(e => e.eligible)}>{e => (
              <button type="button" role="radio" aria-checked={winner() === e.member_id ? "true" : "false"}
                onClick={() => { tick(); setWinner(e.member_id); }}
                class={["flex items-center gap-3 rounded-[20px] p-3 text-start", winner() === e.member_id ? "bg-cta text-cta-ink" : "bg-surface-2"]}>
                <Avatar name={nameOf(props.d, e.member_id)} />
                <span class="text-[17px] font-medium">{nameOf(props.d, e.member_id)}</span>
              </button>
            )}</For>
          </div>
          <Show when={error()}><ErrorNote message={error()} /></Show>
          <Button disabled={busy() || !winner()} onClick={() => draw("manual")}>{t("round.saveWinner")}</Button>
        </div>
      </Sheet>
    </Loading>
  );
}

/* ───────────── After the draw ───────────── */

function AfterDraw(props: { d: Dashboard; r: DashboardRound; p: PayoutRound; onDone: () => void }) {
  const winnerName = () => nameOf(props.d, props.p.winner_member_id);
  const iWon = () => props.p.winner_member_id === props.d.me.member_id;
  const seat = () => {
    if (props.p.random_value === null) return null;
    const sorted = [...props.p.eligible_member_ids].sort();
    const w = pickWinner(sorted, props.p.random_value);
    return w === props.p.winner_member_id ? sorted.indexOf(w) + 1 : null;
  };

  return (
    <>
      <section class="flex flex-col items-center gap-3 rounded-[28px] bg-surface p-6 text-center">
        <Avatar name={winnerName()} size={84} ring="var(--turn)" />
        <h2 class="text-[26px] font-bold leading-tight">{iWon() ? t("round.youWin") : t("round.winner", { name: winnerName() })}</h2>
        <p class="text-sm text-ink-3">
          {props.p.draw_method === "app" && seat()
            ? t("round.howDrawn", { n: props.p.eligible_member_ids.length, value: props.p.random_value!, seat: seat()! })
            : t("round.howManual")}
        </p>
      </section>

      <Switch>
        <Match when={props.p.status === "drawn" && isOrganizer(props.d)}>
          <PayoutForm d={props.d} r={props.r} p={props.p} onDone={props.onDone} />
        </Match>
        <Match when={props.p.status === "paid" && iWon()}>
          <ConfirmReceipt p={props.p} onDone={props.onDone} />
        </Match>
        <Match when={props.p.payout}>
          {rec => (
            <Card class="flex flex-col gap-2">
              <p class="text-[17px] font-semibold">{t("round.sentTo", { amount: money(rec().amount_paisa), name: winnerName(), date: dateLong(rec().paid_at.slice(0, 10)) })}</p>
              <Show when={rec().tid}><p class="num text-sm text-ink-2" dir="ltr">TID {rec().tid}</p></Show>
              <Switch>
                <Match when={props.p.status === "confirmed"}><Badge tone="paid">{t("round.received", { name: winnerName() })}</Badge></Match>
                <Match when={props.p.status === "disputed"}><p class="text-late">{t("round.disputed", { name: winnerName(), reason: rec().dispute_reason ?? "" })}</p></Match>
                <Match when={props.p.status === "paid"}><p class="text-ink-2">{t("round.waitingConfirm", { name: winnerName() })}</p></Match>
              </Switch>
            </Card>
          )}
        </Match>
      </Switch>
    </>
  );
}

function PayoutForm(props: { d: Dashboard; r: DashboardRound; p: PayoutRound; onDone: () => void }) {
  const [amount, setAmount] = createSignal(String(props.d.committee.payout_paisa / 100));
  const [tid, setTid] = createSignal("");
  const [date, setDate] = createSignal(todayInPKT());
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const short = () => props.r.verified_paisa < props.d.committee.payout_paisa;

  const save = async (e: SubmitEvent) => {
    e.preventDefault();
    const n = Number(amount());
    if (!Number.isInteger(n) || n <= 0) return setError(t("create.errAmount"));
    setBusy(true);
    setError("");
    try {
      await recordPayout(props.p.id, rupees(n), tid() || null, `${date()}T12:00:00+05:00`);
      tick();
      props.onDone();
    } catch (err) { setError(describeError(err)); setBusy(false); }
  };

  return (
    <form onSubmit={save} novalidate>
      <Card class="flex flex-col gap-5">
        <h2 class="text-lg font-semibold">{t("round.recordPayout")}</h2>
        <Show when={short()}>
          <p class="rounded-2xl bg-warn-soft px-3 py-2 text-sm text-warn">{t("round.shortWarn", { verified: money(props.r.verified_paisa) })}</p>
        </Show>
        <Field label={t("round.payoutAmount")}>
          <input class={[inputClass, "num text-2xl font-semibold"]} inputmode="numeric" dir="ltr" value={amount()}
            onInput={e => setAmount(e.currentTarget.value.replace(/\D/g, "").slice(0, 9))} />
        </Field>
        <Field label={t("round.payoutTid")}>
          <input class={[inputClass, "num"]} inputmode="numeric" dir="ltr" value={tid()} onInput={e => setTid(e.currentTarget.value.replace(/\D/g, "").slice(0, 20))} />
        </Field>
        <Field label={t("round.paidOn")}>
          <input class={inputClass} type="date" max={todayInPKT()} value={date()} onInput={e => setDate(e.currentTarget.value)} />
        </Field>
        <Show when={error()}><ErrorNote message={error()} /></Show>
        <Button type="submit" disabled={busy()}>{busy() ? t("common.saving") : t("round.savePayout")}</Button>
      </Card>
    </form>
  );
}

function ConfirmReceipt(props: { p: PayoutRound; onDone: () => void }) {
  const [problem, setProblem] = createSignal(false);
  const [reason, setReason] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const amountText = () => money(props.p.payout?.amount_paisa ?? 0);

  const answer = async (received: boolean) => {
    setBusy(true);
    setError("");
    try { await confirmPayout(props.p.id, received, received ? undefined : reason().trim()); tick(); props.onDone(); }
    catch (e) { setError(describeError(e)); setBusy(false); }
  };

  return (
    <Card class="flex flex-col gap-4">
      <p class="text-xl font-semibold">{t("round.didReceive", { amount: amountText() })}</p>
      <Show when={error()}><ErrorNote message={error()} /></Show>
      <Show when={problem()} fallback={
        <div class="grid grid-cols-[auto_1fr] gap-3">
          <Button variant="soft" onClick={() => setProblem(true)}>{t("round.problem")}</Button>
          <Button disabled={busy()} onClick={() => answer(true)}><IconCheck size={18} />{t("round.yesReceived")}</Button>
        </div>
      }>
        <Field label={t("round.problemReason")}>
          <input class={inputClass} placeholder={t("round.problemPh")} value={reason()} maxlength="500" onInput={e => setReason(e.currentTarget.value)} />
        </Field>
        <Button variant="danger" disabled={busy() || reason().trim().length < 3} onClick={() => answer(false)}>{t("round.problem")}</Button>
      </Show>
    </Card>
  );
}

