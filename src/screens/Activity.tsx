import { createMemo, Errored, For, Loading, Show } from "solid-js";
import { auditFeed, type AuditEntry } from "../lib/api";
import { describeError } from "../lib/errors";
import { lang, money, t } from "../i18n";
import { en, type Key } from "../i18n/strings";
import { Card, ErrorNote, Screen, Skeleton } from "../ui/kit";

const when = (iso: string) =>
  new Intl.DateTimeFormat(lang() === "ur" ? "ur-PK" : "en-GB", {
    timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", numberingSystem: "latn"
  }).format(new Date(iso));

/** One audit row as a plain sentence. */
export function describeActivity(e: AuditEntry): string {
  const d = e.details as Record<string, unknown>;
  const params = {
    actor: e.actor_name ?? t("act.system"),
    amount: typeof d.amount_paisa === "number" ? money(d.amount_paisa) : "",
    reason: typeof d.reason === "string" ? d.reason : "",
    round: typeof d.round === "number" ? d.round : "",
    name: typeof d.name === "string" ? d.name : "",
    action: e.action
  };
  const key = `act.${e.action}`;
  return key in en ? t(key as Key, params) : t("act.other", params);
}

export function Activity(props: { id: string }) {
  const feed = createMemo(() => auditFeed(props.id));
  return (
    <Screen backTo={`/c/${props.id}/settings`} title={t("settings.activity")}>
      <Errored fallback={err => <ErrorNote message={describeError(err())} />}>
        <Loading fallback={<Skeleton lines={4} />}>
          <Show when={feed().length > 0} fallback={<Card><p>{t("activity.empty")}</p></Card>}>
            <Card class="p-2">
              <ol>
                <For each={feed()}>{e => (
                  <li class="flex gap-3 rounded-[20px] p-3">
                    <span class="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-ink-3" aria-hidden="true" />
                    <span class="min-w-0 flex-1">
                      <span class="block text-[16px] leading-snug">{describeActivity(e)}</span>
                      <time class="num block text-sm text-ink-3" datetime={e.created_at}>{when(e.created_at)}</time>
                    </span>
                  </li>
                )}</For>
              </ol>
            </Card>
          </Show>
        </Loading>
      </Errored>
    </Screen>
  );
}
