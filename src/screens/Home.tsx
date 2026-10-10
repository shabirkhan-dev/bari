import { createMemo, Errored, For, Loading, Match, Show, Switch } from "solid-js";
import { getHome, type HomeItem } from "../lib/api";
import { navigate } from "../lib/router";
import { describeError } from "../lib/errors";
import type { Profile } from "../lib/auth";
import { contributionLabel, daysBetween } from "../domain/display";
import { todayInPKT } from "../domain/dates";
import { dateShort, money, t } from "../i18n";
import { Avatar, Badge, Button, ErrorNote, Money, Skeleton, TabScreen, tick } from "../ui/kit";
import { MemberRing } from "../ui/MemberRing";
import { LangSwitch } from "../ui/SignIn";
import { IconCheck, IconChevron } from "../ui/icons";

export function Home(props: { me: Profile }) {
  const items = createMemo(() => getHome());
  const firstName = () => props.me.display_name.split(/\s+/)[0] ?? props.me.display_name;
  const owed = () => items().filter(i => i.status === "active").reduce((s, i) => s + i.due_today_paisa + i.overdue_paisa, 0);
  const late = () => items().reduce((s, i) => s + i.overdue_paisa, 0);

  return (
    <TabScreen>
      <header class="flex items-center gap-3">
        <a href="/me" aria-label={t("tabs.me")} onClick={e => { e.preventDefault(); tick(); navigate("/me", { replace: true, direction: "none" }); }}>
          <Avatar name={props.me.display_name} size={48} />
        </a>
        <p class="min-w-0 flex-1 truncate text-lg font-semibold">{t("home.greeting", { name: firstName() })}</p>
        <LangSwitch />
      </header>

      <Errored fallback={err => <ErrorNote message={describeError(err())} />}>
        <Loading fallback={<Skeleton lines={3} />}>
          <Show when={items().length > 0} fallback={<Empty />}>
            <section class="flex flex-col items-center gap-3 py-6 text-center" aria-live="polite">
              <Show when={owed() > 0} fallback={
                <>
                  <span class="grid h-16 w-16 place-items-center rounded-full bg-ok-soft text-ok"><IconCheck size={30} /></span>
                  <p class="text-2xl font-semibold">{t("home.allClear")}</p>
                </>
              }>
                <p class="text-[17px] font-medium text-ink-2">{t("home.dueToday")}</p>
                <Money paisa={owed() - late()} size="hero" />
                <Show when={late() > 0}>
                  <Badge tone="late">{t("home.lateExtra", { amount: money(late()) })}</Badge>
                </Show>
              </Show>
            </section>

            <section class="rounded-[28px] bg-surface p-2">
              <h2 class="px-3 pb-1 pt-3 text-lg font-semibold">{t("home.yourCommittees")}</h2>
              <ul class="flex flex-col">
                <For each={items()}>{i => <li><Row item={i} /></li>}</For>
              </ul>
            </section>
          </Show>
        </Loading>
      </Errored>
    </TabScreen>
  );
}

function Row(props: { item: HomeItem }) {
  const today = todayInPKT();
  const i = () => props.item;
  const tossIn = () => (i().toss_date ? daysBetween(today, i().toss_date!) : null);
  return (
    <a href={`/c/${i().id}`}
      class="flex items-center gap-3 rounded-[20px] p-3 active:bg-surface-2"
      onClick={e => { e.preventDefault(); tick(); navigate(`/c/${i().id}`); }}>
      <span class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2" stroke-opacity="0.35" />
          <circle cx="12" cy="4" r="2.6" fill="var(--turn)" />
        </svg>
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[17px] font-semibold">{i().name}</span>
        <span class="mt-0.5 flex flex-wrap items-center gap-2">
          <Switch fallback={<span class="text-sm text-ink-2">{contributionLabel(i().contribution_paisa, i().frequency, i().interval_days)}</span>}>
            <Match when={i().status === "forming"}><Badge tone="neutral">{t("status.joined", { joined: i().joined, total: i().member_count })}</Badge></Match>
            <Match when={i().status === "completed"}><Badge tone="neutral">{t("status.finished")}</Badge></Match>
            <Match when={i().overdue_paisa > 0}><Badge tone="late">{t("status.late", { amount: money(i().overdue_paisa) })}</Badge></Match>
            <Match when={i().due_today_paisa > 0}><Badge tone="due">{t("status.due")}</Badge></Match>
            <Match when={i().today_state === "submitted"}><Badge tone="checking">{t("status.checking")}</Badge></Match>
            <Match when={i().today_state === "verified"}><Badge tone="paid">{t("status.paid")}</Badge></Match>
          </Switch>
        </span>
      </span>
      <span class="shrink-0 text-end">
        <Switch>
          <Match when={i().status !== "active" || i().start_date > today}>
            <span class="text-sm text-ink-2">{t("status.starts", { date: dateShort(i().start_date) })}</span>
          </Match>
          <Match when={tossIn() !== null}>
            <span class="num block text-[15px] font-semibold text-ink-2">{tossIn() === 0 ? t("status.tossToday") : t("status.tossIn", { n: tossIn()! })}</span>
          </Match>
        </Switch>
      </span>
      <span class="text-ink-3 rtl:-scale-x-100"><IconChevron /></span>
    </a>
  );
}

function Empty() {
  return (
    <div class="flex flex-1 flex-col items-center justify-center gap-7 py-6 text-center">
      <MemberRing total={5} seats={[]} size={220} label={t("c.ringLabel", { total: 5, joined: 0 })} />
      <div>
        <h1 class="text-[28px] font-bold">{t("home.emptyTitle")}</h1>
        <p class="mx-auto mt-2 max-w-[19rem] text-[17px] text-ink-2">{t("home.emptyBody")}</p>
      </div>
      <div class="flex w-full flex-col gap-3">
        <Button onClick={() => navigate("/new")}>{t("home.start")}</Button>
        <Button variant="secondary" onClick={() => navigate("/join")}>{t("home.haveCode")}</Button>
      </div>
      <p class="text-sm text-ink-3">{t("home.how")}</p>
    </div>
  );
}
