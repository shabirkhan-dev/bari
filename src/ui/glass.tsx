/**
 * Glass design system from the Figma file "Bari — App UI/UX": halos (frosted ring +
 * dashed ring + solid core), glass cards, serif money with grey decimals, gradient
 * avatars, slide-to-confirm, and the four-tab bottom bar.
 */
import { createMemo, createSignal, For, Loading, Show } from "solid-js";
import { Portal, type JSX } from "@solidjs/web";
import { back, navigate, path } from "../lib/router";
import { unreadCount } from "../lib/api";
import { unreadStamp } from "../lib/unread";
import { freshness } from "../lib/live";
import { hidden } from "../lib/current";
import { lang, moneyParts, t } from "../i18n";
import type { Paisa } from "../domain/money";
import { tick } from "./kit";

/* ───────────── Icons (redrawn from the Figma frames as inline SVG) ───────────── */

const svg = (size: number, children: JSX.Element, sw = 1.7, extra?: string) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={sw}
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class={extra}>{children}</svg>
);
type IP = { size?: number };
export const GIcon = {
  bell: (p: IP) => svg(p.size ?? 20, <><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9z" /><path d="M10.2 20.5a2 2 0 0 0 3.6 0" /></>),
  home: (p: IP) => svg(p.size ?? 18, <><path d="M4 10.2 12 4l8 6.2V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" /></>),
  ledger: (p: IP) => svg(p.size ?? 18, <><path d="M4 20h16" /><path d="M7 16V9" /><path d="M12 16V5" /><path d="M17 16v-4" /></>),
  toss: (p: IP) => svg(p.size ?? 18, <><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" /><circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" /></>),
  members: (p: IP) => svg(p.size ?? 18, <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><path d="M15.5 5.2a3 3 0 0 1 0 5.6" /><path d="M17.5 14.3c1.6.6 2.7 2.2 3 4.7" /></>),
  eye: (p: IP) => svg(p.size ?? 20, <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>),
  eyeOff: (p: IP) => svg(p.size ?? 20, <><path d="M3 3l18 18" /><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.8 3.6M6.6 6.7A16.7 16.7 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>),
  copy: (p: IP) => svg(p.size ?? 16, <><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>),
  image: (p: IP) => svg(p.size ?? 18, <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9.5" cy="9.5" r="1.6" /><path d="M20 15.5 15.5 11 6 20" /></>),
  undo: (p: IP) => svg(p.size ?? 20, <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>, 1.7, "rtl:-scale-x-100"),
  help: (p: IP) => svg(p.size ?? 20, <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.3-2.5 3.8" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></>),
  check: (p: IP) => svg(p.size ?? 18, <path d="M5 12.5l4.3 4.3L19 7.2" />, 2.2),
  arrow: (p: IP) => svg(p.size ?? 18, <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>, 2, "rtl:-scale-x-100"),
  back: (p: IP) => svg(p.size ?? 20, <path d="M15 18l-6-6 6-6" />, 2, "rtl:-scale-x-100"),
  caret: (p: IP) => (
    <svg width={p.size ?? 10} height={p.size ?? 10} viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5h6L5 7z" fill="currentColor" /></svg>
  ),
  search: (p: IP) => svg(p.size ?? 16, <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></>, 2),
  filter: (p: IP) => svg(p.size ?? 16, <><path d="M4 7h16" /><path d="M7 12h10" /><path d="M10 17h4" /></>, 2),
  x: (p: IP) => svg(p.size ?? 16, <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>, 2),
  plus: (p: IP) => svg(p.size ?? 18, <><path d="M12 5v14" /><path d="M5 12h14" /></>, 2),
  key: (p: IP) => svg(p.size ?? 18, <><circle cx="8.5" cy="12" r="4" /><path d="M12.5 12H21" /><path d="M18 12v3" /></>, 1.8),
  google: (p: IP) => (
    <svg width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9z" />
    </svg>
  )
};

/* ───────────── Who is signed in (for the header avatar) ───────────── */

const [meName, setMeName] = createSignal("");
export { meName, setMeName };

/* ───────────── Halo ───────────── */

export function Halo(props: {
  w: number; h?: number; dark?: boolean; label?: string; href?: string; onClick?: () => void;
  disabled?: boolean; class?: string; coreClass?: string; children: JSX.Element; pressed?: boolean;
}) {
  const style = () => ({ width: `${props.w}px`, height: `${props.h ?? props.w}px` });
  const core = () => <span class={["g-core", props.dark && "g-core-dark", props.coreClass]}>{props.children}</span>;
  return (
    <Show when={props.href || props.onClick} fallback={<span class={["g-halo", props.class]} style={style()} aria-label={props.label}>{core()}</span>}>
      <Show when={props.href} fallback={
        <button type="button" class={["g-halo", props.class]} style={style()} aria-label={props.label} disabled={props.disabled}
          aria-pressed={props.pressed === undefined ? undefined : props.pressed ? "true" : "false"}
          onClick={() => { tick(); props.onClick?.(); }}>{core()}</button>
      }>
        <a href={props.href} class={["g-halo", props.class]} style={style()} aria-label={props.label}
          onClick={e => { e.preventDefault(); tick(); props.onClick ? props.onClick() : navigate(props.href!); }}>{core()}</a>
      </Show>
    </Show>
  );
}

/** A halo that stretches to its container (CTA buttons, pills). */
export function WideHalo(props: { h: number; dark?: boolean; onClick?: () => void; href?: string; disabled?: boolean; class?: string; children: JSX.Element; label?: string }) {
  const inner = () => <span class={["g-core", props.dark && "g-core-dark"]}>{props.children}</span>;
  return (
    <Show when={props.href} fallback={
      <button type="button" class={["g-halo w-full", props.class]} style={{ height: `${props.h}px` }} disabled={props.disabled} aria-label={props.label}
        onClick={() => { tick(); props.onClick?.(); }}>{inner()}</button>
    }>
      <a href={props.href} class={["g-halo w-full", props.class]} style={{ height: `${props.h}px` }} aria-label={props.label}
        onClick={e => { e.preventDefault(); tick(); navigate(props.href!); }}>{inner()}</a>
    </Show>
  );
}

/* ───────────── Money ───────────── */

/** "Rs 30,000" + ".00" in light grey; Newsreader. Respects "hide amounts" when `hideable`. */
export function GMoney(props: { paisa: Paisa; size: number; prefix?: boolean; hideable?: boolean; class?: string; tight?: number; plainCents?: boolean }) {
  const p = () => moneyParts(props.paisa);
  const masked = () => !!props.hideable && hidden();
  return (
    <span dir="ltr" class={["g-num inline-block whitespace-nowrap leading-none", props.class]}
      style={{ "font-size": `${props.size}px`, "letter-spacing": `${props.tight ?? -0.025}em` }}>
      <Show when={!masked()} fallback={<>{props.prefix === false ? "" : "Rs "}<span aria-label="hidden">••••</span></>}>
        {props.prefix === false ? "" : "Rs "}{p().whole}<span style={props.plainCents ? undefined : { color: "var(--g-decimal)" }}>.{p().cents}</span>
      </Show>
    </span>
  );
}

/* ───────────── Avatar ───────────── */

const GRADS = [
  ["#f1ece3", "#d8cdba"], ["#e7e2d8", "#cfc6b6"], ["#dce3ea", "#b9c5d2"], ["#d8ece5", "#a9d6c6"], ["#e4e2ec", "#c4c0d4"]
] as const;
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const initial = (name: string) => ([...name.trim()][0] ?? "?").toUpperCase();

export function GAvatar(props: { name: string; seed?: string; size: number; dot?: "paid" | "due" | null; faded?: boolean; border?: number }) {
  const g = () => GRADS[hash(props.seed ?? props.name) % GRADS.length]!;
  return (
    <span aria-hidden="true" class="g-avatar"
      style={{
        width: `${props.size}px`, height: `${props.size}px`, "font-size": `${Math.round(props.size * 0.42)}px`,
        "background-image": `linear-gradient(135deg, ${g()[0]} 14%, ${g()[1]} 86%)`,
        opacity: props.faded ? 0.35 : 1, "border-width": props.border ? `${props.border}px` : undefined
      }}>
      {initial(props.name)}
      <Show when={props.dot}>
        <span class="g-dot" style={{ background: props.dot === "paid" ? "var(--g-emerald)" : "var(--g-amber)" }} />
      </Show>
    </span>
  );
}

/* ───────────── Screen frame ───────────── */

export function Bell() {
  const count = createMemo(() => { unreadStamp(); freshness(); return unreadCount().catch(() => 0); });
  const bell = (n: number) => (
    <Halo w={56} href="/inbox" label={n > 0 ? `${t("inbox.title")} (${n})` : t("inbox.title")}>
      <span class="relative grid place-items-center">
        <GIcon.bell />
        <Show when={n > 0}><span class="absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full" style={{ background: "var(--g-chip)" }} /></Show>
      </span>
    </Halo>
  );
  return <Loading fallback={bell(0)}>{bell(count())}</Loading>;
}

export function GScreen(props: {
  title?: string; left?: "me" | "back"; backTo?: string; children: JSX.Element;
  bottom?: JSX.Element; nav?: string | null; class?: string;
}) {
  return (
    <div class="g flex flex-col">
      <header class="relative z-10 flex items-center justify-between px-5 pt-[calc(12px+env(safe-area-inset-top))]">
        <Show when={props.left === "back"} fallback={
          <Halo w={56} href="/me" label={t("tabs.me")}>
            <GAvatar name={meName() || "?"} size={42} />
          </Halo>
        }>
          <Halo w={56} label={t("common.back")} onClick={() => back(props.backTo)}><GIcon.back /></Halo>
        </Show>
        <Show when={props.title} fallback={<span class="g-word text-[26px] leading-none" lang="en">bari</span>}>
          <h1 class="g-serif min-w-0 truncate px-2 text-[28px] leading-tight">{props.title}</h1>
        </Show>
        <Bell />
      </header>
      <main class={["flex flex-1 flex-col px-5 pt-3",
        props.nav !== undefined ? "pb-[calc(104px+env(safe-area-inset-bottom))]" : props.bottom ? "pb-[calc(100px+env(safe-area-inset-bottom))]" : "pb-[calc(24px+env(safe-area-inset-bottom))]",
        props.class]}>
        {props.children}
      </main>
      <Show when={props.bottom}>
        <div class="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[480px] -translate-x-1/2 items-center gap-1.5 px-5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-4"
          style={{ background: "linear-gradient(to top, var(--g-bg) 55%, transparent)" }}>
          {props.bottom}
        </div>
      </Show>
      <Show when={props.nav !== undefined}><BottomNav committeeId={props.nav ?? null} /></Show>
    </div>
  );
}

/* ───────────── Bottom navigation ───────────── */

export function BottomNav(props: { committeeId: string | null }) {
  const tabs = () => [
    { to: "/", label: t("g.tab.home"), icon: GIcon.home },
    { to: "/ledger", label: t("g.tab.ledger"), icon: GIcon.ledger },
    { to: "/toss", label: t("g.tab.toss"), icon: GIcon.toss },
    { to: props.committeeId ? `/c/${props.committeeId}` : "/", label: t("g.tab.members"), icon: GIcon.members }
  ];
  return (
    <div class="fixed bottom-0 left-1/2 z-30 w-full max-w-[480px] -translate-x-1/2 px-5 pb-[calc(10px+env(safe-area-inset-bottom))] pt-3"
      style={{ "view-transition-name": "dock", background: "linear-gradient(to top, var(--g-bg) 40%, transparent)" }}>
      <nav aria-label="Main" class="g-halo w-full" style={{ height: "70px" }}>
        <span class="g-core justify-between px-0" style={{ gap: "0" }}>
          <For each={tabs()}>{(tab, i) => {
            const active = () => (i() < 3 ? path() === tab.to : false);
            return (
              <a href={tab.to} aria-current={active() ? "page" : undefined}
                class="flex h-full flex-1 flex-col items-center justify-center gap-1 rounded-full text-[11px] font-medium transition-colors"
                style={active() ? { background: "var(--g-cta)", color: "var(--g-cta-ink)" } : { color: "var(--g-ink)" }}
                onClick={e => { e.preventDefault(); tick(); navigate(tab.to, { replace: i() < 3, direction: i() < 3 ? "none" : "forward" }); }}>
                <tab.icon />
                <span>{tab.label}</span>
              </a>
            );
          }}</For>
        </span>
      </nav>
    </div>
  );
}

/* ───────────── Controls ───────────── */

export function GSegmented<T extends string | number>(props: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div class="g-halo w-full" style={{ height: "52px" }}>
      <div role="radiogroup" aria-label={props.label} class="g-core grid grid-flow-col auto-cols-fr gap-0 p-0">
        <For each={props.options}>{o => (
          <button type="button" role="radio" aria-checked={props.value === o.value ? "true" : "false"}
            class="h-full rounded-full text-[13px] transition-colors"
            style={props.value === o.value ? { background: "var(--g-cta)", color: "var(--g-cta-ink)" } : { color: "var(--g-unselected)" }}
            onClick={() => { tick(); props.onChange(o.value); }}>
            {o.label}
          </button>
        )}</For>
      </div>
    </div>
  );
}

/**
 * Slide to confirm. Drag the knob to the far end; keyboard and screen-reader users
 * press the button (Enter/Space), which counts as a full slide.
 */
export function SlideToConfirm(props: {
  label: string; busyLabel?: string; onConfirm: () => Promise<unknown> | void; disabled?: boolean; chevrons?: boolean; class?: string;
}) {
  const [x, setX] = createSignal(0);
  const [dragging, setDragging] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  let core: HTMLSpanElement | undefined;
  let startX = 0;
  let startPos = 0;
  const rtl = () => lang() === "ur";
  const max = () => (core ? core.clientWidth - 50 : 140);

  const fire = async () => {
    if (props.disabled || busy()) return;
    setX(max());
    setBusy(true);
    tick();
    try { await props.onConfirm(); } finally { setBusy(false); setX(0); }
  };

  return (
    <button type="button" class={["g-halo flex-1", props.class]} style={{ height: "64px", "min-width": "0" }}
      aria-label={props.label} aria-disabled={props.disabled ? "true" : undefined}
      onClick={e => { if (e.detail === 0) void fire(); }}>
      <span ref={el => (core = el)} class="g-core justify-center overflow-hidden" style={{ opacity: props.disabled ? 0.55 : 1 }}>
        <span class="g-slide-knob absolute top-[5px] grid h-10 w-10 place-items-center rounded-full"
          style={{
            "inset-inline-start": "5px", background: "var(--g-cta)", color: "var(--g-cta-ink)",
            "box-shadow": "0 3px 4px rgb(0 0 0 / 0.18)",
            transform: `translateX(${rtl() ? -x() : x()}px)`,
            transition: dragging() ? "none" : "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)"
          }}
          onPointerDown={e => {
            if (props.disabled || busy()) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            startX = e.clientX; startPos = x(); setDragging(true);
          }}
          onPointerMove={e => {
            if (!dragging()) return;
            const dx = (e.clientX - startX) * (rtl() ? -1 : 1);
            setX(Math.max(0, Math.min(max(), startPos + dx)));
          }}
          onPointerUp={() => {
            if (!dragging()) return;
            setDragging(false);
            if (x() >= max() * 0.85) void fire(); else setX(0);
          }}
          onPointerCancel={() => { setDragging(false); setX(0); }}>
          <Show when={busy()} fallback={<GIcon.check />}>
            <span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          </Show>
        </span>
        <span class="ps-11 text-[14px] font-medium" style={{ opacity: Math.max(0, 1 - x() / Math.max(1, max())) }}>
          {busy() ? props.busyLabel ?? props.label : props.label}
        </span>
        <Show when={props.chevrons && !busy()}>
          <span class="g-chev ms-2 flex gap-0.5 text-[12px] rtl:-scale-x-100" style={{ color: "var(--g-faint)" }} aria-hidden="true"><span>›</span><span>›</span><span>›</span></span>
        </Show>
      </span>
    </button>
  );
}

/** Halo pill with a coloured initial chip, text and caret (committee / round switchers). */
export function SwitchPill(props: { chip: string; children: JSX.Element; onClick?: () => void; label?: string }) {
  return (
    <button type="button" class="g-halo mx-auto" style={{ height: "48px" }} aria-label={props.label} onClick={() => { tick(); props.onClick?.(); }}>
      <span class="relative m-[5px] flex h-[34px] items-center gap-2 rounded-full pe-3 ps-1.5" style={{ background: "var(--g-inner)", "box-shadow": "var(--g-inner-shadow)" }}>
        <span class="g-step">{props.chip}</span>
        {props.children}
        <GIcon.caret />
      </span>
    </button>
  );
}

/* ───────────── Sheet ───────────── */

export function GSheet(props: { open: boolean; onClose: () => void; label: string; children: JSX.Element }) {
  return (
    <Show when={props.open}>
      <Portal>
        <div class="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={props.label}
          ref={el => queueMicrotask(() => el.querySelector<HTMLElement>("[data-autofocus], input, a[href], button:not([data-scrim])")?.focus())}
          onKeyDown={e => { if (e.key === "Escape") props.onClose(); }}>
          <button type="button" data-scrim aria-label={t("common.cancel")} class="scrim absolute inset-0 bg-black/40" onClick={() => props.onClose()} />
          <div class="g-sheet sheet relative max-h-[88dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[32px] px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3">
            <div class="mx-auto mb-4 h-1.5 w-10 rounded-full" style={{ background: "var(--g-tick)" }} aria-hidden="true" />
            <div class="g-sheet-body flex flex-col gap-4">{props.children}</div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

/** Short note text inside glass screens (errors, hints). */
export function GNote(props: { tone?: "error" | "muted"; children: JSX.Element }) {
  return (
    <p role={props.tone === "error" ? "alert" : undefined} class="rounded-[18px] px-4 py-3 text-[13px]"
      style={props.tone === "error" ? { background: "var(--g-red-soft)", color: "var(--g-red)" } : { background: "var(--g-card)", color: "var(--g-muted)" }}>
      {props.children}
    </p>
  );
}

/** Loading placeholder in the glass style. */
export function GSkeleton(props: { h?: number; count?: number }) {
  return (
    <div class="flex flex-col gap-3" aria-busy="true" aria-label={t("common.loading")}>
      <For each={Array.from({ length: props.count ?? 3 })}>{() => <div class="g-card skeleton" style={{ height: `${props.h ?? 120}px`, background: "var(--g-card)" }} />}</For>
    </div>
  );
}
