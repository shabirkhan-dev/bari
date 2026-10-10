import { createSignal, For, Match, onSettled, Switch } from "solid-js";
import { getHome, type HomeItem } from "../lib/api";
import { describeError } from "../lib/errors";
import { navigate } from "../lib/router";
import { readSharedFromCache, stashShared } from "../lib/shared";
import { contributionLabel } from "../domain/display";
import { t } from "../i18n";
import { Card, ErrorNote, Screen, Skeleton, tick } from "../ui/kit";
import { IconChevron } from "../ui/icons";

/** Landing page for JazzCash → Share → Bari. */
export function Share() {
  const [state, setState] = createSignal<{ received: boolean; active: HomeItem[] } | null>(null);
  const [error, setError] = createSignal("");

  onSettled(() => {
    void (async () => {
      try {
        const [shared, home] = await Promise.all([readSharedFromCache(), getHome()]);
        const received = !!(shared.file || shared.text);
        const active = home.filter(h => h.status === "active");
        stashShared(shared);
        // One running committee: go straight to paying.
        if (received && active.length === 1) return navigate(`/c/${active[0]!.id}/pay`, { replace: true });
        setState({ received, active });
      } catch (e) {
        setError(describeError(e));
      }
    })();
  });

  return (
    <Screen backTo="/" title={t("pay.receipt")}>
      <Switch fallback={<Skeleton lines={2} />}>
        <Match when={error()}><ErrorNote message={error()} /></Match>
        <Match when={state() && !state()!.received}><Card><p class="text-[17px]">{t("share.none")}</p></Card></Match>
        <Match when={state() && state()!.active.length === 0}><Card><p class="text-[17px]">{t("share.noCommittee")}</p></Card></Match>
        <Match when={state()}>
          {s => (
            <>
              <h2 class="px-1 text-lg font-semibold">{t("share.pick")}</h2>
              <Card class="p-2">
                <For each={s().active}>{c => (
                  <button type="button" class="flex w-full items-center gap-3 rounded-[20px] p-3 text-start active:bg-surface-2"
                    onClick={() => { tick(); navigate(`/c/${c.id}/pay`, { replace: true }); }}>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[17px] font-semibold">{c.name}</span>
                      <span class="block text-sm text-ink-2">{contributionLabel(c.contribution_paisa, c.frequency, c.interval_days)}</span>
                    </span>
                    <span class="text-ink-3 rtl:-scale-x-100"><IconChevron /></span>
                  </button>
                )}</For>
              </Card>
            </>
          )}
        </Match>
      </Switch>
    </Screen>
  );
}
