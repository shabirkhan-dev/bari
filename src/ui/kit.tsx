import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { back, navigate, path } from "../lib/router";

/** Light haptic tick on Android (ignored elsewhere). */
export const tick = () => { try { navigator.vibrate?.(8); } catch { /* no vibration */ } };

/** A full screen: sticky header with optional back button, scrolling body. */
export function Screen(props: {
  title: string;
  backTo?: string;
  action?: JSX.Element;
  children: JSX.Element;
  tabs?: boolean;
}) {
  return (
    <div class="flex min-h-dvh flex-col">
      <header class="sticky top-0 z-10 flex h-[calc(56px+env(safe-area-inset-top))] items-end border-b border-bari-line/70 bg-bari-ground/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div class="flex h-14 w-full items-center gap-1">
          <Show when={props.backTo !== undefined}>
            <button
              type="button"
              aria-label="Back"
              class="grid h-11 w-11 place-items-center rounded-full text-bari-ink active:bg-bari-line/60"
              onClick={() => { tick(); back(props.backTo); }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
          </Show>
          <h1 class={["flex-1 truncate text-xl font-semibold text-bari-ink", { "pl-3": props.backTo === undefined }]}>{props.title}</h1>
          {props.action}
        </div>
      </header>
      <main class={["flex flex-1 flex-col gap-4 px-4 pt-4", props.tabs ? "pb-[calc(88px+env(safe-area-inset-bottom))]" : "pb-[calc(24px+env(safe-area-inset-bottom))]"]}>
        {props.children}
      </main>
    </div>
  );
}

const tabs = [
  { to: "/", label: "Committees", icon: () => <><circle cx="12" cy="13" r="7.5" /><circle cx="12" cy="5.5" r="2.2" fill="currentColor" /></> },
  { to: "/me", label: "Me", icon: () => <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-3.9 3.6-7 8-7s8 3.1 8 7" /></> }
];

export function TabBar() {
  return (
    <nav
      aria-label="Main"
      style={{ "view-transition-name": "tabbar" }}
      class="fixed bottom-0 left-1/2 z-20 grid w-full max-w-[480px] -translate-x-1/2 grid-cols-2 border-t border-bari-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      {tabs.map(t => (
        <a
          href={t.to}
          aria-current={path() === t.to ? "page" : undefined}
          class={["flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
            path() === t.to ? "text-bari-emerald" : "text-bari-muted"]}
          onClick={e => { e.preventDefault(); tick(); navigate(t.to, { replace: true, direction: "none" }); }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={path() === t.to ? 2.4 : 1.8} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{t.icon()}</svg>
          {t.label}
        </a>
      ))}
    </nav>
  );
}

export function Button(props: {
  children: JSX.Element;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  class?: string;
}) {
  return (
    <button
      type={props.type ?? "button"}
      disabled={props.disabled}
      onClick={() => { if (props.onClick) { tick(); props.onClick(); } }}
      class={[
        "flex h-14 items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100",
        {
          "bg-bari-emerald text-white": (props.variant ?? "primary") === "primary",
          "border border-bari-line bg-white text-bari-ink": props.variant === "secondary",
          "text-bari-emerald": props.variant === "ghost",
          "bg-red-700 text-white": props.variant === "danger"
        },
        props.class
      ]}
    >
      {props.children}
    </button>
  );
}

export function Card(props: { children: JSX.Element; class?: string }) {
  return <section class={["rounded-3xl border border-bari-line/70 bg-white p-4", props.class]}>{props.children}</section>;
}

export function SectionTitle(props: { children: JSX.Element }) {
  return <h2 class="px-1 pt-2 text-sm font-semibold uppercase tracking-wide text-bari-muted">{props.children}</h2>;
}

export function Field(props: { label: string; hint?: JSX.Element; children: JSX.Element }) {
  return (
    <label class="flex flex-col gap-2">
      <span class="font-medium text-bari-ink">{props.label}</span>
      {props.children}
      <Show when={props.hint}><span class="text-sm text-bari-muted">{props.hint}</span></Show>
    </label>
  );
}

export const inputClass =
  "h-12 w-full rounded-xl border border-bari-line bg-white px-4 text-lg text-bari-ink outline-none focus:border-bari-emerald focus:ring-2 focus:ring-bari-emerald/20";

export function Stepper(props: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  const btn = "grid h-12 w-12 place-items-center rounded-xl border border-bari-line bg-white text-2xl text-bari-ink active:bg-bari-mint disabled:opacity-40";
  return (
    <div class="flex items-center gap-3" role="group" aria-label={props.label}>
      <button type="button" class={btn} aria-label={`Fewer ${props.label}`} disabled={props.value <= props.min}
        onClick={() => { tick(); props.onChange(Math.max(props.min, props.value - 1)); }}>−</button>
      <output class="min-w-12 text-center text-2xl font-semibold tabular-nums text-bari-ink" aria-live="polite">{props.value}</output>
      <button type="button" class={btn} aria-label={`More ${props.label}`} disabled={props.value >= props.max}
        onClick={() => { tick(); props.onChange(Math.min(props.max, props.value + 1)); }}>+</button>
    </div>
  );
}

export function Segmented<T extends string>(props: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={props.label} class="grid grid-flow-col gap-1 rounded-2xl bg-bari-line/50 p-1">
      {props.options.map(o => (
        <button
          type="button"
          role="radio"
          aria-checked={props.value === o.value ? "true" : "false"}
          class={["h-11 rounded-xl text-sm font-semibold", props.value === o.value ? "bg-white text-bari-ink shadow-sm" : "text-bari-muted"]}
          onClick={() => { tick(); props.onChange(o.value); }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip(props: { tone: "ok" | "wait" | "due" | "late" | "neutral"; children: JSX.Element }) {
  return (
    <span class={["inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold", {
      "bg-bari-mint text-bari-emerald-dark": props.tone === "ok",
      "bg-amber-100 text-amber-900": props.tone === "wait",
      "bg-slate-100 text-slate-700": props.tone === "due" || props.tone === "neutral",
      "bg-red-100 text-red-800": props.tone === "late"
    }]}>{props.children}</span>
  );
}

export function ErrorNote(props: { message: string }) {
  return <p role="alert" class="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">{props.message}</p>;
}

export function Skeleton(props: { lines?: number }) {
  return (
    <div class="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: props.lines ?? 3 }, () => <div class="skeleton h-20" />)}
    </div>
  );
}
