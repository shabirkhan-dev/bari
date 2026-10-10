import { createMemo, Errored, For, Loading, onSettled, Show } from "solid-js";
import { listNotifications, markAllRead, type Notice } from "../lib/api";
import { describeError } from "../lib/errors";
import { navigate } from "../lib/router";
import { bumpUnread } from "../lib/unread";
import { lang, money, t } from "../i18n";
import { en, type Key } from "../i18n/strings";
import { Card, ErrorNote, Screen, Skeleton, tick } from "../ui/kit";

/** A notification as one sentence in the user's language. */
export function describeNotice(n: Notice): string {
  const p = n.payload;
  const params = {
    name: typeof p.member_name === "string" ? p.member_name : "",
    amount: typeof p.amount_paisa === "number" ? money(p.amount_paisa) : "",
    reason: typeof p.reason === "string" ? p.reason : "",
    round: typeof p.round === "number" ? p.round : "",
    number: typeof p.number === "string" ? p.number : ""
  };
  const key = `n.${n.kind}`;
  return key in en ? t(key as Key, params) : t("n.other");
}

const when = (iso: string) =>
  new Intl.DateTimeFormat(lang() === "ur" ? "ur-PK" : "en-GB", {
    timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", numberingSystem: "latn"
  }).format(new Date(iso));

/** Where tapping a notification goes. */
function target(n: Notice): string | null {
  if (!n.committee_id) return null;
  if (n.kind === "payment.submitted") return `/c/${n.committee_id}/review`;
  if ((n.kind === "toss.drawn" || n.kind === "payout.recorded") && typeof n.payload.round === "number") return `/c/${n.committee_id}/round/${n.payload.round}`;
  return `/c/${n.committee_id}`;
}

export function Inbox() {
  const items = createMemo(() => listNotifications());
  // Opening the inbox marks everything read; the list still shows what was new.
  onSettled(() => { void markAllRead().then(bumpUnread).catch(() => { /* retried next open */ }); });

  return (
    <Screen backTo="/" title={t("inbox.title")}>
      <Errored fallback={err => <ErrorNote message={describeError(err())} />}>
        <Loading fallback={<Skeleton lines={4} />}>
          <Show when={items().length > 0} fallback={<Card><p class="text-[17px]">{t("inbox.empty")}</p></Card>}>
            <Card class="p-2">
              <ul>
                <For each={items()}>{n => (
                  <li>
                    <button type="button" class="flex w-full gap-3 rounded-[20px] p-3 text-start active:bg-surface-2"
                      onClick={() => { const to = target(n); if (to) { tick(); navigate(to); } }}>
                      <span class={["mt-2 h-2.5 w-2.5 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand"]} aria-hidden="true" />
                      <span class="min-w-0 flex-1">
                        <span class={["block text-[16px] leading-snug", { "font-semibold": !n.read_at }]}>{describeNotice(n)}</span>
                        <span class="block text-sm text-ink-3">
                          <Show when={n.committees?.name}>{n.committees!.name} · </Show>
                          <time class="num" datetime={n.created_at}>{when(n.created_at)}</time>
                        </span>
                      </span>
                    </button>
                  </li>
                )}</For>
              </ul>
            </Card>
          </Show>
        </Loading>
      </Errored>
    </Screen>
  );
}
