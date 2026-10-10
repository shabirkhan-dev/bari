import { createSignal } from "solid-js";
import { en, ur, type Key } from "./strings";
import type { LocalDate } from "../domain/dates";
import type { Paisa } from "../domain/money";

export type Lang = "en" | "ur";
const KEY = "bari.lang";

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "ur") return saved;
  } catch { /* storage blocked */ }
  return typeof navigator !== "undefined" && navigator.language?.startsWith("ur") ? "ur" : "en";
}

const [lang, setLangSignal] = createSignal<Lang>(initial());
export { lang };

let fontLoaded = false;
function apply(l: Lang) {
  if (typeof document === "undefined") return; // tests / non-browser
  const html = document.documentElement;
  html.lang = l;
  html.dir = l === "ur" ? "rtl" : "ltr";
  if (l === "ur" && !fontLoaded) {
    fontLoaded = true;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap";
    document.head.appendChild(link);
  }
}
apply(lang());

export function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* storage blocked */ }
  apply(l);
  setLangSignal(l);
}

const dicts = { en, ur } as const;

/** Translate. Reactive: re-renders when the language changes. */
export function t(key: Key, params?: Record<string, string | number>): string {
  let s: string = dicts[lang()][key];
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/* ── Locale-aware formatting ── */

const groupEn = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const groupEn2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Just the number part: "30,000" (Western digits in both languages, as in Pakistani banking apps). */
export function amount(paisa: Paisa): string {
  const abs = Math.abs(paisa);
  return (paisa < 0 ? "−" : "") + (abs % 100 === 0 ? groupEn.format(abs / 100) : groupEn2.format(abs / 100));
}

/** Currency word for the current language. */
export const currency = () => (lang() === "ur" ? "روپے" : "Rs");

/** "Rs 30,000" / "30,000 روپے" */
export function money(paisa: Paisa): string {
  return lang() === "ur" ? `${amount(paisa)} روپے` : `Rs ${amount(paisa)}`;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => (d: LocalDate) =>
  new Intl.DateTimeFormat(lang() === "ur" ? "ur-PK" : "en-GB", { ...opts, timeZone: "UTC", numberingSystem: "latn" })
    .format(new Date(`${d}T12:00:00Z`));

/** "30 Nov" */
export const dateShort = (d: LocalDate) => fmt({ day: "numeric", month: "short" })(d);
/** "30 Nov 2026" */
export const dateLong = (d: LocalDate) => fmt({ day: "numeric", month: "short", year: "numeric" })(d);
/** "Mon, 30 Nov" */
export const dateDay = (d: LocalDate) => fmt({ weekday: "short", day: "numeric", month: "short" })(d);
/** "Mon" / "پیر" */
export const weekday = (d: LocalDate) => fmt({ weekday: "short" })(d);
