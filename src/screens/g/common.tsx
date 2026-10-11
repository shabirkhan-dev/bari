import { createMemo, Errored, Loading, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { getHome, type HomeItem, type PeriodRef } from "../../lib/api";
import { current, pickCommittee } from "../../lib/current";
import { describeError } from "../../lib/errors";
import { freshness } from "../../lib/live";
import { lang, t } from "../../i18n";
import type { Key } from "../../i18n/strings";
import type { Frequency } from "../../domain/schedule";
import { GNote, GScreen, GSkeleton } from "../../ui/glass";

/**
 * Tabs (Home, Ledger, Toss) show one running committee: the one picked in the
 * switcher, else the first running one. With none running, `fallback` renders.
 */
export function WithCommittee(props: {
  title?: string;
  fallback: JSX.Element;
  children: (id: string, items: () => HomeItem[]) => JSX.Element;
}) {
  const items = createMemo(() => { freshness(); return getHome(); });
  const picked = createMemo(() => pickCommittee(items(), current())?.id ?? null);
  return (
    <Errored fallback={err => <GScreen title={props.title} nav={null}><GNote tone="error">{describeError(err())}</GNote></GScreen>}>
      <Loading fallback={<GScreen title={props.title} nav={null}><GSkeleton /></GScreen>}>
        <Show when={picked()} keyed fallback={props.fallback}>
          {id => props.children(id, items)}
        </Show>
      </Loading>
    </Errored>
  );
}

const URDU_SMALL = ["", "ایک", "دو", "تین", "چار", "پانچ", "چھ", "سات", "آٹھ", "نو", "دس"];

/** "Day 18 of 30" / "Week 3 of 5" */
export const periodOf = (f: Frequency, n: number, total: number) => t(`g.period.${f}` as Key, { n, total });

/** "Day 18" or "Days 16–18" for the periods one payment covers. */
export function periodsLabel(f: Frequency, refs: PeriodRef[] | null | undefined): string {
  if (!refs?.length) return "";
  const ns = refs.map(r => r.n);
  const a = Math.min(...ns);
  const b = Math.max(...ns);
  if (a === b) return t(`g.one.${f}` as Key, { n: a });
  // Keep "8–10" in reading order inside right-to-left text.
  return lang() === "ur" ? t(`g.range.${f}` as Key, { a: `\u2066${a}`, b: `${b}\u2069` }) : t(`g.range.${f}` as Key, { a, b });
}

/** "3 days" / "تین دن" */
export function unitCount(f: Frequency, n: number): string {
  const shown = lang() === "ur" && n <= 10 ? URDU_SMALL[n]! : n;
  return t(`g.unit${n === 1 ? "1" : "N"}.${f}` as Key, { n: shown });
}

/** Current Pakistan time as "HH:MM" (24 h), for the daily cutoff. */
export const nowHHMM = () =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());

/** "0300 123 4417" */
export const spacedPhone = (p: string) => (/^\d{11}$/.test(p) ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p);
/** "0300 ···· 2512" */
export const maskedPhone = (p: string) => (/^\d{11}$/.test(p) ? `${p.slice(0, 4)} ···· ${p.slice(7)}` : p);
/** "8462 1937 0021" */
export const groupedTid = (tid: string) => tid.replace(/(\d{4})(?=\d)/g, "$1 ");
