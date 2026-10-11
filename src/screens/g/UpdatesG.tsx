import { createMemo, createSignal, Errored, For, Loading, refresh, Show } from "solid-js";
import { listNotifications, markAllRead, type Notice } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { back, navigate } from "../../lib/router";
import { bumpUnread } from "../../lib/unread";
import { addDays, todayInPKT } from "../../domain/dates";
import { noticeLines, noticeTarget, type NoticeIcon } from "../../domain/notice";
import { clock, dateShort, lang, pktDate, t } from "../../i18n";
import { GIcon, GNote, GScreen, GSkeleton, Halo } from "../../ui/glass";
import { tick } from "../../ui/kit";

const ICON: Record<NoticeIcon, () => import("@solidjs/web").JSX.Element> = {
  check: () => <GIcon.check />, bell: () => <GIcon.bell size={18} />, receipt: () => <GIcon.receipt />,
  clock: () => <GIcon.clock />, toss: () => <GIcon.toss />, money: () => <GIcon.money />, info: () => <GIcon.info />
};
const TONE = { ok: "var(--g-emerald)", due: "var(--g-amber)", late: "var(--g-red)", plain: "var(--g-ink)" } as const;

export function UpdatesG() {
  const items = createMemo(() => listNotifications());
  const [error, setError] = createSignal("");
  const markAll = async () => {
    setError("");
    try { await markAllRead(); bumpUnread(); refresh(items); }
    catch (e) { setError(describeError(e)); }
  };
  const today = todayInPKT();
  const dayName = (d: string) => (d === today ? t("g.l.today") : d === addDays(today, -1) ? t("g.l.yesterday") : dateShort(d));
  const groups = () => {
    const out: { day: string; items: Notice[] }[] = [];
    for (const n of items()) {
      const d = pktDate(n.created_at);
      const g = out.at(-1);
      if (g && g.day === d) g.items.push(n); else out.push({ day: d, items: [n] });
    }
    return out;
  };

  return (
    <GScreen title={t("u.title")} bottom={
      <>
        <Halo w={64} label={t("common.back")} onClick={() => back("/")}><GIcon.undo /></Halo>
        <button type="button" class="g-halo flex-1" style={{ height: "64px" }} onClick={() => { tick(); void markAll(); }}>
          <span class="g-core justify-start gap-3 ps-[5px]">
            <span class="grid h-10 w-10 place-items-center rounded-full border border-dashed" style={{ "border-color": "var(--g-dash)" }}><GIcon.check size={16} /></span>
            <span class="text-[14px] font-medium">{t("u.markAll")}</span>
          </span>
        </button>
      </>
    }>
      <Errored fallback={err => <GNote tone="error">{describeError(err())}</GNote>}>
        <Loading fallback={<GSkeleton />}>
          <Show when={items().length > 0} fallback={<div class="mt-10"><GNote>{t("u.empty")}</GNote></div>}>
            <For each={groups()}>{g => (
              <section class="mt-4">
                <h2 class="mb-2 px-1 text-[13px]" style={{ color: "var(--g-muted)" }}>{dayName(g.day)}</h2>
                <ul class="g-card px-4">
                  <For each={g.items}>{(n, i) => {
                    const l = () => noticeLines(n.kind, n.payload, lang());
                    const to = () => noticeTarget(n.kind, n.payload, n.committee_id);
                    return (
                      <li>
                        <a href={to()} class="flex items-center gap-3 py-3.5" onClick={e => { e.preventDefault(); tick(); navigate(to()); }}>
                          <Halo w={50}><span style={{ color: TONE[l().tone] }}>{ICON[l().icon]()}</span></Halo>
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-[15px] font-medium">{l().title}</span>
                            <span class="mt-0.5 block truncate text-[12px]" style={{ color: "var(--g-muted)" }}>
                              {[l().sub, n.committees?.name].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <span class="flex shrink-0 flex-col items-end gap-2 self-stretch py-1">
                            <span class="text-[11px]" style={{ color: "var(--g-faint)" }}>{clock(n.created_at)}</span>
                            <Show when={!n.read_at}><span class="h-2 w-2 rounded-full" style={{ background: "var(--g-chip)" }} aria-label="new" /></Show>
                          </span>
                        </a>
                        <Show when={i() < g.items.length - 1}><div class="g-divider ms-[62px]" /></Show>
                      </li>
                    );
                  }}</For>
                </ul>
              </section>
            )}</For>
          </Show>
          <Show when={error()}><div class="mt-3"><GNote tone="error">{error()}</GNote></div></Show>
        </Loading>
      </Errored>
    </GScreen>
  );
}

