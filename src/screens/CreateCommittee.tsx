import { createMemo, createSignal, Show, untrack } from "solid-js";
import { createCommittee } from "../lib/api";
import { navigate } from "../lib/router";
import { describeError } from "../lib/errors";
import { addDays, todayInPKT } from "../domain/dates";
import { formatPKR, rupees } from "../domain/money";
import { buildRounds, CommitteeConfig, type Frequency } from "../domain/schedule";
import { contributionLabel, daysBetween, longDate } from "../domain/display";
import { formatPkMobile, normalizePkMobile } from "../domain/phone";
import { Button, Card, ErrorNote, Field, inputClass, Screen, SectionTitle, Segmented, Stepper } from "../ui/kit";
import type { Profile } from "../lib/auth";

const DEFAULT_PERIODS: Record<Frequency, number> = { daily: 30, weekly: 4, monthly: 1, custom: 10 };
const PERIOD_WORD: Record<Frequency, string> = { daily: "days", weekly: "weeks", monthly: "months", custom: "payments" };

export function CreateCommittee(props: { me: Profile }) {
  const [name, setName] = createSignal("");
  const [members, setMembers] = createSignal(5);
  const [amount, setAmount] = createSignal("200");
  const [frequency, setFrequency] = createSignal<Frequency>("daily");
  const [interval, setIntervalDays] = createSignal(3);
  const [periods, setPeriods] = createSignal(30);
  const [start, setStart] = createSignal(addDays(todayInPKT(), 1));
  const [title, setTitle] = createSignal(untrack(() => props.me.display_name));
  const [account, setAccount] = createSignal(untrack(() => props.me.phone ?? ""));
  const [instructions, setInstructions] = createSignal("");
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const amountPaisa = createMemo(() => {
    const n = Number(amount().replace(/[,\s]/g, ""));
    return Number.isInteger(n) && n > 0 && n <= 1_000_000 ? rupees(n) : 0;
  });

  const config = createMemo(() =>
    CommitteeConfig.safeParse({
      memberCount: members(),
      contributionPaisa: amountPaisa(),
      frequency: frequency(),
      intervalDays: frequency() === "custom" ? interval() : undefined,
      periodsPerRound: periods(),
      startDate: start(),
      payoutPaisa: members() * periods() * amountPaisa()
    })
  );

  const summary = createMemo(() => {
    const c = config();
    if (!c.success) return null;
    const rounds = buildRounds(c.data);
    const last = rounds[rounds.length - 1]!;
    return {
      pot: c.data.payoutPaisa,
      perMember: rounds[0]!.perMemberPaisa,
      firstToss: rounds[0]!.tossDate,
      end: last.tossDate,
      days: daysBetween(c.data.startDate, last.tossDate) + 1
    };
  });

  const pickFrequency = (f: Frequency) => {
    setFrequency(f);
    setPeriods(DEFAULT_PERIODS[f]);
  };

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    const c = config();
    const acct = normalizePkMobile(account());
    if (name().trim().length < 2) return setError("Give the committee a name.");
    if (!amountPaisa()) return setError("Enter the amount each member pays, in whole rupees.");
    if (!c.success) return setError(c.error.issues[0]?.message ?? "Check the details.");
    if (start() < todayInPKT()) return setError("The start date can't be in the past.");
    if (title().trim().length < 2) return setError("Enter the name on the JazzCash account.");
    if (!acct) return setError("Enter the JazzCash number members send money to, like 0300 1234567.");
    setSaving(true);
    setError("");
    try {
      const id = await createCommittee({
        name: name().trim(),
        description: null,
        memberCount: c.data.memberCount,
        contributionPaisa: c.data.contributionPaisa,
        frequency: c.data.frequency,
        intervalDays: c.data.intervalDays ?? null,
        periodsPerRound: c.data.periodsPerRound,
        startDate: c.data.startDate,
        payoutPaisa: c.data.payoutPaisa,
        accountTitle: title().trim(),
        accountNumber: acct,
        instructions: instructions().trim() || null
      });
      navigate(`/c/${id}`, { replace: true });
    } catch (err) {
      setError(describeError(err));
      setSaving(false);
    }
  };

  return (
    <Screen title="New committee" backTo="/">
      <form class="flex flex-col gap-4" onSubmit={submit} novalidate>
        <Card class="flex flex-col gap-5">
          <Field label="Committee name">
            <input class={inputClass} placeholder="Family committee" value={name()} onInput={e => setName(e.currentTarget.value)} maxlength="80" />
          </Field>
          <Field label="Members">
            <Stepper label="members" value={members()} min={2} max={20} onChange={setMembers} />
          </Field>
        </Card>

        <SectionTitle>Payments</SectionTitle>
        <Card class="flex flex-col gap-5">
          <Field label="Each member pays">
            <div class="relative">
              <span class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-bari-muted">Rs</span>
              <input class={[inputClass, "pl-12 tabular-nums"]} inputmode="numeric" value={amount()}
                onInput={e => setAmount(e.currentTarget.value.replace(/[^\d]/g, ""))} />
            </div>
          </Field>
          <Field label="How often">
            <Segmented label="How often" value={frequency()} onChange={pickFrequency} options={[
              { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" }, { value: "custom", label: "Custom" }
            ]} />
          </Field>
          <Show when={frequency() === "custom"}>
            <Field label="Every how many days">
              <Stepper label="days between payments" value={interval()} min={2} max={60} onChange={setIntervalDays} />
            </Field>
          </Show>
          <Field label={`Payments before each payout`} hint={`${periods()} ${PERIOD_WORD[frequency()]} per round, then one member gets the pot.`}>
            <Stepper label="payments per round" value={periods()} min={1} max={frequency() === "daily" ? 120 : 52} onChange={setPeriods} />
          </Field>
          <Field label="First payment date">
            <input class={inputClass} type="date" min={todayInPKT()} value={start()} onInput={e => setStart(e.currentTarget.value)} />
          </Field>
        </Card>

        <Show when={summary()}>
          {s => (
            <section aria-label="Summary" class="rounded-3xl bg-bari-emerald p-5 text-white">
              <p class="text-sm text-white/80">Each payout</p>
              <p class="text-4xl font-bold tabular-nums">{formatPKR(s().pot)}</p>
              <dl class="mt-4 grid grid-cols-2 gap-y-3 text-sm">
                <dt class="text-white/80">Each member pays</dt>
                <dd class="text-right font-semibold">{contributionLabel(amountPaisa(), frequency(), interval())}</dd>
                <dt class="text-white/80">Per member, per round</dt>
                <dd class="text-right font-semibold tabular-nums">{formatPKR(s().perMember)}</dd>
                <dt class="text-white/80">First toss</dt>
                <dd class="text-right font-semibold">{longDate(s().firstToss)}</dd>
                <dt class="text-white/80">Finishes</dt>
                <dd class="text-right font-semibold">{longDate(s().end)} · {s().days} days</dd>
              </dl>
              <p class="mt-4 text-sm text-white/80">{members()} rounds, so everyone gets the pot once and keeps paying until the end.</p>
            </section>
          )}
        </Show>

        <SectionTitle>Where members send money</SectionTitle>
        <Card class="flex flex-col gap-5">
          <Field label="JazzCash number" hint={normalizePkMobile(account()) ? `Members will send to ${formatPkMobile(normalizePkMobile(account())!)}` : "The committee's receiving account."}>
            <input class={[inputClass, "tracking-wide"]} type="tel" inputmode="numeric" placeholder="0300 1234567" value={account()} onInput={e => setAccount(e.currentTarget.value)} />
          </Field>
          <Field label="Name on the account">
            <input class={inputClass} value={title()} onInput={e => setTitle(e.currentTarget.value)} maxlength="80" />
          </Field>
          <Field label="Note for members (optional)">
            <textarea class={[inputClass, "h-24 py-3 text-base"]} placeholder="Send by 9 pm. Write your name in the JazzCash note." value={instructions()} onInput={e => setInstructions(e.currentTarget.value)} maxlength="2000" />
          </Field>
        </Card>

        <Show when={error()}><ErrorNote message={error()} /></Show>
        <Button type="submit" disabled={saving()}>{saving() ? "Creating…" : "Create committee"}</Button>
      </form>
    </Screen>
  );
}
