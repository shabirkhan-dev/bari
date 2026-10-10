import { createSignal, Show, untrack } from "solid-js";
import { joinCommittee } from "../lib/api";
import { navigate } from "../lib/router";
import { describeError } from "../lib/errors";
import { t } from "../i18n";
import { Button, ErrorNote, Screen } from "../ui/kit";
import { IconKey } from "../ui/icons";

const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

export function Join(props: { code?: string }) {
  const [code, setCode] = createSignal(untrack(() => clean(props.code ?? "")));
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const join = async () => {
    if (code().length !== 8) return setError(t("join.err8"));
    setBusy(true);
    setError("");
    try {
      const id = await joinCommittee(code());
      navigate(`/c/${id}`, { replace: true });
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };

  return (
    <Screen backTo="/" bottom={
      <Button class="w-full" disabled={busy() || code().length !== 8} onClick={join}>{busy() ? t("join.joining") : t("join.submit")}</Button>
    }>
      <form class="flex flex-col items-center gap-6 pt-8 text-center" onSubmit={e => { e.preventDefault(); join(); }} novalidate>
        <span class="grid h-20 w-20 place-items-center rounded-full bg-surface text-ink"><IconKey /></span>
        <div>
          <h1 class="text-[30px] font-bold">{t("join.title")}</h1>
          <p class="mx-auto mt-2 max-w-[19rem] text-[16px] text-ink-2">{t("join.hint")}</p>
        </div>
        <label class="w-full">
          <span class="sr-only">{t("join.code")}</span>
          <input
            class="latin h-20 w-full rounded-[24px] border border-transparent bg-surface text-center text-[34px] font-bold uppercase tracking-[0.3em] text-ink outline-none placeholder:text-ink-3/50 focus:border-ink/40"
            dir="ltr" autocomplete="one-time-code" autocapitalize="characters" spellcheck={false}
            placeholder="ABCD2345" value={code()} onInput={e => setCode(clean(e.currentTarget.value))} />
        </label>
        <Show when={error()}><ErrorNote message={error()} /></Show>
      </form>
    </Screen>
  );
}
