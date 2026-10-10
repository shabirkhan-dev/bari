import { createSignal } from "solid-js";

/**
 * Bumps when the app comes back to the foreground (e.g. after paying in JazzCash),
 * at most every 15 s. Data memos read it so they refetch quietly; content stays
 * on screen while the fresh copy loads.
 */
const [stamp, setStamp] = createSignal(0);
let last = Date.now();

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || Date.now() - last < 15_000) return;
    last = Date.now();
    setStamp(s => s + 1);
  });
}

export const freshness = stamp;
