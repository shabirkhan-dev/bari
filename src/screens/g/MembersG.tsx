import { createMemo, createSignal, Errored, For, Loading, refresh, Show } from "solid-js";
import { getDashboardV4, memberFines, membersRound, settleFine, type DashboardV4, type MembersRound, type DashboardMember, type HomeItem } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { freshness } from "../../lib/live";
import { navigate } from "../../lib/router";
import { setCurrent } from "../../lib/current";
import { whatsappLink } from "../../domain/display";
import { formatPkMobile } from "../../domain/phone";
import { money, t } from "../../i18n";
import { GAvatar, GIcon, GNote, GRow, GScreen, GSheet, GSkeleton, SwitchPill, WideHalo } from "../../ui/glass";
import { tick } from "../../ui/kit";

export function MembersG(props: { id: string; items: () => HomeItem[] }) {
  const dash = createMemo(() => { freshness(); return getDashboardV4(props.id); });
  const mr = createMemo(() => { freshness(); return membersRound(props.id); });
  return (
    <GScreen title={t("m.title")} nav={props.id}>
      <Errored fallback={err => <GNote tone="error">{describeError(err())}</GNote>}>
        <Loading fallback={<GSkeleton />}>
          <Body d={dash()} mr={mr()} items={props.items()} onChange={() => { refresh(dash); refresh(mr); }} />
        </Loading>
      </Errored>
    </GScreen>
  );
}

type State = "paid" | "checking" | "due" | "late";

function Body(props: { d: DashboardV4; mr: MembersRound; items: HomeItem[]; onChange: () => void }) {
  const [open, setOpen] = createSignal<DashboardMember | null>(null);
  const [switching, setSwitching] = createSignal(false);
  const isOrg = () => props.d.me.role !== "member";
  const c = () => props.d.committee;
  const stateOf = (m: DashboardMember): State | null =>
    m.overdue_count > 0 ? "late" : m.today_state === "verified" ? "paid" : m.today_state === "submitted" ? "checking" : m.today_state ? "due" : null;
  const paidToday = () => props.d.members.filter(m => m.today_state === "verified").length;
  const row = (id: string) => props.mr.members.find(x => x.member_id === id);

  return (
    <>
      <div class="mt-3 flex justify-center">
        <SwitchPill chip={[...c().name][0]?.toUpperCase() ?? "B"} onClick={() => setSwitching(true)} label={c().name}>
          <span class="max-w-[200px] truncate text-[13px] font-medium">{c().name}</span>
        </SwitchPill>
      </div>
      <p class="g-serif mt-3 text-center text-[22px]">{t("m.paidToday", { n: paidToday(), total: props.d.members.length })}</p>

      <section class="g-card mt-4 px-4">
        <ul>
          <For each={props.d.members}>{(m, i) => (
            <li>
              <MemberRow m={m} d={props.d} days={row(m.member_id)?.days ?? []} won={row(m.member_id)?.won_round ?? null}
                today={props.mr.today} state={stateOf(m)} onOpen={() => setOpen(m)} />
              <Show when={i() < props.d.members.length - 1}><div class="g-divider" /></Show>
            </li>
          )}</For>
        </ul>
      </section>

      <Show when={isOrg()}>
        <section class="g-card mt-3 px-4">
          <GRow icon={<GIcon.toss />} title={t("m.rounds")} href={`/c/${c().id}`} trailing={<span style={{ color: "var(--g-muted)" }}><GIcon.arrow /></span>} />
          <GRow icon={<GIcon.clock />} title={t("m.activity")} href={`/c/${c().id}/activity`} trailing={<span style={{ color: "var(--g-muted)" }}><GIcon.arrow /></span>} />
          <GRow icon={<GIcon.gear />} title={t("m.settings")} href={`/c/${c().id}/settings`} last trailing={<span style={{ color: "var(--g-muted)" }}><GIcon.arrow /></span>} />
        </section>
      </Show>

      <MemberSheet m={open()} d={props.d} onClose={() => setOpen(null)} onChange={props.onChange} />

      <GSheet open={switching()} onClose={() => setSwitching(false)} label={t("g.h.switch")}>
        <h2 class="g-serif text-[24px]">{t("g.h.switch")}</h2>
        <For each={props.items.filter(i => i.status === "active")}>{i => (
          <button type="button" class="flex w-full items-center gap-3 rounded-[20px] p-2.5 text-start"
            onClick={() => { tick(); setCurrent(i.id); setSwitching(false); }}>
            <span class="g-step h-9 w-9 text-[15px]">{[...i.name][0]?.toUpperCase()}</span>
            <span class="flex-1 text-[15px] font-semibold">{i.name}</span>
            <Show when={i.id === c().id}><span style={{ color: "var(--g-emerald)" }}><GIcon.check /></span></Show>
          </button>
        )}</For>
      </GSheet>
    </>
  );
}

const CHIP: Record<State, string> = { paid: "g-chip-green", checking: "g-chip-amber", due: "", late: "g-chip-red" };

function MemberRow(props: {
  m: DashboardMember; d: DashboardV4; days: MembersRound["members"][number]["days"]; won: number | null;
  today: string; state: State | null; onOpen: () => void;
}) {
  const me = () => props.m.member_id === props.d.me.member_id;
  const sub = () => [
    props.m.role !== "member" ? t("m.organizer") : null,
    props.won ? t("m.won", { n: props.won }) : null
  ].filter(Boolean).join(" · ") || t("m.inDraw");
  const sofar = () => props.days.filter(x => x.d <= props.today);
  const paid = () => sofar().filter(x => x.s === "verified").length;
  const color = (x: { d: string; s: string }) =>
    x.d > props.today ? "var(--g-tick)"
      : x.s === "verified" ? "var(--g-emerald)"
      : x.s === "submitted" || x.s === "disputed" ? "var(--g-amber)"
      : x.d === props.today ? "var(--g-tick)" : "var(--g-red)";
  const label = () => (props.state === "paid" ? t("m.paid") : props.state === "checking" ? t("m.checking") : props.state === "late" ? t("m.late") : t("m.due"));
  return (
    <button type="button" class="flex w-full items-start gap-3.5 py-4 text-start" onClick={() => { tick(); props.onOpen(); }}>
      <span class="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full" style={{ background: "var(--g-halo)", border: "1px solid var(--g-halo-border)" }}>
        <GAvatar name={props.m.name} seed={props.m.user_id} size={44} />
      </span>
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-2">
          <span class="g-serif min-w-0 flex-1 truncate text-[18px]">{me() ? t("g.you") : props.m.name}</span>
          <Show when={props.state}>
            <span class={["g-chip", CHIP[props.state!]]} style={props.state === "due" ? { background: "color-mix(in srgb, var(--g-ink) 10%, transparent)", color: "var(--g-ink-2)" } : undefined}>{label()}</span>
          </Show>
        </span>
        <span class="mt-1 block truncate text-[12px]" style={{ color: "var(--g-muted)" }}>{sub()}</span>
        <span class="mt-2.5 flex items-center gap-3">
          <span class="flex flex-1 items-center gap-[3.2px] overflow-hidden" aria-hidden="true">
            <For each={sofar()}>{x => <span class="h-[13px] w-[2px] shrink-0 rounded-full" style={{ background: color(x) }} />}</For>
          </span>
          <Show when={sofar().length > 0}>
            <span class="shrink-0 text-[11px]" style={{ color: "var(--g-faint)" }}>{t("m.days", { n: paid(), total: sofar().length })}</span>
          </Show>
        </span>
      </span>
    </button>
  );
}

function MemberSheet(props: { m: DashboardMember | null; d: DashboardV4; onClose: () => void; onChange: () => void }) {
  const isOrg = () => props.d.me.role !== "member";
  const c = () => props.d.committee;
  const me = () => props.m?.member_id === props.d.me.member_id;
  const fines = () => (props.m ? props.d.fines[props.m.member_id] ?? 0 : 0);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const reminder = () => {
    const m = props.m!;
    return m.overdue_paisa > 0
      ? t("c.reminderLate", { name: m.name, committee: c().name, amount: money(m.overdue_paisa), n: m.overdue_count, phone: formatPkMobile(c().account_number), title: c().account_title })
      : t("c.reminderToday", { name: m.name, committee: c().name, amount: money(c().contribution_paisa), phone: formatPkMobile(c().account_number), title: c().account_title });
  };
  /** Settle every open fine of this member (organizers only; not their own). */
  const settleAll = async (status: "paid" | "waived") => {
    setBusy(true);
    setError("");
    try {
      for (const f of await memberFines(props.m!.member_id)) await settleFine(f.obligation_id, status);
      props.onChange();
      props.onClose();
    } catch (e) { setError(describeError(e)); }
    finally { setBusy(false); }
  };
  return (
    <GSheet open={!!props.m} onClose={props.onClose} label={props.m?.name ?? ""}>
      <Show when={props.m}>{m => (
        <>
          <div class="flex items-center gap-3">
            <GAvatar name={m().name} seed={m().user_id} size={52} />
            <div class="min-w-0">
              <h2 class="g-serif truncate text-[22px]">{m().name}</h2>
              <Show when={m().phone}><p class="text-[13px]" style={{ color: "var(--g-muted)" }} dir="ltr">{formatPkMobile(m().phone!)}</p></Show>
            </div>
          </div>
          <Show when={m().overdue_paisa > 0}><span class="g-chip g-chip-red self-start">{t("status.late", { amount: money(m().overdue_paisa) })}</span></Show>
          <div class="g-card px-4">
            <Show when={!me() && m().phone}>
              <GRow icon={<GIcon.chat />} title={t("m.remind")} onClick={() => { window.open(whatsappLink(m().phone!, reminder()), "_blank", "noopener"); }} />
              <GRow icon={<GIcon.phone />} title={t("m.call")} onClick={() => { location.href = `tel:${m().phone}`; }} last={!isOrg()} />
            </Show>
            <Show when={isOrg()}>
              <GRow icon={<GIcon.receipt />} title={t("m.record", { name: m().name.split(/\s+/)[0]! })}
                onClick={() => { props.onClose(); navigate(`/c/${c().id}/pay/${m().member_id}`); }} last={fines() === 0 || me()} />
            </Show>
            <Show when={isOrg() && !me() && fines() > 0}>
              <div class="py-3">
                <p class="text-[14px]">{t("m.fine", { amount: money(fines()) })}</p>
                <div class="mt-3 grid grid-cols-2 gap-2">
                  <WideHalo h={48} disabled={busy()} onClick={() => settleAll("waived")}><span class="text-[13px]">{t("m.fineWaive")}</span></WideHalo>
                  <WideHalo h={48} dark disabled={busy()} onClick={() => settleAll("paid")}><span class="text-[13px]">{t("m.finePaid")}</span></WideHalo>
                </div>
              </div>
            </Show>
          </div>
          <Show when={error()}><GNote tone="error">{error()}</GNote></Show>
        </>
      )}</Show>
    </GSheet>
  );
}

