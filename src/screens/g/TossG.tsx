import { createMemo, createSignal, Errored, For, Loading, refresh, Show } from "solid-js";
import { drawToss, getDashboard, payoutRound, tossEligibility, type Dashboard, type DashboardRound, type Eligibility, type PayoutRound } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { freshness } from "../../lib/live";
import { navigate } from "../../lib/router";
import { dateShort, lang, t } from "../../i18n";
import { firstName, GAvatar, GIcon, GMoney, GNote, GScreen, GSheet, GSkeleton, Halo, SlideToConfirm, SwitchPill, WideHalo } from "../../ui/glass";
import { tick } from "../../ui/kit";

export function TossG(props: { id: string }) {
  const dash = createMemo(() => { freshness(); return getDashboard(props.id); });
  return (
    <Errored fallback={err => <GScreen title={t("g.t.title")} nav={props.id}><GNote tone="error">{describeError(err())}</GNote></GScreen>}>
      <Loading fallback={<GScreen title={t("g.t.title")} nav={props.id}><GSkeleton /></GScreen>}>
        <TossRound d={dash()} onDone={() => refresh(dash)} />
      </Loading>
    </Errored>
  );
}

const isOrganizer = (d: Dashboard) => d.me.role !== "member";

function TossRound(props: { d: Dashboard; onDone: () => void }) {
  const nextRound = () => props.d.rounds.find(r => r.status === null) ?? props.d.rounds.at(-1)!;
  const [picked, setPicked] = createSignal<number | null>(null);
  const [choosing, setChoosing] = createSignal(false);
  const [help, setHelp] = createSignal(false);
  const r = () => props.d.rounds.find(x => x.round === (picked() ?? nextRound().round)) ?? nextRound();
  const cid = () => props.d.committee.id;

  const payout = createMemo(() => { freshness(); return payoutRound(cid(), r().round); });
  const elig = createMemo(() => { freshness(); return tossEligibility(cid(), r().round); });
  const [error, setError] = createSignal("");

  const draw = async () => {
    setError("");
    try {
      await drawToss(cid(), r().round, "app");
      refresh(payout);
      refresh(elig);
      props.onDone();
    } catch (e) { setError(describeError(e)); }
  };

  const name = (memberId: string | null | undefined) => {
    if (memberId === props.d.me.member_id) return t("g.you");
    return firstName(props.d.members.find(m => m.member_id === memberId)?.name ?? "—");
  };

  return (
    <GScreen title={t("g.t.title")} bottom={
      <Loading fallback={<div class="h-16 flex-1" />}>
        <BottomBar d={props.d} r={r()} p={payout()} eligible={elig().filter(e => e.eligible).length} onDraw={draw} onHelp={() => setHelp(true)} />
      </Loading>
    }>
      <div class="mt-3 flex justify-center">
        <SwitchPill chip={String(r().round)} onClick={() => setChoosing(true)} label={t("g.l.pickRound")}>
          <span class="text-[12px] font-semibold">{t("g.t.roundOf", { n: r().round, total: props.d.rounds.length })}</span>
          <span class="text-[12px]" style={{ color: "var(--g-faint)" }}>· {dateShort(r().toss_date)}</span>
        </SwitchPill>
      </div>

      <section class="mt-3 flex flex-col items-center text-center">
        <p class="g-serif text-[20px]" style={{ color: "var(--g-ink-2)" }}>{t("g.t.pot")}</p>
        <GMoney paisa={props.d.committee.payout_paisa} size={46} class="mt-1" hideable />
      </section>

      <Errored fallback={err => <div class="mt-6"><GNote tone="error">{describeError(err())}</GNote></div>}>
        <Loading fallback={<div class="mt-6"><GSkeleton h={300} count={1} /></div>}>
          <Show when={payout()} fallback={<Draw d={props.d} r={r()} elig={elig()} name={name} />}>
            {p => <Drawn d={props.d} r={r()} p={p()} name={name} />}
          </Show>
          <Show when={error()}><div class="mt-3"><GNote tone="error">{error()}</GNote></div></Show>
        </Loading>
      </Errored>

      <GSheet open={choosing()} onClose={() => setChoosing(false)} label={t("g.l.pickRound")}>
        <h2 class="g-serif text-[24px]">{t("g.l.pickRound")}</h2>
        <ul class="flex flex-col gap-1">
          <For each={props.d.rounds}>{x => (
            <li>
              <button type="button" class="flex w-full items-center gap-3 rounded-[20px] p-2.5 text-start" aria-current={x.round === r().round ? "true" : undefined}
                onClick={() => { tick(); setPicked(x.round); setChoosing(false); }}>
                <span class="g-step h-9 w-9 text-[15px]">{x.round}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-[15px] font-semibold">{t("g.t.roundOf", { n: x.round, total: props.d.rounds.length })}</span>
                  <span class="block text-[12px]" style={{ color: "var(--g-muted)" }}>
                    {x.winner_member_id ? t("g.t.won", { name: name(x.winner_member_id), n: x.round }) : t("g.t.on", { date: dateShort(x.toss_date) })}
                  </span>
                </span>
              </button>
            </li>
          )}</For>
        </ul>
      </GSheet>

      <GSheet open={help()} onClose={() => setHelp(false)} label={t("g.t.helpTitle")}>
        <h2 class="g-serif text-[24px]">{t("g.t.helpTitle")}</h2>
        <p class="text-[14px] leading-relaxed" style={{ color: "var(--g-ink-2)" }}>{t("g.t.helpBody")}</p>
        <WideHalo h={56} href={`/c/${cid()}/round/${r().round}`}>
          <span class="text-[14px] font-medium">{isOrganizer(props.d) && r().status === null ? t("g.t.manual") : t("g.t.details")}</span>
        </WideHalo>
      </GSheet>
    </GScreen>
  );
}

/* ───────────── Before the draw: the stack of who's in ───────────── */

function Draw(props: { d: Dashboard; r: DashboardRound; elig: Eligibility[]; name: (id: string) => string }) {
  const ins = () => props.elig.filter(e => e.eligible).map(e => e.member_id);
  const out = () => props.elig.filter(e => !e.eligible && e.reason === "arrears");
  const memberName = (id: string) => props.d.members.find(m => m.member_id === id)?.name ?? "?";
  const seed = (id: string) => props.d.members.find(m => m.member_id === id)?.user_id ?? id;
  const iAmIn = () => ins().includes(props.d.me.member_id);
  const others = () => ins().filter(id => id !== props.d.me.member_id);
  const winners = () => props.d.rounds.filter(x => x.winner_member_id && x.round < props.r.round);

  return (
    <>
      <Stack
        front={
          <div class="relative h-full p-4">
            <p class="g-serif text-[18px]">{t("g.t.next")} <span style={{ color: "var(--g-faint)" }}>{t("g.t.winnerWord")}</span></p>
            <p class="absolute end-4 top-[18px] text-[15px] font-bold">R{props.r.round}</p>
            <p aria-hidden="true" class="g-serif pointer-events-none absolute inset-x-0 top-6 text-center text-[120px] leading-none" style={{ color: "color-mix(in srgb, var(--g-ink) 6%, transparent)" }}>{lang() === "ur" ? "؟" : "?"}</p>
            <div class="absolute inset-x-0 top-[96px] flex justify-center" dir="ltr">
              <For each={ins().slice(0, 3)}>{(id, i) => (
                <span style={{ "margin-inline-start": i() ? "-12px" : "0" }}><GAvatar name={memberName(id)} seed={seed(id)} size={64} border={3} /></span>
              )}</For>
              <Show when={ins().length > 3}>
                <span class="g-avatar" style={{ width: "64px", height: "64px", "margin-inline-start": "-12px", "font-size": "18px", background: "var(--g-inner)", color: "var(--g-ink)", "border-width": "3px" }}>+{ins().length - 3}</span>
              </Show>
            </div>
            <p class="absolute inset-x-3 top-[176px] truncate text-center text-[12px]" style={{ color: "var(--g-muted)" }}>
              {ins().slice(0, 4).map(props.name).join(" · ")}{ins().length > 4 ? " …" : ""}
            </p>
            <p class="g-serif absolute inset-x-3 top-[196px] text-center text-[15px]">
              {ins().length ? (iAmIn() ? t("g.t.oneOfYou") : t("g.t.oneOfThem")) : t("g.t.nobody")}
            </p>
            <p class="g-serif absolute bottom-4 start-4 text-[17px]">{t("g.t.left", { n: ins().length })}</p>
            <p class="absolute bottom-[18px] end-4 text-[14px] font-bold">{dateShort(props.r.toss_date)}</p>
          </div>
        }
        left={others()[0] ? { name: props.name(others()[0]!), initial: memberName(others()[0]!) } : null}
        right={others()[1] ? { name: props.name(others()[1]!), initial: memberName(others()[1]!) } : null}
      />

      <ul class="mt-5 flex items-center justify-center gap-2.5" aria-label={t("g.t.still", { n: ins().length })}>
        <For each={props.d.members}>{m => {
          const won = () => m.paid_out;
          const isIn = () => ins().includes(m.member_id);
          return (
            <li class="relative grid h-10 w-10 place-items-center">
              <Show when={isIn()}><span class="g-halo absolute inset-0" style={{ "box-shadow": "none" }} /></Show>
              <GAvatar name={m.name} seed={m.user_id} size={30} faded={won()} dot={!won() && !isIn() ? "due" : null} />
            </li>
          );
        }}</For>
      </ul>

      <p class="g-serif mt-3 text-center text-[17px]">{t("g.t.still", { n: ins().length })}</p>
      <Show when={winners().length > 0}>
        <p class="mt-1 text-center text-[12px]" style={{ color: "var(--g-muted)" }}>
          {winners().map(w => t("g.t.won", { name: props.name(w.winner_member_id!), n: w.round })).join(" · ")}
        </p>
      </Show>
      <div class="mt-2.5 flex justify-center">
        <Show when={out().length > 0} fallback={<span class="g-chip g-chip-green">{t("g.t.allClear")}</span>}>
          <span class="g-chip g-chip-amber">{t("g.t.someOut", { n: out().length })}</span>
        </Show>
      </div>
    </>
  );
}

/* ───────────── After the draw ───────────── */

function Drawn(props: { d: Dashboard; r: DashboardRound; p: PayoutRound; name: (id: string) => string }) {
  const w = () => props.d.members.find(m => m.member_id === props.p.winner_member_id);
  const iWon = () => props.p.winner_member_id === props.d.me.member_id;
  const status = () => props.p.status === "confirmed" ? t("round.received", { name: props.name(props.p.winner_member_id) })
    : props.p.status === "paid" ? t("round.waitingConfirm", { name: props.name(props.p.winner_member_id) })
    : props.p.status === "disputed" ? t("c.disputed") : "";
  return (
    <Stack front={
      <div class="g-rise relative flex h-full flex-col items-center p-4 text-center">
        <p class="g-serif self-start text-[18px]">{t("g.t.winner")}</p>
        <p class="absolute end-4 top-[18px] text-[15px] font-bold">R{props.r.round}</p>
        <div class="mt-6"><GAvatar name={w()?.name ?? "?"} seed={w()?.user_id} size={88} border={3} /></div>
        <p class="g-serif mt-3 text-[24px]">{w()?.name ?? "—"}</p>
        <p class="mt-1 text-[13px]" style={{ color: "var(--g-muted)" }}>{iWon() ? t("g.t.youTake") : t("g.t.takes")}</p>
        <Show when={status()}><span class={["g-chip mt-3", props.p.status === "confirmed" ? "g-chip-green" : props.p.status === "disputed" ? "g-chip-red" : "g-chip-amber"]}>{status()}</span></Show>
        <p class="absolute bottom-[18px] end-4 text-[14px] font-bold">{dateShort(props.r.toss_date)}</p>
      </div>
    } left={null} right={null} />
  );
}

/** The fanned card stack from the design: two back cards each side, glass card in front. */
function Stack(props: { front: import("@solidjs/web").JSX.Element; left: { name: string; initial: string } | null; right: { name: string; initial: string } | null }) {
  const back = (side: "l" | "r", outer: boolean, who: { initial: string } | null) => {
    const w = outer ? 170 : 196;
    const h = outer ? 232 : 260;
    const dx = (outer ? 92 : 53) * (side === "l" ? -1 : 1);
    return (
      <div aria-hidden="true" class="absolute rounded-[26px]"
        style={{
          width: `${w}px`, height: `${h}px`, top: `${outer ? 32 : 18}px`, left: `calc(50% - ${w / 2}px + ${dx}px)`,
          "background-image": "var(--g-toss-card)", opacity: 0.75, border: "1px solid var(--g-card-border)",
          "box-shadow": "var(--g-card-shadow)"
        }}>
        <span class="g-serif absolute top-4 text-[17px]" style={{ [side === "l" ? "left" : "right"]: "11px", color: "var(--g-ink-2)" }}>{who ? [...who.initial][0]?.toUpperCase() : ""}</span>
        <span class="absolute bottom-4 text-[14px] font-bold" style={{ [side === "l" ? "left" : "right"]: "11px", color: "var(--g-ink-2)" }}>••</span>
      </div>
    );
  };
  return (
    <div class="relative mx-auto mt-6 h-[318px] w-full max-w-[390px] overflow-visible">
      <Show when={props.left}>{l => (
        <p class="absolute -top-1 start-1 text-center" aria-hidden="true">
          <span class="g-serif block text-[13px]" style={{ color: "var(--g-muted)" }}>{l().name}</span>
          <span class="block text-[9.5px]" style={{ color: "var(--g-faint)" }}>{t("g.t.inDraw")}</span>
        </p>
      )}</Show>
      <Show when={props.right}>{r => (
        <p class="absolute -top-1 end-1 text-center" aria-hidden="true">
          <span class="g-serif block text-[13px]" style={{ color: "var(--g-muted)" }}>{r().name}</span>
          <span class="block text-[9.5px]" style={{ color: "var(--g-faint)" }}>{t("g.t.inDraw")}</span>
        </p>
      )}</Show>
      <div class="absolute inset-x-0 top-7 h-[300px]">
        {back("l", true, props.left)}{back("r", true, props.right)}
        {back("l", false, props.left)}{back("r", false, props.right)}
        <div class="absolute top-0 h-[300px] w-[228px] rounded-[30px]"
          style={{ left: "calc(50% - 114px)", "background-image": "var(--g-toss-card)", border: "1px solid var(--g-card-border)", "box-shadow": "0 18px 20px rgb(0 0 0 / 0.1)", "-webkit-backdrop-filter": "blur(15px)", "backdrop-filter": "blur(15px)" }}>
          {props.front}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Bottom bar: slide to toss (organizer, on toss day) ───────────── */

function BottomBar(props: { d: Dashboard; r: DashboardRound; p: PayoutRound | null; eligible: number; onDraw: () => Promise<void>; onHelp: () => void }) {
  const canDraw = () => isOrganizer(props.d) && !props.p && props.d.today >= props.r.toss_date && props.eligible > 0;
  const info = () => props.p ? null
    : isOrganizer(props.d) ? t("g.t.on", { date: dateShort(props.r.toss_date) })
    : t("g.t.organizerDraws", { date: dateShort(props.r.toss_date) });
  return (
    <>
      <Halo w={64} label={t("common.back")} onClick={() => navigate("/", { replace: true, direction: "none" })}><GIcon.undo /></Halo>
      <Show when={canDraw()} fallback={
        <Show when={props.p} fallback={
          <div class="g-halo flex-1" style={{ height: "64px" }}><span class="g-core px-3 text-center text-[13px]" style={{ color: "var(--g-muted)" }}>{info()}</span></div>
        }>
          <a href={`/c/${props.d.committee.id}/round/${props.r.round}`} class="g-halo flex-1" style={{ height: "64px" }}
            onClick={e => { e.preventDefault(); tick(); navigate(`/c/${props.d.committee.id}/round/${props.r.round}`); }}>
            <span class="g-core text-[14px] font-medium">{t("g.t.details")} <GIcon.arrow /></span>
          </a>
        </Show>
      }>
        <SlideToConfirm label={t("g.t.slide")} busyLabel={t("g.t.drawing")} chevrons onConfirm={props.onDraw} />
      </Show>
      <Halo w={64} label={t("g.p.help")} onClick={props.onHelp}><GIcon.help /></Halo>
    </>
  );
}
