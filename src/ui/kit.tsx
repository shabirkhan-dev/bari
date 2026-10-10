import { createSignal, For, Show } from "solid-js";
import { Portal, type JSX } from "@solidjs/web";
import { back, navigate, path } from "../lib/router";
import { amount as fmtAmount, currency, lang, t } from "../i18n";
import type { Paisa } from "../domain/money";
import { IconBack, IconCheck, IconClock, IconHome, IconHourglass, IconPlus, IconUser } from "./icons";

/** Light haptic tick on Android (ignored elsewhere). */
export const tick = () => { try { navigator.vibrate?.(8); } catch { /* no vibration */ } };

/* ───────────── Layout ───────────── */

/** Pushed screen: round back button + title. */
export function Screen(props: { title?: string; backTo?: string; action?: JSX.Element; children: JSX.Element; bottom?: JSX.Element }) {
  return (
    <div class="flex min-h-dvh flex-col">
      <header class="sticky top-0 z-10 bg-bg/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div class="flex h-16 items-center gap-3">
          <Show when={props.backTo !== undefined}>
            <button type="button" aria-label={t("common.back")}
              class="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink active:scale-95 rtl:-scale-x-100"
              onClick={() => { tick(); back(props.backTo); }}>
              <IconBack />
            </button>
          </Show>
          <h1 class="min-w-0 flex-1 truncate text-xl font-semibold">{props.title}</h1>
          {props.action}
        </div>
      </header>
      <main class={["flex flex-1 flex-col gap-4 px-4 pt-2", props.bottom ? "pb-[calc(112px+env(safe-area-inset-bottom))]" : "pb-[calc(28px+env(safe-area-inset-bottom))]"]}>
        {props.children}
      </main>
      <Show when={props.bottom}>
        <div class="fixed bottom-0 left-1/2 z-20 w-full max-w-[480px] -translate-x-1/2 bg-gradient-to-t from-bg from-60% to-transparent px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-6">
          {props.bottom}
        </div>
      </Show>
    </div>
  );
}

/** Tab screen body: leaves room for the floating dock. */
export function TabScreen(props: { children: JSX.Element }) {
  return (
    <main class="flex min-h-dvh flex-col gap-5 px-4 pb-[calc(120px+env(safe-area-inset-bottom))] pt-[calc(12px+env(safe-area-inset-top))]">
      {props.children}
    </main>
  );
}

/* ───────────── Floating dock ───────────── */

export function Dock(props: { onAdd: () => void }) {
  const items = [
    { to: "/", label: () => t("tabs.home"), icon: IconHome },
    { to: "/me", label: () => t("tabs.me"), icon: IconUser }
  ];
  return (
    <div style={{ "view-transition-name": "dock" }}
      class="fixed bottom-0 left-1/2 z-30 flex w-full max-w-[480px] -translate-x-1/2 items-center justify-center gap-3 px-4 pb-[calc(14px+env(safe-area-inset-bottom))]">
      <nav aria-label="Main" class="flex h-16 items-center gap-1 rounded-full bg-dock p-2 text-dock-ink shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)]">
        <For each={items}>{item => {
          const active = () => path() === item.to;
          return (
            <a href={item.to} aria-current={active() ? "page" : undefined}
              class={["flex h-12 items-center gap-2 rounded-full transition-[background-color,padding] duration-200",
                active() ? "bg-dock-ink/15 px-5" : "px-4 opacity-60"]}
              onClick={e => { e.preventDefault(); tick(); navigate(item.to, { replace: true, direction: "none" }); }}>
              <item.icon />
              <Show when={active()}><span class="text-[15px] font-semibold">{item.label()}</span></Show>
              <Show when={!active()}><span class="sr-only">{item.label()}</span></Show>
            </a>
          );
        }}</For>
      </nav>
      <button type="button" aria-label={t("tabs.add")} onClick={() => { tick(); props.onAdd(); }}
        class="grid h-16 w-16 place-items-center rounded-full border border-line bg-surface text-ink shadow-[0_12px_32px_-12px_rgb(0_0_0/0.35)] active:scale-95">
        <IconPlus size={26} />
      </button>
    </div>
  );
}

/* ───────────── Bottom sheet ───────────── */

export function Sheet(props: { open: boolean; onClose: () => void; label: string; children: JSX.Element }) {
  return (
    <Show when={props.open}>
      <Portal>
        <div class="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={props.label}
          ref={el => queueMicrotask(() => el.querySelector<HTMLElement>("button, a, input")?.focus())}
          onKeyDown={e => { if (e.key === "Escape") props.onClose(); }}>
          <button type="button" aria-label={t("common.cancel")} class="scrim absolute inset-0 bg-black/45" onClick={() => props.onClose()} />
          <div class="sheet relative w-full max-w-[480px] rounded-t-[32px] bg-surface px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 text-ink">
            <div class="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
            {props.children}
          </div>
        </div>
      </Portal>
    </Show>
  );
}

/** A big tappable row inside a sheet or list. */
export function ActionRow(props: { icon: JSX.Element; title: string; sub?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={() => { tick(); props.onClick(); }}
      class="flex w-full items-center gap-4 rounded-[20px] p-3 text-start active:bg-surface-2">
      <span class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface-2 text-ink">{props.icon}</span>
      <span class="min-w-0 flex-1">
        <span class="block text-[17px] font-semibold">{props.title}</span>
        <Show when={props.sub}><span class="block text-sm text-ink-2">{props.sub}</span></Show>
      </span>
    </button>
  );
}

/* ───────────── Controls ───────────── */

export function Button(props: {
  children: JSX.Element;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "soft" | "danger";
  disabled?: boolean;
  class?: string;
  trailing?: JSX.Element;
}) {
  return (
    <button type={props.type ?? "button"} disabled={props.disabled}
      onClick={() => { if (props.onClick) { tick(); props.onClick(); } }}
      class={[
        "flex h-14 items-center justify-center gap-2.5 rounded-full px-6 text-[17px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100",
        {
          "bg-cta text-cta-ink shadow-[0_10px_24px_-14px_rgb(0_0_0/0.6)]": (props.variant ?? "primary") === "primary",
          "border border-line bg-surface text-ink": props.variant === "secondary",
          "bg-surface-2 text-ink": props.variant === "soft",
          "bg-late text-white": props.variant === "danger"
        },
        props.class
      ]}>
      {props.children}
      <Show when={props.trailing}>
        <span class={["grid h-6 w-6 place-items-center rounded-full", (props.variant ?? "primary") === "primary" ? "bg-cta-ink text-cta" : "bg-ink text-surface"]}>{props.trailing}</span>
      </Show>
    </button>
  );
}

export function Card(props: { children: JSX.Element; class?: string; label?: string }) {
  return <section aria-label={props.label} class={["rounded-[28px] bg-surface p-5", props.class]}>{props.children}</section>;
}

export function Field(props: { label: string; hint?: JSX.Element; children: JSX.Element }) {
  return (
    <label class="flex flex-col gap-2">
      <span class="text-[15px] font-medium text-ink-2">{props.label}</span>
      {props.children}
      <Show when={props.hint}><span class="text-sm text-ink-3">{props.hint}</span></Show>
    </label>
  );
}

export const inputClass =
  "h-14 w-full rounded-2xl border border-transparent bg-surface-2 px-4 text-lg text-ink outline-none placeholder:text-ink-3 focus:border-ink/40";

export function Stepper(props: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  const btn = "grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-2xl text-ink active:scale-95 disabled:opacity-35";
  return (
    <div class="flex items-center gap-4" role="group" aria-label={props.label}>
      <button type="button" class={btn} aria-label={t("create.fewer", { what: props.label })} disabled={props.value <= props.min}
        onClick={() => { tick(); props.onChange(Math.max(props.min, props.value - 1)); }}>−</button>
      <output class="num min-w-12 text-center text-3xl font-semibold" aria-live="polite">{props.value}</output>
      <button type="button" class={btn} aria-label={t("create.more", { what: props.label })} disabled={props.value >= props.max}
        onClick={() => { tick(); props.onChange(Math.min(props.max, props.value + 1)); }}>+</button>
    </div>
  );
}

export function Segmented<T extends string>(props: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={props.label} class="grid grid-flow-col auto-cols-fr gap-1 rounded-full bg-surface-2 p-1">
      <For each={props.options}>{o => (
        <button type="button" role="radio" aria-checked={props.value === o.value ? "true" : "false"}
          class={["h-11 rounded-full px-2 text-[15px] font-semibold transition-colors",
            props.value === o.value ? "bg-surface text-ink shadow-[0_2px_8px_-2px_rgb(0_0_0/0.18)]" : "text-ink-2"]}
          onClick={() => { tick(); props.onChange(o.value); }}>
          {o.label}
        </button>
      )}</For>
    </div>
  );
}

/* ───────────── Data display ───────────── */

/** Money with a small muted currency, like a banking app. */
export function Money(props: { paisa: Paisa; size?: "hero" | "xl" | "lg" | "md"; class?: string }) {
  const size = () => props.size ?? "lg";
  const num = () => ({ hero: "text-[56px] leading-none font-bold", xl: "text-[40px] leading-none font-bold", lg: "text-[28px] leading-none font-bold", md: "text-[17px] font-semibold" })[size()];
  const cur = () => ({ hero: "text-xl", xl: "text-lg", lg: "text-sm", md: "text-sm" })[size()];
  const sym = () => <span class={[cur(), "font-medium text-ink-3"]}>{currency()}</span>;
  return (
    <span class={["inline-flex items-baseline gap-1.5", props.class]} dir="ltr">
      <Show when={lang() !== "ur"}>{sym()}</Show>
      <span class={["num", num()]}>{fmtAmount(props.paisa)}</span>
      <Show when={lang() === "ur"}>{sym()}</Show>
    </span>
  );
}

export type BadgeTone = "paid" | "checking" | "due" | "late" | "neutral" | "turn";
export function Badge(props: { tone: BadgeTone; children: JSX.Element }) {
  return (
    <span class={["inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold", {
      "bg-ok-soft text-ok": props.tone === "paid",
      "bg-warn-soft text-warn": props.tone === "checking" || props.tone === "due",
      "bg-late-soft text-late": props.tone === "late",
      "bg-surface-2 text-ink-2": props.tone === "neutral",
      "bg-turn/20 text-ink": props.tone === "turn"
    }]}>
      <Show when={props.tone === "paid"}><IconCheck size={13} /></Show>
      <Show when={props.tone === "checking"}><IconClock size={13} /></Show>
      <Show when={props.tone === "due"}><IconHourglass size={13} /></Show>
      <Show when={props.tone === "late"}><span class="h-2 w-2 rounded-full bg-late" aria-hidden="true" /></Show>
      {props.children}
    </span>
  );
}

export function Pill(props: { children: JSX.Element; class?: string }) {
  return <span class={["inline-flex h-9 items-center gap-2 rounded-full bg-surface px-4 text-sm font-medium text-ink-2", props.class]}>{props.children}</span>;
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => [...w][0]!.toUpperCase()).join("");

export function Avatar(props: { name: string; size?: number; ring?: string }) {
  return (
    <span aria-hidden="true"
      style={{ width: `${props.size ?? 44}px`, height: `${props.size ?? 44}px`, "box-shadow": props.ring ? `0 0 0 2.5px ${props.ring}` : undefined }}
      class="latin grid shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold text-ink">
      {initials(props.name)}
    </span>
  );
}

export function ErrorNote(props: { message: string }) {
  return <p role="alert" class="rounded-[20px] bg-late-soft px-4 py-3 text-[15px] text-late">{props.message}</p>;
}

export function Skeleton(props: { lines?: number }) {
  return (
    <div class="flex flex-col gap-3" aria-busy="true" aria-label={t("common.loading")}>
      <For each={Array.from({ length: props.lines ?? 3 })}>{() => <div class="skeleton h-24" />}</For>
    </div>
  );
}

/** Copy text with a brief "Copied" confirmation. */
export function useCopy() {
  const [copied, setCopied] = createSignal(false);
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { /* clipboard blocked */ }
  };
  return { copied, copy };
}
