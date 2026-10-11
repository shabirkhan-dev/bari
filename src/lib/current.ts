import { createSignal } from "solid-js";
import type { HomeItem } from "./api";

/**
 * The committee the tabs (Home, Ledger, Toss) are showing, remembered per phone,
 * and whether amounts are hidden (the eye on Home).
 */
const CURRENT = "bari.committee";
const HIDE = "bari.hideAmounts";

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => {
  try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage blocked */ }
};

const [current, setCurrentSignal] = createSignal<string | null>(read(CURRENT));
export { current };
export function setCurrent(id: string) { write(CURRENT, id); setCurrentSignal(id); }

/** The running committee to show: the remembered one if still running, else the first running one. */
export function pickCommittee(items: HomeItem[], remembered: string | null): HomeItem | null {
  const running = items.filter(i => i.status === "active");
  return running.find(i => i.id === remembered) ?? running[0] ?? null;
}

const [hidden, setHiddenSignal] = createSignal(read(HIDE) === "1");
export { hidden };
export function toggleHidden() { const v = !hidden(); write(HIDE, v ? "1" : null); setHiddenSignal(v); }
