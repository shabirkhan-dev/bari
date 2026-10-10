import { createMemo, createSignal, Show, untrack } from "solid-js";
import { createCommittee } from "../lib/api";
import { navigate } from "../lib/router";
import { describeError } from "../lib/errors";
import type { Profile } from "../lib/auth";
import { addDays, todayInPKT } from "../domain/dates";
import { rupees } from "../domain/money";
import { buildRounds, CommitteeConfig, type Frequency } from "../domain/schedule";
import { contributionLabel, daysBetween } from "../domain/display";
import { formatPkMobile, normalizePkMobile } from "../domain/phone";
import { amount as fmtAmount, currency, dateLong, lang, money, t } from "../i18n";
import { Button, Card, ErrorNote, Field, inputClass, Screen, Segmented, Stepper } from "../ui/kit";

const DEFAULT_PERIODS: Record<Frequency, number> = { daily: 30, weekly: 4, monthly: 1, custom: 10 };

export function CreateCommittee(props: { me: Profile }) {
  const [name, setName] = createSignal("");
  const [members, setMembers] = createSignal(5);
  const [amount, setAmount] = createSignal("200");
  const [frequency, setFrequency] = createSignal<Frequency>("daily");
  const [gap, setGap] = createSignal(3);
  const [periods, setPeriods] = createSignal(30);
  const [start, setStart] = createSignal(addDays(todayInPKT(), 1));
  const [title, setTitle] = createSignal(untrack(() => props.me.display_name));
  const [account, setAccount] = createSignal(untrack(() => props.me.phone ?? ""));
  const [instructions, setInstructions] = createSignal("");
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const amountPaisa = createMemo(() => {
    const n = Number(amount());
    return Number.isInteger(n) && n > 0 && n <= 1_000_000 ? rupees(n) : 0;
  });

  const config = createMemo(() =>
    CommitteeConfig.safeParse({
      memberCount: members(),
      contributionPaisa: amountPaisa(),
      frequency: frequency(),
      intervalDays: frequency() === "custom" ? gap() : undefined,
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
    return { pot: c.data.payoutPaisa, perMember: rounds[0]!.perMemberPaisa, firstToss: rounds[0]!.tossDate, end: last.tossDate, days: daysBetween(c.data.startDate, last.tossDate) + 1 };
  });

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    const c = config();
    const acct = normalizePkMobile(account());
    if (name().trim().length < 2) return setError(t("create.errName"));
    if (!amountPaisa()) return setError(t("create.errAmount"));
    if (!c.success) return setError(t("create.errCheck"));
    if (start() < todayInPKT()) return setError(t("create.errPast"));
    if (!acct) return setError(t("create.errAcct"));
    if (title().trim().length < 2) return setError(t("create.errTitle"));
    setSaving(true);
    setError("");
    try {
      const id = await createCommittee({
        name: name().trim(), description: null, memberCount: c.data.memberCount,
        contributionPaisa: c.data.contributionPaisa, frequency: c.data.frequency,
        intervalDays: c.data.intervalDays ?? null, periodsPerRound: c.data.periodsPerRound,
        startDate: c.data.startDate, payoutPaisa: c.data.payoutPaisa,
        accountTitle: title().trim(), accountNumber: acct, instructions: instructions().trim() || null
      });
      navigate(`/c/${id}`, { replace: true });
    } catch (err) {
      setError(describeError(err));
      setSaving(false);
    }
  };

  return (
    <Screen title={t("create.title")} backTo="/">
      <form class="flex flex-col gap-4" onSubmit={submit} novalidate>
        <Card class="flex flex-col gap-6">
          <Field label={t("create.name")}>
            <input class={inputClass} placeholder={t("create.namePh")} value={name()} onInput={e => setName(e.currentTarget.value)} maxlength="80" />
          </Field>
          <Field label={t("create.members")}>
            <Stepper label={t("create.members")} value={members()} min={2} max={20} onChange={setMembers} />
          </Field>
        </Card>

        <Card class="flex flex-col gap-6">
          <Field label={t("create.pays")}>
            <div class="relative" dir="ltr">
              <span class={["pointer-events-none absolute top-1/2 -translate-y-1/2 text-lg font-medium text-ink-3", lang() === "ur" ? "right-4" : "left-4"]}>{currency()}</span>
              <input class={[inputClass, "num text-2xl font-semibold", lang() === "ur" ? "pr-20 text-right" : "pl-12"]} inputmode="numeric" value={amount()}
                onInput={e => setAmount(e.currentTarget.value.replace(/[^\d]/g, "").slice(0, 7))} />
            </div>
          </Field>
          <Field label={t("create.often")}>
            <Segmented label={t("create.often")} value={frequency()} onChange={f => { setFrequency(f); setPeriods(DEFAULT_PERIODS[f]); }} options={[
              { value: "daily", label: t("create.daily") }, { value: "weekly", label: t("create.weekly") },
              { value: "monthly", label: t("create.monthly") }, { value: "custom", label: t("create.custom") }
            ]} />
          </Field>
          <Show when={frequency() === "custom"}>
            <Field label={t("create.everyDays")}>
              <Stepper label={t("create.everyDays")} value={gap()} min={2} max={60} onChange={setGap} />
            </Field>
          </Show>
          <Field label={t("create.periods")} hint={t("create.periodsHint", { n: periods() })}>
            <Stepper label={t("create.periods")} value={periods()} min={1} max={frequency() === "daily" ? 120 : 52} onChange={setPeriods} />
          </Field>
          <Field label={t("create.first")}>
            <input class={inputClass} type="date" min={todayInPKT()} value={start()} onInput={e => setStart(e.currentTarget.value)} />
          </Field>
        </Card>

        <Show when={summary()}>
          {s => (
            <section aria-label={t("create.payout")} class="rounded-[28px] bg-cta p-6 text-cta-ink">
              <p class="text-[15px] opacity-70">{t("create.payout")}</p>
              <p class="mt-1 flex items-baseline gap-2" dir="ltr">
                <Show when={lang() !== "ur"}><span class="text-xl opacity-60">{currency()}</span></Show>
                <span class="num text-[48px] font-bold leading-none">{fmtAmount(s().pot)}</span>
                <Show when={lang() === "ur"}><span class="text-xl opacity-60">{currency()}</span></Show>
              </p>
              <dl class="mt-6 grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 text-[15px]">
                <dt class="opacity-70">{t("create.pays")}</dt>
                <dd class="text-end font-semibold">{contributionLabel(amountPaisa(), frequency(), gap())}</dd>
                <dt class="opacity-70">{t("create.perRound")}</dt>
                <dd class="text-end font-semibold">{money(s().perMember)}</dd>
                <dt class="opacity-70">{t("create.firstToss")}</dt>
                <dd class="text-end font-semibold">{dateLong(s().firstToss)}</dd>
                <dt class="opacity-70">{t("create.finishes")}</dt>
                <dd class="text-end font-semibold">{t("create.finishesOn", { date: dateLong(s().end), n: s().days })}</dd>
              </dl>
              <p class="mt-5 text-sm opacity-70">{t("create.roundsNote", { n: members() })}</p>
            </section>
          )}
        </Show>

        <Card class="flex flex-col gap-6" label={t("create.sendTo")}>
          <h2 class="text-lg font-semibold">{t("create.sendTo")}</h2>
          <Field label={t("create.acct")}
            hint={normalizePkMobile(account()) ? t("create.acctWill", { phone: formatPkMobile(normalizePkMobile(account())!) }) : t("create.acctHint")}>
            <input class={[inputClass, "tracking-wide"]} type="tel" inputmode="numeric" dir="ltr" placeholder="0300 1234567" value={account()} onInput={e => setAccount(e.currentTarget.value)} />
          </Field>
          <Field label={t("create.acctTitle")}>
            <input class={inputClass} value={title()} onInput={e => setTitle(e.currentTarget.value)} maxlength="80" />
          </Field>
          <Field label={t("create.note")}>
            <textarea class={[inputClass, "h-28 py-3 text-base"]} placeholder={t("create.notePh")} value={instructions()} onInput={e => setInstructions(e.currentTarget.value)} maxlength="2000" />
          </Field>
        </Card>

        <Show when={error()}><ErrorNote message={error()} /></Show>
        <Button type="submit" disabled={saving()}>{saving() ? t("create.creating") : t("create.submit")}</Button>
      </form>
    </Screen>
  );
}
