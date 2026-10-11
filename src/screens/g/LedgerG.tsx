import { createMemo, createSignal, Errored, For, Loading, Show } from "solid-js";
import { getDashboard, myLedger, type Dashboard, type Ledger, type LedgerEntry } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { freshness } from "../../lib/live";
import { addDays } from "../../domain/dates";
import { clock, dateShort, lang, money, moneyParts, pktDate, t } from "../../i18n";
import { GAvatar, GIcon, GMoney, GNote, GScreen, GSheet, GSkeleton, Halo, meName } from "../../ui/glass";
import { tick } from "../../ui/kit";
import { periodsLabel } from "./common";

export function LedgerG(props: { id: string }) {
  const dash = createMemo(() => { freshness(); return getDashboard(props.id); });
  const ledger = createMemo(() => { freshness(); return myLedger(props.id); });
  return (
    <GScreen title={t("g.l.title")} nav={props.id}>
      <Errored fallback={err => <GNote tone="error">{describeError(err())}</GNote>}>
        <Loading fallback={<GSkeleton />}>
          <LedgerBody d={dash()} l={ledger()} />
        </Loading>
      </Errored>
    </GScreen>
  );
}

function LedgerBody(props: { d: Dashboard; l: Ledger }) {
  const [picked, setPicked] = createSignal<number | null>(null);
  const [choosing, setChoosing] = createSignal(false);
  const sel = () => picked() ?? props.l.current_round;
  const round = () => props.l.rounds.find(r => r.round === sel());

  return (
    <>
      <div class="mt-3 flex justify-center">
        <button type="button" class="g-halo" style={{ height: "48px" }} onClick={() => { tick(); setChoosing(true); }} aria-label={t("g.l.pickRound")}>
          <span class="relative m-[5px] flex h-[34px] items-center gap-2 rounded-full px-3.5 text-[13px] font-medium" style={{ background: "var(--g-inner)", "box-shadow": "var(--g-inner-shadow)" }}>
            {sel() === props.l.current_round ? t("g.l.thisRound") : t("g.l.round", { n: sel() })}
            <GIcon.caret />
          </span>
        </button>
      </div>

      <section class="mt-3 flex flex-col items-center text-center">
        <p class="g-serif text-[18px]" style={{ color: "var(--g-ink-2)" }}>{t("g.l.paidIn")}</p>
        <GMoney paisa={round()?.paid_paisa ?? 0} size={40} class="mt-1" hideable />
      </section>

      <Chart l={props.l} selected={sel()} onSelect={n => { tick(); setPicked(n); }} />

      <section class="flex flex-col items-center text-center">
        <p class="g-serif text-[18px]" style={{ color: "var(--g-ink-2)" }}>{t("g.l.stillToPay")}</p>
        <GMoney paisa={round()?.unpaid_paisa ?? 0} size={40} class="mt-1" hideable />
        <Show when={(round()?.waiting_paisa ?? 0) > 0}>
          <span class="g-chip g-chip-amber mt-2.5">{t("g.l.waiting", { amount: money(round()!.waiting_paisa) })}</span>
        </Show>
      </section>

      <History d={props.d} l={props.l} />

      <GSheet open={choosing()} onClose={() => setChoosing(false)} label={t("g.l.pickRound")}>
        <h2 class="g-serif text-[24px]">{t("g.l.pickRound")}</h2>
        <ul class="flex flex-col gap-1">
          <For each={props.l.rounds}>{r => (
            <li>
              <button type="button" class="flex w-full items-center gap-3 rounded-[20px] p-2.5 text-start" aria-current={r.round === sel() ? "true" : undefined}
                onClick={() => { tick(); setPicked(r.round); setChoosing(false); }}>
                <span class="g-step h-9 w-9 text-[15px]">{r.round}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-[15px] font-semibold">{r.round === props.l.current_round ? t("g.l.thisRound") : t("g.l.round", { n: r.round })}</span>
                  <span class="block text-[12px]" style={{ color: "var(--g-muted)" }}>{dateShort(r.first_due)} – {dateShort(r.toss_date)}</span>
                </span>
                <span class="text-[13px]" dir="ltr">{money(r.paid_paisa)}</span>
              </button>
            </li>
          )}</For>
        </ul>
      </GSheet>
    </>
  );
}

/* ───────────── Mirrored thin-line chart: paid above, still to pay below ───────────── */

function Chart(props: { l: Ledger; selected: number; onSelect: (n: number) => void }) {
  const W = 390;
  const PAD = 20;
  const TOP = 18;      // room for the amount label
  const UP = 140;      // paid area
  const ROW = 30;      // round labels
  const DOWN = 70;     // still-to-pay area
  const H = TOP + UP + ROW + DOWN + 6;
  const base = TOP + UP;
  const rounds = () => props.l.rounds;
  const slot = () => (W - PAD * 2) / Math.max(1, rounds().length);
  const lines = () => Math.max(4, Math.floor(slot() / 3.85));
  const step = () => slot() / lines();
  // Scale to what was due so far, so a round in progress reads as a share of what was owed.
  const scale = () => Math.max(1, ...rounds().map(r => r.paid_paisa + r.waiting_paisa + r.unpaid_paisa));
  const rtl = () => lang() === "ur";
  const X = (x: number, w = 0) => (rtl() ? W - x - w : x);
  const short = (p: number) => `Rs ${moneyParts(p).whole}`;

  return (
    <div class="-mx-5 mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} direction="ltr" class="block w-full" role="img" aria-label={t("g.l.chart")}>
        <For each={rounds()}>{(r, i) => {
          const x0 = () => PAD + i() * slot();
          const sel = () => r.round === props.selected;
          const future = () => r.first_due > props.l.today;
          const upH = () => (future() ? 22 : Math.max(4, (r.paid_paisa / scale()) * UP));
          // Below the line: still to pay (amber) for the chosen round, a faint reflection otherwise.
          const owes = () => sel() && r.unpaid_paisa > 0;
          const downH = () => (owes() ? Math.max(8, (r.unpaid_paisa / scale()) * DOWN) : Math.max(6, upH() * 0.32));
          const upFill = () => (sel() ? "var(--g-emerald)" : future() ? "var(--g-bar-future)" : "var(--g-bar-up)");
          const downFill = () => (owes() ? "var(--g-amber)" : "var(--g-bar-future)");
          return (
            <g class="cursor-pointer" onClick={() => props.onSelect(r.round)}>
              <rect x={X(x0(), slot())} y={0} width={slot()} height={H} fill="transparent" />
              <For each={Array.from({ length: lines() })}>{(_, j) => (
                <>
                  <rect x={X(x0() + j() * step() + 0.5, 1.3)} y={base - upH()} width="1.3" height={upH()} fill={upFill()} />
                  <rect x={X(x0() + j() * step() + 0.5, 1.3)} y={base + ROW} width="1.3" height={downH()} fill={downFill()} />
                </>
              )}</For>
              <text x={X(x0() + slot() / 2)} y={base + 19} text-anchor="middle" font-size="11" font-family="Manrope, sans-serif"
                font-weight={sel() ? 700 : 400} fill={sel() ? "var(--g-ink)" : "var(--g-faint)"}>R{r.round}</text>
              <Show when={sel() && r.paid_paisa > 0}>
                <text x={X(x0() + slot() + 3)} y={Math.max(11, base - upH() + 10)} text-anchor={rtl() ? "end" : "start"}
                  font-size="10" font-weight="600" font-family="Manrope, sans-serif" fill="var(--g-emerald)">{short(r.paid_paisa)}</text>
              </Show>
              <Show when={owes()}>
                <text x={X(i() === 0 ? x0() + slot() + 3 : x0() - 4)} y={base + ROW + downH() - 1}
                  text-anchor={(i() === 0) !== rtl() ? "start" : "end"}
                  font-size="10" font-weight="600" font-family="Manrope, sans-serif" fill="var(--g-amber)">{short(r.unpaid_paisa)}</text>
              </Show>
            </g>
          );
        }}</For>
      </svg>
    </div>
  );
}

/* ───────────── History ───────────── */

type Filter = "all" | "pending" | "verified" | "rejected";
const FILTERS: Filter[] = ["all", "pending", "verified", "rejected"];

function History(props: { d: Dashboard; l: Ledger }) {
  const [searching, setSearching] = createSignal(false);
  const [q, setQ] = createSignal("");
  const [filter, setFilter] = createSignal<Filter>("all");
  const [all, setAll] = createSignal(false);
  const f = () => props.d.committee.frequency;
  const label = (e: LedgerEntry) => {
    const roundPrefix = e.periods?.length && e.periods[0]!.round !== props.l.current_round ? `R${e.periods[0]!.round} · ` : "";
    return roundPrefix + periodsLabel(f(), e.periods);
  };
  const filterName = (x: Filter) => (x === "all" ? t("g.l.all") : x === "pending" ? t("g.l.pending") : x === "verified" ? t("g.l.verified") : t("g.l.rejected"));

  const rows = createMemo(() => {
    const needle = q().trim().replace(/\s/g, "").toLowerCase();
    return props.l.history.filter(e =>
      (filter() === "all" || e.status === filter() || (filter() === "pending" && e.status === "disputed")) &&
      (!needle || (e.tid ?? "").includes(needle) || label(e).replace(/\s/g, "").toLowerCase().includes(needle)));
  });
  const shown = () => (all() ? rows() : rows().slice(0, 4));
  const groups = createMemo(() => {
    const out: { day: string; items: LedgerEntry[] }[] = [];
    for (const e of shown()) {
      const day = pktDate(e.created_at);
      const g = out.at(-1);
      if (g && g.day === day) g.items.push(e); else out.push({ day, items: [e] });
    }
    return out;
  });
  const dayName = (d: string) => (d === props.l.today ? t("g.l.today") : d === addDays(props.l.today, -1) ? t("g.l.yesterday") : dateShort(d));

  return (
    <section class="g-card mt-6 px-4 pb-3 pt-4">
      <div class="flex items-center gap-1.5">
        <h2 class="g-serif flex-1 text-[22px]">{t("g.l.history")}</h2>
        <Halo w={48} label={t("g.l.search")} pressed={searching()} onClick={() => { setSearching(!searching()); if (searching()) setQ(""); }}><GIcon.search /></Halo>
        <Halo w={48} label={t("g.l.filter", { what: filterName(filter()) })} pressed={filter() !== "all"}
          onClick={() => setFilter(FILTERS[(FILTERS.indexOf(filter()) + 1) % FILTERS.length]!)}><GIcon.filter /></Halo>
        <Show when={rows().length > 4}>
          <Halo w={78} h={48} onClick={() => setAll(!all())}><span class="text-[12px]">{all() ? t("g.l.less") : t("g.l.viewAll")}</span></Halo>
        </Show>
      </div>
      <Show when={searching()}>
        <input class="mt-3 h-11 w-full rounded-2xl px-4 text-[14px] outline-none" style={{ background: "var(--g-inner)", color: "var(--g-ink)" }}
          placeholder={t("g.l.search")} aria-label={t("g.l.search")} value={q()} onInput={e => setQ(e.currentTarget.value)} data-autofocus />
      </Show>
      <Show when={filter() !== "all"}><span class="g-chip g-chip-plain mt-3" style={{ background: "var(--g-inner)" }}>{filterName(filter())}</span></Show>

      <Show when={rows().length > 0} fallback={<p class="py-6 text-center text-[13px]" style={{ color: "var(--g-muted)" }}>{t("g.l.empty")}</p>}>
        <For each={groups()}>{g => (
          <div class="mt-3">
            <p class="text-[11px]" style={{ color: "var(--g-faint)" }}>{dayName(g.day)}</p>
            <ul>
              <For each={g.items}>{e => <Row e={e} label={label(e)} />}</For>
            </ul>
          </div>
        )}</For>
      </Show>
    </section>
  );
}

function Row(props: { e: LedgerEntry; label: string }) {
  const who = () => (props.e.paid_by_name ? t("g.l.paidBy", { name: props.e.paid_by_name }) : t("g.you"));
  const status = () => {
    switch (props.e.status) {
      case "verified": return { word: t("g.l.verified"), color: "var(--g-emerald)", sub: t("g.l.verifiedAt", { time: clock(props.e.decided_at ?? props.e.created_at) }) };
      case "rejected": return { word: t("g.l.rejected"), color: "var(--g-red)", sub: t("g.l.rejectedWhy", { reason: props.e.decision_reason ?? "" }) };
      case "disputed": return { word: t("g.l.disputed"), color: "var(--g-red)", sub: props.e.decision_reason ?? "" };
      default: return { word: t("g.l.pending"), color: "var(--g-amber)", sub: t("g.l.pendingCheck", { time: clock(props.e.created_at) }) };
    }
  };
  return (
    <li class="flex items-center gap-3 py-2.5">
      <GAvatar name={props.e.paid_by_name ?? (meName() || "?")} size={42} />
      <div class="min-w-0 flex-1">
        <p class="g-serif truncate text-[17px]">{props.label}{props.label ? " · " : ""}{who()}</p>
        <p class="truncate text-[12px]" style={{ color: "var(--g-faint)" }}>{status().sub}</p>
      </div>
      <div class="shrink-0 text-end">
        <GMoney paisa={props.e.amount_paisa} size={16} />
        <p class="mt-1 text-[12px]" style={{ color: status().color }}>{status().word}</p>
      </div>
    </li>
  );
}
