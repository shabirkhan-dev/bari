import { createMemo, Errored, For, Loading, Show } from "solid-js";
import { getHome, type HomeItem } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { freshness } from "../../lib/live";
import { navigate } from "../../lib/router";
import { todayInPKT } from "../../domain/dates";
import { contributionLabel } from "../../domain/display";
import { dateShort, t } from "../../i18n";
import { GIcon, GMoney, GNote, GScreen, GSkeleton, Halo, WideHalo } from "../../ui/glass";
import { tick } from "../../ui/kit";

/** Home while no committee is running yet: the committees you're in (forming / finished), or how to start. */
export function HomeListG() {
  const items = createMemo(() => { freshness(); return getHome(); });
  return (
    <GScreen bottom={
      <div class="grid w-full grid-cols-2 gap-2">
        <WideHalo h={60} href="/join"><GIcon.key /><span class="text-[14px] font-medium">{t("hl.join")}</span></WideHalo>
        <WideHalo h={60} dark href="/new"><GIcon.plus /><span class="text-[14px] font-medium">{t("hl.new")}</span></WideHalo>
      </div>
    }>
      <Errored fallback={err => <div class="mt-6"><GNote tone="error">{describeError(err())}</GNote></div>}>
        <Loading fallback={<div class="mt-6"><GSkeleton /></div>}>
          <Show when={items().length > 0} fallback={<Empty />}>
            <h2 class="g-serif mb-3 mt-6 px-1 text-[22px]">{t("home.yourCommittees")}</h2>
            <ul class="flex flex-col gap-3">
              <For each={items()}>{i => <li><Row i={i} /></li>}</For>
            </ul>
          </Show>
        </Loading>
      </Errored>
    </GScreen>
  );
}

function Row(props: { i: HomeItem }) {
  const i = () => props.i;
  const full = () => i().joined >= i().member_count;
  const passed = () => i().start_date < todayInPKT();
  const status = () => {
    if (i().status === "completed") return { text: t("status.finished"), cls: "g-chip-green" };
    if (i().status === "active") return { text: t("status.starts", { date: dateShort(i().start_date) }), cls: "g-chip-green" };
    if (full() && passed()) return { text: t("hl.newDate"), cls: "g-chip-amber" };
    if (full()) return { text: t("hl.ready"), cls: "g-chip-green" };
    const n = i().member_count - i().joined;
    return { text: n === 1 ? t("hl.waiting1") : t("hl.waiting", { n }), cls: "g-chip-amber" };
  };
  return (
    <a href={`/c/${i().id}`} class="g-card flex flex-col gap-3 px-4 py-4" onClick={e => { e.preventDefault(); tick(); navigate(`/c/${i().id}`); }}>
      <div class="flex items-center gap-3">
        <span class="g-step h-11 w-11 text-[18px]">{[...i().name][0]?.toUpperCase()}</span>
        <span class="min-w-0 flex-1">
          <span class="g-serif block truncate text-[20px]">{i().name}</span>
          <span class="mt-0.5 block truncate text-[12px]" style={{ color: "var(--g-muted)" }}>
            {contributionLabel(i().contribution_paisa, i().frequency, i().interval_days)} · {t("status.starts", { date: dateShort(i().start_date) })}
          </span>
        </span>
        <span style={{ color: "var(--g-muted)" }}><GIcon.arrow /></span>
      </div>
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-1.5" aria-label={t("status.joined", { joined: i().joined, total: i().member_count })} role="img">
          <For each={Array.from({ length: Math.min(i().member_count, 12) })}>{(_, k) => (
            <span class="h-2.5 w-2.5 rounded-full" style={k() < i().joined ? { background: "var(--g-chip)" } : { border: "1px dashed var(--g-dash)" }} />
          )}</For>
          <span class="ms-1 text-[12px]" style={{ color: "var(--g-muted)" }}>{t("status.joined", { joined: i().joined, total: i().member_count })}</span>
        </div>
        <GMoney paisa={i().payout_paisa} size={16} noCents />
      </div>
      <span class={["g-chip self-start", status().cls]}>{status().text}</span>
    </a>
  );
}

function Empty() {
  return (
    <section class="g-rise mt-14 flex flex-col items-center text-center">
      <Halo w={112}><span style={{ color: "var(--g-emerald)" }}><GIcon.members size={40} /></span></Halo>
      <h2 class="g-serif mt-6 text-[30px] leading-tight">{t("home.emptyTitle")}</h2>
      <p class="mt-3 max-w-[300px] text-[14px] leading-relaxed" style={{ color: "var(--g-muted)" }}>{t("home.emptyBody")}</p>
      <p class="mt-6 text-[12px]" style={{ color: "var(--g-faint)" }}>{t("home.how")}</p>
    </section>
  );
}
