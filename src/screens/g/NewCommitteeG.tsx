import { createMemo, createSignal, Show, untrack } from "solid-js";
import { createCommittee, setDailyCutoff, setLateFine } from "../../lib/api";
import type { Profile } from "../../lib/auth";
import { describeError } from "../../lib/errors";
import { back, navigate } from "../../lib/router";
import { addDays, todayInPKT } from "../../domain/dates";
import { rupees } from "../../domain/money";
import { buildRounds, CommitteeConfig } from "../../domain/schedule";
import { daysBetween } from "../../domain/display";
import { formatPkMobile, normalizePkMobile } from "../../domain/phone";
import { dateShort, money, t, timeOfDay } from "../../i18n";
import type { Key } from "../../i18n/strings";
import { GIcon, gInput, gInputStyle, GLabel, GMoney, GNote, GScreen, GSegmented, GSheet, GStepper, Halo, SlideToConfirm, Toggle, WideHalo } from "../../ui/glass";
import { tick } from "../../ui/kit";
import { maskedPhone, unitCount } from "./common";

type Freq = "daily" | "weekly" | "monthly";
const AMOUNTS: Record<Freq, number[]> = { daily: [100, 200, 500], weekly: [1000, 2000, 5000], monthly: [5000, 10000, 20000] };
const LENGTHS: Record<Freq, number[]> = { daily: [15, 30, 60], weekly: [2, 4, 8], monthly: [1, 2, 3] };
const FINES = [20, 50, 100];

/** Figma "New committee". Account, start date and frequency sit behind "Payments go to …". */
export function NewCommitteeG(props: { me: Profile }) {
  const [name, setName] = createSignal("");
  const [freq, setFreq] = createSignal<Freq>("daily");
  const [amount, setAmount] = createSignal<number | "other">(200);
  const [other, setOther] = createSignal("");
  const [periods, setPeriods] = createSignal(30);
  const [members, setMembers] = createSignal(5);
  const [fineOn, setFineOn] = createSignal(false);
  const [fine, setFine] = createSignal(50);
  const [cutoff, setCutoff] = createSignal("21:00");
  const [start, setStart] = createSignal(addDays(todayInPKT(), 1));
  const [title, setTitle] = createSignal(untrack(() => props.me.display_name));
  const [account, setAccount] = createSignal(untrack(() => props.me.phone ?? ""));
  const [more, setMore] = createSignal(false);
  const [help, setHelp] = createSignal(false);
  const [fineSheet, setFineSheet] = createSignal(false);
  const [error, setError] = createSignal("");

  const rupeesEach = () => (amount() === "other" ? Number(other()) : (amount() as number));
  const amountPaisa = createMemo(() => { const n = rupeesEach(); return Number.isInteger(n) && n > 0 && n <= 1_000_000 ? rupees(n) : 0; });
  const config = createMemo(() => CommitteeConfig.safeParse({
    memberCount: members(), contributionPaisa: amountPaisa(), frequency: freq(), periodsPerRound: periods(),
    startDate: start(), payoutPaisa: members() * periods() * amountPaisa()
  }));
  const summary = createMemo(() => {
    const c = config();
    if (!c.success) return null;
    const rounds = buildRounds(c.data);
    return { pot: c.data.payoutPaisa, rounds: rounds.length, days: daysBetween(c.data.startDate, rounds[rounds.length - 1]!.tossDate) + 1 };
  });
  const pickFreq = (f: Freq) => { setFreq(f); setAmount(AMOUNTS[f][1]!); setPeriods(LENGTHS[f][1]!); };

  const create = async () => {
    const c = config();
    const acct = normalizePkMobile(account());
    if (name().trim().length < 2) return setError(t("create.errName"));
    if (!amountPaisa()) return setError(t("create.errAmount"));
    if (!c.success) return setError(t("create.errCheck"));
    if (start() < todayInPKT()) { setMore(true); return setError(t("create.errPast")); }
    if (!acct) { setMore(true); return setError(t("create.errAcct")); }
    if (title().trim().length < 2) { setMore(true); return setError(t("create.errTitle")); }
    setError("");
    try {
      const id = await createCommittee({
        name: name().trim(), description: null, memberCount: c.data.memberCount, contributionPaisa: c.data.contributionPaisa,
        frequency: c.data.frequency, intervalDays: null, periodsPerRound: c.data.periodsPerRound, startDate: c.data.startDate,
        payoutPaisa: c.data.payoutPaisa, accountTitle: title().trim(), accountNumber: acct, instructions: null
      });
      if (fineOn()) await setLateFine(id, rupees(fine()));
      if (cutoff() !== "21:00") await setDailyCutoff(id, cutoff());
      navigate(`/c/${id}`, { replace: true });
    } catch (e) { setError(describeError(e)); }
  };

  return (
    <GScreen title={t("nc.title")} bottom={
      <>
        <Halo w={64} label={t("common.back")} onClick={() => back("/")}><GIcon.undo /></Halo>
        <SlideToConfirm label={t("nc.slide")} busyLabel={t("nc.creating")} onConfirm={create} />
        <Halo w={64} label={t("g.p.help")} onClick={() => setHelp(true)}><GIcon.help /></Halo>
      </>
    }>
      <GLabel for="nc-name">{t("nc.name")}</GLabel>
      <input id="nc-name" class={[gInput, "g-serif text-[20px]"]} style={gInputStyle} maxlength="80" placeholder={t("create.namePh")}
        value={name()} onInput={e => setName(e.currentTarget.value)} />

      <GLabel>{t(`nc.amount.${freq()}` as Key)}</GLabel>
      <GSegmented<number | "other"> label={t(`nc.amount.${freq()}` as Key)} value={amount()} onChange={setAmount}
        options={[...AMOUNTS[freq()].map(a => ({ value: a as number | "other", label: `Rs ${a.toLocaleString("en-US")}` })), { value: "other", label: t("nc.other") }]} />
      <Show when={amount() === "other"}>
        <input class={[gInput, "mt-2"]} style={gInputStyle} inputmode="numeric" dir="ltr" placeholder="250" aria-label={t(`nc.amount.${freq()}` as Key)}
          value={other()} onInput={e => setOther(e.currentTarget.value.replace(/\D/g, "").slice(0, 7))} />
      </Show>

      <GLabel>{t("nc.length")}</GLabel>
      <GSegmented<number> label={t("nc.length")} value={periods()} onChange={setPeriods}
        options={LENGTHS[freq()].map(n => ({ value: n, label: unitCount(freq(), n) }))} />

      <section class="g-card mt-4 flex items-center justify-between px-5 py-3">
        <span class="text-[15px]">{t("nc.members")}</span>
        <GStepper label={t("nc.members")} value={members()} min={2} max={50} onChange={setMembers} />
      </section>

      <section class="g-card mt-3 px-5 py-1">
        <div class="flex items-center justify-between gap-3 py-3">
          <button type="button" class="min-w-0 text-start" onClick={() => { tick(); setFineSheet(true); }}>
            <span class="block text-[15px]">{t("nc.fine")}</span>
            <span class="mt-0.5 block text-[12px]" style={{ color: "var(--g-muted)" }}>{fineOn() ? t("nc.fineSub", { amount: money(rupees(fine())) }) : t("nc.fineOff")}</span>
          </button>
          <Toggle on={fineOn()} label={t("nc.fine")} onChange={setFineOn} />
        </div>
        <div class="g-divider" />
        <div class="flex items-center justify-between gap-3 py-3">
          <span>
            <span class="block text-[15px]">{t("nc.payBy")}</span>
            <span class="mt-0.5 block text-[12px]" style={{ color: "var(--g-muted)" }}>{t("nc.payBySub")}</span>
          </span>
          <label class="g-halo shrink-0" style={{ height: "48px", width: "112px" }}>
            <span class="g-core text-[14px] font-medium">{timeOfDay(cutoff(), true)}</span>
            <input type="time" step="900" class="absolute inset-0 cursor-pointer opacity-0" aria-label={t("nc.payBy")} value={cutoff()}
              onInput={e => setCutoff(e.currentTarget.value || "21:00")} />
          </label>
        </div>
      </section>

      <section class="mt-4 flex flex-col items-center text-center">
        <p class="text-[12px]" style={{ color: "var(--g-muted)" }}>{t("nc.pot")}</p>
        <Show when={summary()} fallback={<p class="g-serif mt-1 text-[36px]" style={{ color: "var(--g-faint)" }}>—</p>}>
          {s => (
            <>
              <GMoney paisa={s().pot} size={36} noCents class="mt-1" />
              <p class="mt-2 text-[12px]" style={{ color: "var(--g-muted)" }}>{t("nc.summary", { rounds: s().rounds, days: s().days })}</p>
            </>
          )}
        </Show>
        <button type="button" class="mt-2 min-h-9 text-[12px] font-medium underline underline-offset-4" style={{ color: "var(--g-ink-2)" }}
          onClick={() => { tick(); setMore(true); }}>
          {t("nc.more", { account: normalizePkMobile(account()) ? maskedPhone(normalizePkMobile(account())!) : "—", date: dateShort(start()) })}
        </button>
      </section>
      <Show when={error()}><div class="mt-3"><GNote tone="error">{error()}</GNote></div></Show>

      <GSheet open={more()} onClose={() => setMore(false)} label={t("nc.moreTitle")}>
        <h2 class="g-serif text-[24px]">{t("nc.moreTitle")}</h2>
        <div>
          <p class="mb-1.5 text-[12px]" style={{ color: "var(--g-muted)" }}>{t("nc.often")}</p>
          <GSegmented<Freq> label={t("nc.often")} value={freq()} onChange={pickFreq}
            options={[{ value: "daily", label: t("create.daily") }, { value: "weekly", label: t("create.weekly") }, { value: "monthly", label: t("create.monthly") }]} />
        </div>
        <label class="block">
          <span class="mb-1.5 block text-[12px]" style={{ color: "var(--g-muted)" }}>{t("create.first")}</span>
          <input class={gInput} style={gInputStyle} type="date" min={todayInPKT()} value={start()} onInput={e => setStart(e.currentTarget.value)} />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px]" style={{ color: "var(--g-muted)" }}>{t("create.acct")}</span>
          <input class={[gInput, "tracking-wide"]} style={gInputStyle} type="tel" inputmode="numeric" dir="ltr" value={account()} onInput={e => setAccount(e.currentTarget.value)} />
          <span class="mt-1 block text-[12px]" style={{ color: "var(--g-muted)" }}>
            {normalizePkMobile(account()) ? t("create.acctWill", { phone: formatPkMobile(normalizePkMobile(account())!) }) : t("create.acctHint")}
          </span>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-[12px]" style={{ color: "var(--g-muted)" }}>{t("create.acctTitle")}</span>
          <input class={gInput} style={gInputStyle} maxlength="80" value={title()} onInput={e => setTitle(e.currentTarget.value)} />
        </label>
        <WideHalo h={56} dark onClick={() => setMore(false)}><span class="text-[14px] font-medium">{t("common.continue")}</span></WideHalo>
      </GSheet>

      <GSheet open={fineSheet()} onClose={() => setFineSheet(false)} label={t("nc.fineAmount")}>
        <h2 class="g-serif text-[24px]">{t("nc.fineAmount")}</h2>
        <GSegmented<number> label={t("nc.fineAmount")} value={fine()} onChange={v => { setFine(v); setFineOn(true); }}
          options={FINES.map(f => ({ value: f, label: `Rs ${f}` }))} />
        <p class="text-[13px]" style={{ color: "var(--g-ink-2)" }}>{t("st.rules2")}</p>
        <WideHalo h={56} dark onClick={() => setFineSheet(false)}><span class="text-[14px] font-medium">{t("common.continue")}</span></WideHalo>
      </GSheet>

      <GSheet open={help()} onClose={() => setHelp(false)} label={t("g.p.help")}>
        <h2 class="g-serif text-[24px]">{t("nc.title")}</h2>
        <p class="text-[14px] leading-relaxed" style={{ color: "var(--g-ink-2)" }}>{t("nc.helpBody")}</p>
      </GSheet>
    </GScreen>
  );
}
