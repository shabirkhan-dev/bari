/**
 * Our own date, time and yes/no controls (instead of the browser's), in the glass style.
 * Values are plain strings: dates "YYYY-MM-DD" (Pakistan calendar), times "HH:MM" (24 h).
 */
import { createSignal, For, Show, untrack } from "solid-js";
import { dateLong, lang, t, timeOfDay } from "../i18n";
import { GIcon, GSegmented, GSheet, Halo, WideHalo } from "./glass";
import { tick } from "./kit";

const fieldClass = "flex h-[60px] w-full items-center justify-between gap-3 rounded-[22px] px-5 text-start text-[17px] disabled:opacity-55";
const fieldStyle = { background: "var(--g-card-strong)", border: "1px solid var(--g-card-border)", color: "var(--g-ink)", "box-shadow": "var(--g-card-shadow)" } as const;

/* ───────────── Time ───────────── */

export function TimeField(props: { value: string; onChange: (v: string) => void; label: string; look?: "field" | "halo"; disabled?: boolean }) {
  const [open, setOpen] = createSignal(false);
  return (
    <>
      <Show when={props.look === "halo"} fallback={
        <button type="button" class={fieldClass} style={fieldStyle} disabled={props.disabled} aria-label={`${props.label}: ${timeOfDay(props.value, true)}`}
          onClick={() => { tick(); setOpen(true); }}>
          <span>{timeOfDay(props.value, true)}</span><span style={{ color: "var(--g-muted)" }}><GIcon.clock /></span>
        </button>
      }>
        <button type="button" class="g-halo shrink-0" style={{ height: "48px", width: "116px" }} disabled={props.disabled}
          aria-label={`${props.label}: ${timeOfDay(props.value, true)}`} onClick={() => { tick(); setOpen(true); }}>
          <span class="g-core text-[14px] font-medium">{timeOfDay(props.value, true)}</span>
        </button>
      </Show>
      <TimeSheet open={open()} value={props.value} label={props.label} onClose={() => setOpen(false)} onPick={v => { props.onChange(v); setOpen(false); }} />
    </>
  );
}

function TimeSheet(props: { open: boolean; value: string; label: string; onClose: () => void; onPick: (v: string) => void }) {
  return (
    <GSheet open={props.open} onClose={props.onClose} label={props.label}>
      <TimeBody value={props.value} label={props.label} onPick={props.onPick} />
    </GSheet>
  );
}

function TimeBody(props: { value: string; label: string; onPick: (v: string) => void }) {
  const [h0 = 21, m0 = 0] = untrack(() => props.value).split(":").map(Number);
  const [h12, setH12] = createSignal(h0 % 12 === 0 ? 12 : h0 % 12);
  const [min, setMin] = createSignal([0, 15, 30, 45].includes(m0) ? m0 : Math.round(m0 / 15) * 15 % 60);
  const [pm, setPm] = createSignal(h0 >= 12);
  const value = () => {
    const h = (h12() % 12) + (pm() ? 12 : 0);
    return `${String(h).padStart(2, "0")}:${String(min()).padStart(2, "0")}`;
  };
  const am = () => (lang() === "ur" ? "صبح" : "am");
  const pmL = () => (lang() === "ur" ? "شام" : "pm");
  return (
    <>
      <h2 class="g-serif text-[24px]">{props.label}</h2>
      <p class="g-num text-center text-[44px] leading-none" aria-live="polite">{timeOfDay(value(), true)}</p>
      <div role="radiogroup" aria-label={t("pk.hour")} class="grid grid-cols-6 gap-2" dir="ltr">
        <For each={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}>{h => (
          <button type="button" role="radio" aria-checked={h12() === h ? "true" : "false"} aria-label={String(h)}
            class="h-12 rounded-2xl text-[17px] font-medium transition-colors"
            style={h12() === h ? { background: "var(--g-cta)", color: "var(--g-cta-ink)" } : { background: "var(--g-inner)" }}
            onClick={() => { tick(); setH12(h); }}>{h}</button>
        )}</For>
      </div>
      <GSegmented<number> label={t("pk.minute")} value={min()} onChange={setMin}
        options={[0, 15, 30, 45].map(m => ({ value: m, label: `:${String(m).padStart(2, "0")}` }))} />
      <GSegmented<"am" | "pm"> label="am / pm" value={pm() ? "pm" : "am"} onChange={v => setPm(v === "pm")}
        options={[{ value: "am", label: am() }, { value: "pm", label: pmL() }]} />
      <WideHalo h={60} dark onClick={() => props.onPick(value())}><span class="text-[15px] font-medium">{t("pk.done")}</span></WideHalo>
    </>
  );
}

/* ───────────── Date ───────────── */

export function DateField(props: { value: string; onChange: (v: string) => void; label: string; min?: string; max?: string; disabled?: boolean }) {
  const [open, setOpen] = createSignal(false);
  return (
    <>
      <button type="button" class={fieldClass} style={fieldStyle} disabled={props.disabled} aria-label={`${props.label}: ${dateLong(props.value)}`}
        onClick={() => { tick(); setOpen(true); }}>
        <span>{dateLong(props.value)}</span><span style={{ color: "var(--g-muted)" }}><GIcon.calendar /></span>
      </button>
      <GSheet open={open()} onClose={() => setOpen(false)} label={props.label}>
        <Calendar value={props.value} min={props.min} max={props.max} label={props.label} onPick={v => { props.onChange(v); setOpen(false); }} />
      </GSheet>
    </>
  );
}

const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const fmt = (opts: Intl.DateTimeFormatOptions, d: Date) =>
  new Intl.DateTimeFormat(lang() === "ur" ? "ur-PK" : "en-GB", { ...opts, timeZone: "UTC", numberingSystem: "latn" }).format(d);

export function Calendar(props: { value: string; label: string; min?: string; max?: string; onPick: (v: string) => void }) {
  const [y0, m0] = untrack(() => props.value).split("-").map(Number) as [number, number];
  const [year, setYear] = createSignal(y0);
  const [month, setMonth] = createSignal(m0 - 1); // 0-based
  const [picked, setPicked] = createSignal(untrack(() => props.value));
  const shift = (n: number) => {
    const d = new Date(Date.UTC(year(), month() + n, 1));
    setYear(d.getUTCFullYear()); setMonth(d.getUTCMonth());
  };
  const cells = () => {
    const first = new Date(Date.UTC(year(), month(), 1));
    const lead = (first.getUTCDay() + 6) % 7; // Monday first
    const days = new Date(Date.UTC(year(), month() + 1, 0)).getUTCDate();
    return [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => ymd(year(), month(), i + 1))];
  };
  const UR_DAYS = ["پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ", "اتوار"];
  const weekdays = () => lang() === "ur" ? UR_DAYS
    : Array.from({ length: 7 }, (_, i) => fmt({ weekday: "narrow" }, new Date(Date.UTC(2024, 0, 1 + i)))); // 1 Jan 2024 was a Monday
  const ok = (d: string) => (!props.min || d >= props.min) && (!props.max || d <= props.max);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
  return (
    <>
      <h2 class="g-serif text-[24px]">{props.label}</h2>
      <div class="flex items-center justify-between">
        <Halo w={48} label={t("pk.prev")} onClick={() => shift(-1)}><GIcon.back size={18} /></Halo>
        <p class="g-serif text-[20px]" aria-live="polite">{fmt({ month: "long", year: "numeric" }, new Date(Date.UTC(year(), month(), 1)))}</p>
        <Halo w={48} label={t("pk.next")} onClick={() => shift(1)}><span class="-scale-x-100 rtl:scale-x-100"><GIcon.back size={18} /></span></Halo>
      </div>
      <div class="grid grid-cols-7 gap-1 text-center text-[11px]" style={{ color: "var(--g-muted)" }} aria-hidden="true">
        <For each={weekdays()}>{w => <span>{w}</span>}</For>
      </div>
      <div class="grid grid-cols-7 gap-1" role="grid" aria-label={props.label}>
        <For each={cells()}>{d => (
          <Show when={d} fallback={<span />}>
            <button type="button" disabled={!ok(d!)} aria-pressed={picked() === d ? "true" : "false"} aria-label={dateLong(d!)}
              class="aspect-square rounded-2xl text-[15px] transition-colors disabled:opacity-30"
              style={picked() === d ? { background: "var(--g-cta)", color: "var(--g-cta-ink)" }
                : d === today ? { border: "1px solid var(--g-chip)" } : { background: "var(--g-inner)" }}
              onClick={() => { tick(); setPicked(d!); }}>{Number(d!.slice(8))}</button>
          </Show>
        )}</For>
      </div>
      <WideHalo h={60} dark disabled={!ok(picked())} onClick={() => props.onPick(picked())}>
        <span class="text-[15px] font-medium">{t("pk.choose", { date: dateLong(picked()) })}</span>
      </WideHalo>
    </>
  );
}

/** A small round checkbox in the design's style. */
export function Check(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={props.checked ? "true" : "false"} aria-label={props.label}
      class="grid h-6 w-6 shrink-0 place-items-center rounded-lg transition-colors"
      style={props.checked ? { background: "var(--g-chip)", color: "#fff" } : { border: "1.5px solid var(--g-dash)", background: "var(--g-inner)" }}
      onClick={() => { tick(); props.onChange(!props.checked); }}>
      <Show when={props.checked}><GIcon.check size={14} /></Show>
    </button>
  );
}

