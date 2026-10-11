import { createSignal, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { GAvatar, GIcon, GMoney, GNote, GSegmented, GSheet, GSkeleton, GStepper, Halo } from "./glass";
import { back } from "../lib/router";
import { t } from "../i18n";
import type { Paisa } from "../domain/money";

/** Light haptic tick on Android (ignored elsewhere). */
export const tick = () => { try { navigator.vibrate?.(8); } catch { /* no vibration */ } };

/* ───────────── Layout ─────────────
 * These are the older screens' building blocks, now drawn with the glass design
 * (src/ui/glass.tsx) so every screen looks like one app.
 */

/** Pushed screen: back halo + serif title, glass background. */
export function Screen(props: { title?: string; backTo?: string; action?: JSX.Element; children: JSX.Element; bottom?: JSX.Element }) {
  return (
    <div class="g flex flex-col">
      <header class="sticky top-0 z-10 px-5 pt-[calc(10px+env(safe-area-inset-top))] pb-2" style={{ background: "linear-gradient(to bottom, var(--g-bg) 70%, transparent)" }}>
        <div class="flex min-h-14 items-center gap-3">
          <Show when={props.backTo !== undefined}>
            <Halo w={52} label={t("common.back")} onClick={() => back(props.backTo)}><GIcon.back /></Halo>
          </Show>
          <h1 class="g-serif min-w-0 flex-1 truncate text-[26px] leading-tight">{props.title}</h1>
          {props.action}
        </div>
      </header>
      <main class={["flex flex-1 flex-col gap-4 px-5 pt-2", props.bottom ? "pb-[calc(112px+env(safe-area-inset-bottom))]" : "pb-[calc(28px+env(safe-area-inset-bottom))]"]}>
        {props.children}
      </main>
      <Show when={props.bottom}>
        <div class="fixed bottom-0 left-1/2 z-20 w-full max-w-[480px] -translate-x-1/2 px-5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-6"
          style={{ background: "linear-gradient(to top, var(--g-bg) 60%, transparent)" }}>
          {props.bottom}
        </div>
      </Show>
    </div>
  );
}

/** Bottom sheet: the glass one (close button, swipe down, Back closes it). */
export function Sheet(props: { open: boolean; onClose: () => void; label: string; children: JSX.Element }) {
  return <GSheet open={props.open} onClose={props.onClose} label={props.label}>{props.children}</GSheet>;
}

/** A big tappable row inside a sheet or list. */
export function ActionRow(props: { icon: JSX.Element; title: string; sub?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={() => { tick(); props.onClick(); }} class="flex w-full items-center gap-3 rounded-[20px] p-2.5 text-start active:opacity-70">
      <Halo w={48}>{props.icon}</Halo>
      <span class="min-w-0 flex-1">
        <span class="block text-[15px] font-semibold">{props.title}</span>
        <Show when={props.sub}><span class="mt-0.5 block text-[12px]" style={{ color: "var(--g-muted)" }}>{props.sub}</span></Show>
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
  const v = () => props.variant ?? "primary";
  return (
    <button type={props.type ?? "button"} disabled={props.disabled}
      onClick={() => { if (props.onClick) { tick(); props.onClick(); } }}
      class={["g-halo min-w-0", props.class]} style={{ height: "60px" }}>
      <span class="g-core px-4 text-[15px] font-medium"
        style={v() === "primary" ? { background: "var(--g-cta)", color: "var(--g-cta-ink)" } : v() === "danger" ? { background: "var(--g-red)", color: "#fff" } : undefined}>
        {props.children}
        <Show when={props.trailing}><span class="grid h-5 w-5 place-items-center">{props.trailing}</span></Show>
      </span>
    </button>
  );
}

export function Card(props: { children: JSX.Element; class?: string; label?: string }) {
  return <section aria-label={props.label} class={["g-card p-5", props.class]}>{props.children}</section>;
}

export function Field(props: { label: string; hint?: JSX.Element; children: JSX.Element }) {
  return (
    <label class="flex flex-col gap-2">
      <span class="px-1 text-[13px]" style={{ color: "var(--g-ink-2)" }}>{props.label}</span>
      {props.children}
      <Show when={props.hint}><span class="px-1 text-[12px]" style={{ color: "var(--g-muted)" }}>{props.hint}</span></Show>
    </label>
  );
}

export const inputClass =
  "h-14 w-full rounded-[20px] border border-[var(--g-card-border)] bg-[var(--g-card-strong)] px-4 text-[17px] text-[var(--g-ink)] outline-none placeholder:text-[var(--g-faint)] focus:border-[var(--g-chip)] disabled:opacity-55";

export function Stepper(props: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return <GStepper value={props.value} min={props.min} max={props.max} onChange={props.onChange} label={props.label} />;
}

export function Segmented<T extends string>(props: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return <GSegmented<T> options={props.options} value={props.value} onChange={props.onChange} label={props.label} />;
}

/* ───────────── Data display ───────────── */

export function Money(props: { paisa: Paisa; size?: "hero" | "xl" | "lg" | "md"; class?: string }) {
  const px = () => ({ hero: 50, xl: 40, lg: 28, md: 17 })[props.size ?? "lg"];
  return <GMoney paisa={props.paisa} size={px()} class={props.class} noCents />;
}

export type BadgeTone = "paid" | "checking" | "due" | "late" | "neutral" | "turn";
export function Badge(props: { tone: BadgeTone; children: JSX.Element }) {
  const cls = () => ({ paid: "g-chip-green", checking: "g-chip-amber", due: "g-chip-amber", late: "g-chip-red", neutral: "", turn: "g-chip-amber" })[props.tone];
  return (
    <span class={["g-chip", cls()]} style={props.tone === "neutral" ? { background: "color-mix(in srgb, var(--g-ink) 9%, transparent)", color: "var(--g-ink-2)" } : undefined}>
      {props.children}
    </span>
  );
}

export function Pill(props: { children: JSX.Element; class?: string }) {
  return <span class={["inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px]", props.class]} style={{ background: "var(--g-inner)", color: "var(--g-ink-2)" }}>{props.children}</span>;
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => [...w][0]!.toUpperCase()).join("");

export function Avatar(props: { name: string; size?: number; ring?: string }) {
  return (
    <span class="shrink-0 rounded-full" style={{ "box-shadow": props.ring ? `0 0 0 2.5px ${props.ring}` : undefined }}>
      <GAvatar name={props.name} size={props.size ?? 44} />
    </span>
  );
}

export function ErrorNote(props: { message: string }) {
  return <GNote tone="error">{props.message}</GNote>;
}

export function Skeleton(props: { lines?: number }) {
  return <GSkeleton count={props.lines ?? 3} h={96} />;
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
