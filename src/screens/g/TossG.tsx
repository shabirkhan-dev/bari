import { createMemo, createSignal, Errored, For, Loading, onCleanup, refresh, Show } from "solid-js";
import { drawToss, getDashboard, payoutRound, tossEligibility, type Dashboard, type DashboardRound, type Eligibility, type PayoutRound } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { freshness } from "../../lib/live";
import { navigate } from "../../lib/router";
import { clock, dateShort, lang, money, t } from "../../i18n";
import { useTossChannel, type LiveEvent } from "../../lib/liveToss";
import { pickWinner } from "../../domain/toss";
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
  // The round in play: one drawn but not yet confirmed received, else the next to draw.
  const nextRound = () => props.d.rounds.find(r => r.status === "drawn" || r.status === "paid" || r.status === "disputed") ?? props.d.rounds.find(r => r.status === null) ?? props.d.rounds.at(-1)!;
  const [picked, setPicked] = createSignal<number | null>(null);
  const [choosing, setChoosing] = createSignal(false);
  const [help, setHelp] = createSignal(false);
  const r = () => props.d.rounds.find(x => x.round === (picked() ?? nextRound().round)) ?? nextRound();
  const cid = () => props.d.committee.id;

  const payout = createMemo(() => { freshness(); return payoutRound(cid(), r().round); });
  const elig = createMemo(() => { freshness(); return tossEligibility(cid(), r().round); });
  const [error, setError] = createSignal("");
  const [live, setLive] = createSignal<{ mode: "host" | "watch"; ids: string[] } | null>(null);
  const [record, setRecord] = createSignal(false);

  const channel = useTossChannel(props.d.committee.id, (e: LiveEvent) => {
    if (e.type === "countdown" && e.round === r().round) setLive({ mode: "watch", ids: e.ids });
    else if (e.type === "cancel") setLive(null);
    else if (e.type === "drawn") { setLive(null); refresh(payout); refresh(elig); props.onDone(); }
  });

  // Organizer: slide → live countdown everyone sees → the server draws → result for all.
  const startLive = async () => {
    const ids = elig().filter(e => e.eligible).map(e => e.member_id);
    setError("");
    setLive({ mode: "host", ids });
    channel.send({ type: "countdown", round: r().round, ids });
  };
  const cancelLive = () => { channel.send({ type: "cancel" }); setLive(null); };
  const draw = async () => {
    try {
      await drawToss(cid(), r().round, "app");
      channel.send({ type: "drawn", round: r().round });
      refresh(payout);
      refresh(elig);
      props.onDone();
    } catch (e) { setError(describeError(e)); channel.send({ type: "cancel" }); }
    finally { setLive(null); }
  };

  const name = (memberId: string | null | undefined) => {
    if (memberId === props.d.me.member_id) return t("g.you");
    return firstName(props.d.members.find(m => m.member_id === memberId)?.name ?? "—");
  };

  return (
    <Show when={!live()} fallback={
      <LiveToss d={props.d} r={r()} ids={live()!.ids} mode={live()!.mode} watching={channel.watching()}
        onCancel={cancelLive} onFinish={draw} />
    }>
    <GScreen title={t("g.t.title")} bottom={
      <Loading fallback={<div class="h-16 flex-1" />}>
        <BottomBar d={props.d} r={r()} p={payout()} eligible={elig().filter(e => e.eligible).length} onDraw={startLive}
          onHelp={() => setHelp(true)} name={name} />
      </Loading>
    }>
      <div class="mt-3 flex justify-center">
        <SwitchPill chip={String(r().round)} onClick={() => setChoosing(true)} label={t("g.l.pickRound")}>
          <span class="text-[12px] font-semibold">{t("g.t.roundOf", { n: r().round, total: props.d.rounds.length })}</span>
          <span class="text-[12px]" style={{ color: "var(--g-faint)" }}>· {dateShort(r().toss_date)}</span>
        </SwitchPill>
      </div>

      <Errored fallback={err => <div class="mt-6"><GNote tone="error">{describeError(err())}</GNote></div>}>
        <Loading fallback={<div class="mt-6"><GSkeleton h={300} count={1} /></div>}>
          <Show when={payout()} fallback={
            <>
              <section class="mt-3 flex flex-col items-center text-center">
                <p class="g-serif text-[20px]" style={{ color: "var(--g-ink-2)" }}>{t("g.t.pot")}</p>
                <GMoney paisa={props.d.committee.payout_paisa} size={46} class="mt-1" hideable />
              </section>
              <Draw d={props.d} r={r()} elig={elig()} name={name} />
            </>
          }>
            {p => (
              <>
                <Result d={props.d} r={r()} p={p()} name={name} onRecord={() => setRecord(true)} />
                <RecordSheet open={record()} onClose={() => setRecord(false)} d={props.d} p={p()} />
              </>
            )}
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
    </Show>
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

/* ───────────── After the draw (Figma "Toss result") ───────────── */

const recordCode = (p: PayoutRound) => `R${p.round}-${String((p.random_value ?? 0) % 10000).padStart(4, "0")}`;

function Result(props: { d: Dashboard; r: DashboardRound; p: PayoutRound; name: (id: string) => string; onRecord: () => void }) {
  const w = () => props.d.members.find(m => m.member_id === props.p.winner_member_id);
  const status = () => {
    const by = firstName(props.d.committee.account_title);
    switch (props.p.status) {
      case "confirmed": return { cls: "g-chip-green", text: t("tr.confirmed", { name: props.name(props.p.winner_member_id) }) };
      case "paid": return { cls: "g-chip-green", text: t("tr.paidBy", { name: by }) };
      case "disputed": return { cls: "g-chip-red", text: t("c.disputed") };
      default: return { cls: "g-chip-amber", text: t("tr.waiting") };
    }
  };
  const confetti = [[-150, 20, 12, "#19c39f"], [-125, 2, -30, "#d9871a"], [-160, 95, 40, "#9a9a96"], [140, -2, 20, "#19c39f"], [158, 12, -18, "#9a9a96"],
    [-160, 230, 64, "#19c39f"], [150, 112, 30, "#19c39f"], [165, 195, -40, "#d9871a"], [-130, 330, 22, "#19c39f"], [130, 335, -30, "#d9871a"], [-170, 100, -10, "#d9871a"]] as const;
  return (
    <>
      <p class="g-serif mt-4 text-center text-[20px]" style={{ color: "var(--g-ink-2)" }}>{t("tr.goesTo")}</p>
      <div class="relative mx-auto mt-3 h-[342px] w-full max-w-[390px]">
        <For each={[...confetti]}>{([x, y, rot, color]) => (
          <span aria-hidden="true" class="g-rise absolute h-[12px] w-[6px] rounded-[2px]"
            style={{ left: `calc(50% + ${x}px)`, top: `${y}px`, transform: `rotate(${rot}deg)`, background: color, opacity: 0.85 }} />
        )}</For>
        <div aria-hidden="true" class="absolute top-[28px] h-[284px] w-[300px] rounded-[30px]"
          style={{ left: "calc(50% - 150px)", "background-image": "var(--g-toss-card)", opacity: 0.6, border: "1px solid var(--g-card-border)" }} />
        <div class="g-rise absolute top-0 flex h-[340px] w-[256px] flex-col items-center rounded-[30px] px-4 pt-4 text-center"
          style={{ left: "calc(50% - 128px)", "background-image": "var(--g-toss-card)", border: "1px solid var(--g-card-border)", "box-shadow": "0 18px 20px rgb(0 0 0 / 0.1)" }}>
          <div class="flex w-full items-center justify-between">
            <p class="g-serif text-[16px]" style={{ color: "var(--g-muted)" }}>{t("g.t.winner")}</p>
            <p class="text-[15px] font-bold">R{props.r.round}</p>
          </div>
          <span class="mt-3 grid h-[112px] w-[112px] place-items-center rounded-full border-2 border-dotted" style={{ "border-color": "var(--g-chip)" }}>
            <GAvatar name={w()?.name ?? "?"} seed={w()?.user_id} size={92} border={3} />
          </span>
          <p class="g-serif mt-4 text-[24px]">{w()?.name ?? "—"}</p>
          <GMoney paisa={props.p.payout?.amount_paisa ?? props.d.committee.payout_paisa} size={30} noCents class="mt-2" />
          <span class={["g-chip mt-4", status().cls]}>{status().text}</span>
        </div>
      </div>
      <p class="mt-2 text-center text-[12px]" style={{ color: "var(--g-muted)" }}>
        {props.p.draw_method === "app"
          ? t("tr.drawnAt", { time: clock(props.p.drawn_at), n: props.p.eligible_member_ids.length })
          : t("tr.manualAt", { time: clock(props.p.drawn_at) })}
      </p>
      <button type="button" class="g-card mt-4 flex h-[80px] w-full items-center gap-3 px-3.5 text-start" onClick={() => { tick(); props.onRecord(); }}>
        <Halo w={52}><span style={{ color: "var(--g-emerald)" }}><GIcon.shield /></span></Halo>
        <span class="min-w-0 flex-1">
          <span class="g-serif block text-[17px]">{t("tr.record", { code: recordCode(props.p) })}</span>
          <span class="mt-0.5 block text-[12px]" style={{ color: "var(--g-muted)" }}>{t("tr.recheck")}</span>
        </span>
        <span class="pe-1" style={{ color: "var(--g-muted)" }}><GIcon.arrow /></span>
      </button>
    </>
  );
}

/** Lets anyone re-check an app draw: the sorted eligible list, the random number and the seat. */
function RecordSheet(props: { open: boolean; onClose: () => void; d: Dashboard; p: PayoutRound }) {
  const sorted = () => [...props.p.eligible_member_ids].sort();
  const name = (id: string) => props.d.members.find(m => m.member_id === id)?.name ?? "?";
  const seat = () => {
    if (props.p.random_value === null) return null;
    const w = pickWinner(sorted(), props.p.random_value);
    return w === props.p.winner_member_id ? sorted().indexOf(w) + 1 : null;
  };
  return (
    <GSheet open={props.open} onClose={props.onClose} label={t("tr.recordTitle")}>
      <h2 class="g-serif text-[24px]">{t("tr.recordTitle")}</h2>
      <Show when={props.p.draw_method === "app" && seat()} fallback={<p class="text-[14px]" style={{ color: "var(--g-ink-2)" }}>{t("round.howManual")}</p>}>
        <p class="text-[14px] leading-relaxed" style={{ color: "var(--g-ink-2)" }}>
          {t("tr.recordBody", {
            list: sorted().map((id, i) => `${i + 1}. ${name(id)}`).join(", "),
            value: props.p.random_value!, n: sorted().length, rem: props.p.random_value! % sorted().length, seat: seat()!
          })}
        </p>
      </Show>
      <WideHalo h={56} href={`/c/${props.d.committee.id}/round/${props.p.round}`}><span class="text-[14px] font-medium">{t("g.t.details")}</span></WideHalo>
    </GSheet>
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

/* ───────────── Bottom bar ───────────── */

function BottomBar(props: {
  d: Dashboard; r: DashboardRound; p: PayoutRound | null; eligible: number; onDraw: () => Promise<void>; onHelp: () => void;
  name: (id: string) => string;
}) {
  const canDraw = () => isOrganizer(props.d) && !props.p && props.d.today >= props.r.toss_date && props.eligible > 0;
  const info = () => isOrganizer(props.d) ? t("g.t.on", { date: dateShort(props.r.toss_date) }) : t("g.t.organizerDraws", { date: dateShort(props.r.toss_date) });
  const cid = () => props.d.committee.id;
  const share = async () => {
    const p = props.p!;
    const text = t("tr.shareText", { committee: props.d.committee.name, name: props.d.members.find(m => m.member_id === p.winner_member_id)?.name ?? "", n: p.round, amount: money(props.d.committee.payout_paisa) });
    try { if (navigator.share) await navigator.share({ text }); else await navigator.clipboard.writeText(text); } catch { /* cancelled */ }
  };
  const iWon = () => props.p?.winner_member_id === props.d.me.member_id;
  return (
    <Show when={props.p} fallback={
      <>
        <Halo w={64} label={t("common.back")} onClick={() => navigate("/", { replace: true, direction: "none" })}><GIcon.undo /></Halo>
        <Show when={canDraw()} fallback={
          <div class="g-halo flex-1" style={{ height: "64px" }}><span class="g-core px-3 text-center text-[13px]" style={{ color: "var(--g-muted)" }}>{info()}</span></div>
        }>
          <SlideToConfirm label={t("g.t.slide")} busyLabel={t("g.t.drawing")} chevrons onConfirm={props.onDraw} />
        </Show>
        <Halo w={64} label={t("g.p.help")} onClick={props.onHelp}><GIcon.help /></Halo>
      </>
    }>
      {p => (
        <>
          <button type="button" class="g-halo w-[44%] shrink-0" style={{ height: "64px" }} onClick={() => { tick(); void share(); }}>
            <span class="g-core justify-start gap-2.5 ps-[5px]">
              <span class="grid h-10 w-10 place-items-center rounded-full border border-dashed" style={{ "border-color": "var(--g-dash)" }}><GIcon.share /></span>
              <span class="text-[14px] font-medium">{t("tr.share")}</span>
            </span>
          </button>
          <Show when={p().status === "drawn" && isOrganizer(props.d)} fallback={
            <Show when={p().status === "paid" && iWon()} fallback={
              <WideHalo h={64} dark class="flex-1" onClick={() => navigate("/", { replace: true, direction: "none" })}><span class="text-[15px] font-medium">{t("ps.home")}</span></WideHalo>
            }>
              <WideHalo h={64} dark class="flex-1" href={`/c/${cid()}/round/${p().round}`}><span class="text-[15px] font-medium">{t("tr.confirmArrived")}</span></WideHalo>
            </Show>
          }>
            <WideHalo h={64} dark class="flex-1" href={`/c/${cid()}/payout/${p().round}`}><span class="text-[15px] font-medium">{t("tr.sendPayout")}</span></WideHalo>
          </Show>
        </>
      )}
    </Show>
  );
}

/* ───────────── Live toss (Figma "Live toss") ───────────── */

function LiveToss(props: {
  d: Dashboard; r: DashboardRound; ids: string[]; mode: "host" | "watch"; watching: number;
  onCancel: () => void; onFinish: () => Promise<void>;
}) {
  const [count, setCount] = createSignal(3);
  const [spin, setSpin] = createSignal(0);
  const member = (id: string) => props.d.members.find(m => m.member_id === id);
  const at = (k: number) => props.ids.length ? props.ids[((spin() + k) % props.ids.length + props.ids.length) % props.ids.length]! : "";
  const spinner = setInterval(() => setSpin(n => n + 1), 180);
  const timer = setInterval(() => {
    const next = count() - 1;
    setCount(next);
    if (next <= 0) {
      clearInterval(timer);
      if (props.mode === "host") void props.onFinish();
    }
  }, 1000);
  onCleanup(() => { clearInterval(spinner); clearInterval(timer); });
  const total = () => props.d.members.length;
  const progress = () => (3 - Math.max(0, count())) / 3;

  return (
    <GScreen title={t("g.t.title")} bottom={
      <>
        <Halo w={64} label={t("common.back")} onClick={() => (props.mode === "host" ? props.onCancel() : navigate("/", { replace: true, direction: "none" }))}><GIcon.undo /></Halo>
        <Show when={props.mode === "host" && count() > 0} fallback={
          <div class="g-halo flex-1" style={{ height: "64px" }}><span class="g-core text-[13px]" style={{ color: "var(--g-muted)" }}>{count() > 0 ? t("lt.watch") : t("lt.picked")}</span></div>
        }>
          <button type="button" class="g-halo flex-1" style={{ height: "64px" }} onClick={() => { tick(); props.onCancel(); }}>
            <span class="g-core justify-start gap-3 ps-[5px]">
              <span class="grid h-10 w-10 place-items-center rounded-full border border-dashed" style={{ "border-color": "var(--g-dash)" }}><GIcon.x /></span>
              <span class="text-[14px] font-medium">{t("lt.cancel")}</span>
            </span>
          </button>
        </Show>
      </>
    }>
      <div class="mt-3 flex justify-center">
        <SwitchPill chip={String(props.r.round)} label={t("lt.live", { n: props.r.round })}>
          <span class="text-[12px] font-semibold">{t("lt.live", { n: props.r.round })}</span>
        </SwitchPill>
      </div>
      <h2 class="g-serif mt-3 text-center text-[28px]">{t("lt.drawing")}</h2>
      <div class="mt-2 flex justify-center"><span class="g-chip g-chip-red">{t("lt.watching", { n: props.watching })}</span></div>

      <div class="relative mx-auto mt-5 h-[300px] w-[300px]" aria-live="polite">
        <svg viewBox="0 0 300 300" class="absolute inset-0" aria-hidden="true">
          <circle cx="150" cy="150" r="146" fill="none" stroke="var(--g-faint)" stroke-width="1" stroke-dasharray="2 4" />
          <circle cx="150" cy="150" r="146" fill="none" stroke="var(--g-chip)" stroke-width="3.5" stroke-linecap="round"
            stroke-dasharray={`${2 * Math.PI * 146}`} stroke-dashoffset={`${2 * Math.PI * 146 * (1 - Math.max(0.08, progress()))}`}
            transform="rotate(-90 150 150)" style={{ transition: "stroke-dashoffset 900ms linear" }} />
        </svg>
        <For each={[-1, 1]}>{k => (
          <div aria-hidden="true" class="absolute top-[52px] grid h-[176px] w-[132px] place-items-center rounded-[22px]"
            style={{ [k < 0 ? "left" : "right"]: "16px", "background-image": "var(--g-toss-card)", opacity: 0.75, border: "1px solid var(--g-card-border)" }}>
            <GAvatar name={member(at(k))?.name ?? "?"} seed={member(at(k))?.user_id} size={76} />
          </div>
        )}</For>
        <div class="absolute left-[80px] top-[32px] flex h-[184px] w-[140px] flex-col items-center justify-center gap-3 rounded-[22px]"
          style={{ "background-image": "var(--g-toss-card)", border: "1px solid var(--g-card-border)", "box-shadow": "0 18px 20px rgb(0 0 0 / 0.1)" }}>
          <GAvatar name={member(at(0))?.name ?? "?"} seed={member(at(0))?.user_id} size={72} border={3} />
          <span class="text-[13px] font-medium">{firstName(member(at(0))?.name ?? "")}</span>
        </div>
      </div>

      <p class="g-serif mt-3 text-center text-[22px]">{count() > 0 ? t("lt.picking", { n: count() }) : t("lt.picked")}</p>
      <ul class="mt-4 flex justify-center gap-2.5">
        <For each={props.d.members}>{m => <li><GAvatar name={m.name} seed={m.user_id} size={30} dot={props.ids.includes(m.member_id) ? "paid" : null} /></li>}</For>
      </ul>
      <p class="mt-2 text-center text-[12px]" style={{ color: "var(--g-muted)" }}>
        {props.watching >= total() ? t("lt.allWatching", { n: total() }) : t("lt.someWatching", { n: props.watching, total: total() })}
      </p>
    </GScreen>
  );
}
