import { createMemo, createSignal, For, Loading, Show } from "solid-js";
import { activateCommittee, createInvitation, latestInvitation, leaveCommittee, type Dashboard } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { back, navigate } from "../../lib/router";
import { setCurrent } from "../../lib/current";
import { todayInPKT } from "../../domain/dates";
import { dateShort, t } from "../../i18n";
import { GAvatar, GIcon, GNote, GRow, GScreen, GSheet, Halo, SlideToConfirm, WideHalo } from "../../ui/glass";
import { tick, useCopy } from "../../ui/kit";
import { showCode } from "./JoinG";

/** Figma "Invite members": a forming committee, for the organizer and for members waiting. */
export function InviteG(props: { d: Dashboard; onChange: () => void }) {
  const c = () => props.d.committee;
  const isOrg = () => props.d.me.role !== "member";
  const isOwner = () => props.d.me.role === "owner";
  const joined = () => props.d.members.length;
  const total = () => c().member_count;
  const left = () => Math.max(0, total() - joined());
  const full = () => left() === 0;
  const invite = createMemo(() => (isOrg() ? latestInvitation(c().id) : Promise.resolve(null)));
  const [made, setMade] = createSignal<string | null>(null);
  const code = () => made() ?? invite()?.code ?? null;
  const [error, setError] = createSignal("");
  const [help, setHelp] = createSignal(false);
  const { copied, copy } = useCopy();
  const link = () => `${location.origin}/join/${code()}`;
  const message = () => t("c.inviteMsg", { name: c().name, code: code() ?? "", link: link() });

  const ensureCode = async () => {
    if (code()) return code()!;
    const k = await createInvitation(c().id);
    setMade(k);
    return k;
  };
  const share = async () => {
    setError("");
    try {
      await ensureCode();
      if (navigator.share) await navigator.share({ title: "Bari", text: message() });
      else await copy(message());
    } catch (e) { if ((e as DOMException)?.name !== "AbortError") setError(describeError(e)); }
  };
  const start = async () => {
    setError("");
    try { await activateCommittee(c().id); setCurrent(c().id); props.onChange(); navigate("/", { replace: true }); }
    catch (e) { setError(describeError(e)); }
  };
  const leave = async () => {
    try { await leaveCommittee(c().id); navigate("/", { replace: true }); }
    catch (e) { setError(describeError(e)); setHelp(false); }
  };
  const owner = () => props.d.members.find(m => m.role === "owner");

  return (
    <GScreen title={t("iv.title")} bottom={
      <>
        <Halo w={64} label={t("common.back")} onClick={() => back("/")}><GIcon.undo /></Halo>
        <Show when={isOwner() && full()} fallback={
          <div class="g-halo flex-1" style={{ height: "64px" }}><span class="g-core px-3 text-center text-[13px]" style={{ color: "var(--g-muted)" }}>
            {full() ? t("iv.waitingOrg", { name: owner()?.name.split(/\s+/)[0] ?? "" }) : t("iv.startsWhen", { n: total() })}
          </span></div>
        }>
          <SlideToConfirm label={t("iv.slide")} busyLabel={t("iv.starting")} chevrons onConfirm={start} />
        </Show>
        <Halo w={64} label={t("g.p.help")} onClick={() => setHelp(true)}><GIcon.help /></Halo>
      </>
    }>
      <h2 class="g-serif mt-2 text-center text-[24px]">{c().name}</h2>
      <p class="mt-1 text-center text-[13px]" style={{ color: "var(--g-muted)" }}>
        {full() ? t("iv.allIn") : left() === 1 ? t("iv.share1") : t("iv.share", { n: left() })}
      </p>

      <Show when={isOrg() && !full()}>
        <section class="g-card mt-4 px-4 pb-4 pt-4 text-center" style={{ "background-image": "linear-gradient(135deg, rgb(255 255 255 / 0.25), color-mix(in srgb, var(--g-chip) 12%, transparent))" }}>
          <p class="text-[12px]" style={{ color: "var(--g-muted)" }}>{t("j.code")}</p>
          <Loading fallback={<div class="skeleton mx-auto mt-2 h-12 w-56" />}>
            <Show when={code()} fallback={
              <div class="mt-3"><WideHalo h={56} onClick={() => void ensureCode().catch(e => setError(describeError(e)))}><span class="text-[14px] font-medium">{t("iv.makeCode")}</span></WideHalo></div>
            }>
              <p class="g-num mt-1 text-[40px] tracking-[0.06em]" dir="ltr">{showCode(code()!)}</p>
              <div class="mt-4 grid grid-cols-2 gap-2">
                <WideHalo h={56} onClick={() => copy(code()!)}>
                  {copied() ? <GIcon.check size={16} /> : <GIcon.copy />}<span class="text-[13px] font-medium">{copied() ? t("common.copied") : t("iv.copy")}</span>
                </WideHalo>
                <WideHalo h={56} dark onClick={share}><GIcon.share size={16} /><span class="text-[13px] font-medium">{t("iv.link")}</span></WideHalo>
              </div>
              <p class="mt-3 text-[11px]" style={{ color: "var(--g-faint)" }}>{t("c.valid")}</p>
            </Show>
          </Loading>
        </section>
      </Show>

      <section class="g-card mt-3 px-4 pb-2 pt-4">
        <h3 class="g-serif text-[18px]">{t("iv.membersOf", { n: joined(), total: total() })}</h3>
        <ul class="mt-1">
          <For each={props.d.members}>{m => (
            <li class="flex items-center gap-3 border-b py-3" style={{ "border-color": "var(--g-divider)" }}>
              <GAvatar name={m.name} seed={m.user_id} size={34} />
              <span class="g-serif min-w-0 flex-1 truncate text-[16px]">
                {m.member_id === props.d.me.member_id && m.role === "owner" ? t("iv.youOrg") : m.member_id === props.d.me.member_id ? t("g.you") : m.name}
              </span>
              <span class="g-chip g-chip-green">{m.role === "owner" ? t("m.organizer") : t("iv.joined")}</span>
            </li>
          )}</For>
          <For each={Array.from({ length: left() })}>{(_, i) => (
            <li class={["flex items-center gap-3 py-3", i() < left() - 1 && "border-b"]} style={{ "border-color": "var(--g-divider)" }}>
              <span class="grid h-[34px] w-[34px] place-items-center rounded-full border border-dashed text-[14px]" style={{ "border-color": "var(--g-dash)", color: "var(--g-muted)" }}>+</span>
              <span class="min-w-0 flex-1 text-[14px]" style={{ color: "var(--g-faint)" }}>{t("iv.open")}</span>
              <span class="g-chip g-chip-plain" style={{ background: "var(--g-tick)", color: "var(--g-muted)" }}>{t("iv.waiting")}</span>
            </li>
          )}</For>
        </ul>
      </section>
      <p class="mt-3 text-center text-[12px]" style={{ color: "var(--g-muted)" }}>
        {full() ? t("iv.startsOn", { date: dateShort(c().start_date) }) : t("iv.startsWhen", { n: total() })}
      </p>
      <Show when={full() && isOwner() && c().start_date < todayInPKT()}><div class="mt-3"><GNote tone="error">{t("err.startPast")}</GNote></div></Show>
      <Show when={error()}><div class="mt-3"><GNote tone="error">{error()}</GNote></div></Show>

      <GSheet open={help()} onClose={() => setHelp(false)} label={t("g.p.help")}>
        <h2 class="g-serif text-[24px]">{c().name}</h2>
        <p class="text-[14px] leading-relaxed" style={{ color: "var(--g-ink-2)" }}>{t("nc.helpBody")}</p>
        <div class="g-card px-4">
          <Show when={isOrg()}>
            <GRow icon={<GIcon.gear />} title={t("m.settings")} href={`/c/${c().id}/settings`} trailing={<span style={{ color: "var(--g-muted)" }}><GIcon.arrow /></span>} />
          </Show>
          <Show when={!isOwner()}>
            <GRow icon={<GIcon.logout />} title={t("iv.leave")} tone="var(--g-red)" onClick={() => { tick(); void leave(); }} last />
          </Show>
          <Show when={isOwner()}>
            <GRow icon={<GIcon.clock />} title={t("m.activity")} href={`/c/${c().id}/activity`} last trailing={<span style={{ color: "var(--g-muted)" }}><GIcon.arrow /></span>} />
          </Show>
        </div>
      </GSheet>
    </GScreen>
  );
}
