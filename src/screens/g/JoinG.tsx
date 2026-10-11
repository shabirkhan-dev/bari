import { createMemo, createSignal, Errored, For, Loading, Show } from "solid-js";
import { invitationPreview, joinCommittee, type InvitePreview } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { back, navigate } from "../../lib/router";
import { setCurrent } from "../../lib/current";
import { money, t, timeOfDay } from "../../i18n";
import type { Key } from "../../i18n/strings";
import { GAvatar, GIcon, gInput, gInputStyle, GMoney, GNote, GScreen, GSheet, GSkeleton, Halo, SlideToConfirm, WideHalo } from "../../ui/glass";
import { unitCount } from "./common";

/** "K7QM2XWP" → "K7QM-2XWP" */
export const showCode = (c: string) => (c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);
const clean = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function JoinG(props: { code?: string }) {
  return (
    <Show when={props.code} keyed fallback={<EnterCode />}>
      {code => <Preview code={clean(code)} />}
    </Show>
  );
}

function EnterCode() {
  const [code, setCode] = createSignal("");
  return (
    <GScreen title={t("j.title")} left="back" bottom={
      <WideHalo h={64} dark disabled={code().length < 6} onClick={() => navigate(`/join/${code()}`, { replace: true })}>
        <span class="text-[15px] font-medium">{t("j.check")}</span>
      </WideHalo>
    }>
      <p class="mt-8 text-center text-[13px]" style={{ color: "var(--g-muted)" }}>{t("j.enter")}</p>
      <input class={[gInput, "mt-3 h-[72px] text-center text-[28px] tracking-[0.12em]"]} style={{ ...gInputStyle, "font-family": "Newsreader, serif" }}
        dir="ltr" autocomplete="off" autocapitalize="characters" placeholder="K7QM-2XWP" aria-label={t("j.code")}
        value={showCode(code())} onInput={e => setCode(clean(e.currentTarget.value).slice(0, 12))}
        onKeyDown={e => { if (e.key === "Enter" && code().length >= 6) navigate(`/join/${code()}`, { replace: true }); }} />
    </GScreen>
  );
}

function Preview(props: { code: string }) {
  const p = createMemo(() => invitationPreview(props.code));
  return (
    <Errored fallback={err => (
      <GScreen title={t("j.title")} left="back">
        <div class="mt-8 flex flex-col gap-4">
          <GNote tone="error">{describeError(err())}</GNote>
          <WideHalo h={56} onClick={() => navigate("/join", { replace: true })}><span class="text-[14px] font-medium">{t("j.enter")}</span></WideHalo>
        </div>
      </GScreen>
    )}>
      <Loading fallback={<GScreen title={t("j.title")}><GSkeleton /></GScreen>}>
        <Card p={p()} code={props.code} />
      </Loading>
    </Errored>
  );
}

function Card(props: { p: InvitePreview; code: string }) {
  const [error, setError] = createSignal("");
  const [help, setHelp] = createSignal(false);
  const p = () => props.p;
  const joined = () => p().members.length;
  const left = () => Math.max(0, p().member_count - joined());
  const join = async () => {
    setError("");
    try {
      const id = await joinCommittee(props.code);
      setCurrent(id);
      navigate(`/c/${id}`, { replace: true });
    } catch (e) { setError(describeError(e)); }
  };
  const freqLabel = () => (p().frequency === "custom" ? t("j.custom", { n: p().interval_days ?? 0 }) : t(`j.${p().frequency}` as Key));
  const tile = (label: string, value: import("@solidjs/web").JSX.Element) => (
    <div class="rounded-[20px] px-3.5 py-3" style={{ background: "var(--g-inner)" }}>
      <p class="text-[11px]" style={{ color: "var(--g-muted)" }}>{label}</p>
      <p class="g-serif mt-1 text-[18px]">{value}</p>
    </div>
  );
  const canJoin = () => !p().already_member && p().status === "forming" && left() > 0;

  return (
    <GScreen title={t("j.title")} bottom={
      <>
        <Halo w={64} label={t("common.back")} onClick={() => back("/")}><GIcon.undo /></Halo>
        <Show when={canJoin()} fallback={
          <Show when={p().already_member} fallback={
            <div class="g-halo flex-1" style={{ height: "64px" }}><span class="g-core px-3 text-center text-[13px]" style={{ color: "var(--g-muted)" }}>
              {p().status !== "forming" ? t("j.started") : t("j.full", { n: p().member_count })}
            </span></div>
          }>
            <WideHalo h={64} dark class="flex-1" onClick={() => { setCurrent(p().committee_id); navigate(`/c/${p().committee_id}`, { replace: true }); }}>
              <span class="text-[15px] font-medium">{t("j.open")}</span>
            </WideHalo>
          </Show>
        }>
          <SlideToConfirm label={t("j.slide")} busyLabel={t("j.joining")} chevrons onConfirm={join} />
        </Show>
        <Halo w={64} label={t("g.p.help")} onClick={() => setHelp(true)}><GIcon.help /></Halo>
      </>
    }>
      <p class="mt-3 text-center text-[12px]" style={{ color: "var(--g-muted)" }}>{t("j.code")}</p>
      <div class="mt-2 flex justify-center">
        <span class="g-halo" style={{ height: "64px", "min-width": "240px" }}>
          <span class="g-core g-num px-6 text-[26px] tracking-[0.06em]" dir="ltr">{showCode(props.code)}</span>
        </span>
      </div>

      <section class="g-card mt-5 flex flex-col items-center px-4 pb-4 pt-5 text-center">
        <span class="g-step h-14 w-14 text-[26px]">{[...p().name][0]?.toUpperCase()}</span>
        <h2 class="g-serif mt-3 text-[26px]">{p().name}</h2>
        <Show when={p().organizer}><p class="mt-1 text-[12px]" style={{ color: "var(--g-muted)" }}>{t("j.by", { name: p().organizer! })}</p></Show>
        <div class="mt-4 grid w-full grid-cols-2 gap-2.5 text-start">
          {tile(freqLabel(), <GMoney paisa={p().contribution_paisa} size={18} noCents />)}
          {tile(t("j.members"), t("j.membersOf", { n: joined(), total: p().member_count }))}
          {tile(t("j.round"), unitCount(p().frequency, p().periods_per_round))}
          {tile(t("j.pot"), <GMoney paisa={p().payout_paisa} size={18} noCents />)}
        </div>
      </section>

      <ul class="mt-4 flex flex-col gap-2.5 px-1 text-[13px]">
        <Rule text={p().frequency === "daily"
          ? t("j.rulePay", { amount: money(p().contribution_paisa), time: timeOfDay(p().cutoff) })
          : t("j.rulePayOther", { amount: money(p().contribution_paisa), time: timeOfDay(p().cutoff) })} />
        <Rule text={p().late_fine_paisa ? t("j.ruleFine", { amount: money(p().late_fine_paisa!) }) : t("j.ruleNoFine")} />
        <Rule text={t("j.ruleToss")} />
      </ul>

      <div class="mt-5 flex justify-center" dir="ltr">
        <For each={p().members}>{(m, i) => (
          <span style={{ "margin-inline-start": i() ? "-8px" : "0" }}><GAvatar name={m.name} seed={m.user_id} size={34} /></span>
        )}</For>
        <Show when={left() > 0}>
          <span class="grid h-[34px] w-[34px] place-items-center rounded-full border border-dashed text-[14px]"
            style={{ "margin-inline-start": "-4px", "border-color": "var(--g-dash)", color: "var(--g-muted)", background: "var(--g-halo)" }}>+</span>
        </Show>
      </div>
      <p class="mt-2 text-center text-[12px]" style={{ color: "var(--g-muted)" }}>
        {left() === 0 ? t("j.full", { n: p().member_count }) : left() === 1 ? t("j.spot1", { n: joined() }) : t("j.spots", { n: joined(), left: left() })}
      </p>
      <Show when={error()}><div class="mt-3"><GNote tone="error">{error()}</GNote></div></Show>

      <GSheet open={help()} onClose={() => setHelp(false)} label={t("g.p.help")}>
        <h2 class="g-serif text-[24px]">{t("j.title")}</h2>
        <p class="text-[14px] leading-relaxed" style={{ color: "var(--g-ink-2)" }}>{t("j.help")}</p>
        <p class="text-[12px]" style={{ color: "var(--g-muted)" }}>{t("app.safetyShort")}</p>
      </GSheet>
    </GScreen>
  );
}

function Rule(props: { text: string }) {
  return (
    <li class="flex items-center gap-2.5">
      <span class="grid h-5 w-5 shrink-0 place-items-center rounded-md" style={{ background: "var(--g-green-soft)", color: "var(--g-emerald)" }}><GIcon.check size={12} /></span>
      <span>{props.text}</span>
    </li>
  );
}
