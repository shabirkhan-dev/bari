import { createSignal, Show, untrack } from "solid-js";
import { joinCommittee } from "../lib/api";
import { navigate } from "../lib/router";
import { describeError } from "../lib/errors";
import { Button, Card, ErrorNote, inputClass, Screen } from "../ui/kit";

const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

export function Join(props: { code?: string }) {
  const [code, setCode] = createSignal(untrack(() => clean(props.code ?? "")));
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const join = async (e?: SubmitEvent) => {
    e?.preventDefault();
    if (code().length !== 8) return setError("The code has 8 letters and numbers.");
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
    <Screen title="Join a committee" backTo="/">
      <form class="flex flex-col gap-4" onSubmit={join} novalidate>
        <Card class="flex flex-col gap-4">
          <label class="flex flex-col gap-2">
            <span class="font-medium text-bari-ink">Invite code</span>
            <input
              class={[inputClass, "h-16 text-center font-mono text-3xl font-bold uppercase tracking-[0.25em]"]}
              autocomplete="one-time-code"
              autocapitalize="characters"
              spellcheck={false}
              placeholder="ABCD2345"
              value={code()}
              onInput={e => setCode(clean(e.currentTarget.value))}
            />
          </label>
          <p class="text-sm text-bari-muted">The organizer can share it from the committee screen.</p>
        </Card>
        <Show when={error()}><ErrorNote message={error()} /></Show>
        <Button type="submit" disabled={busy() || code().length !== 8}>{busy() ? "Joining…" : "Join committee"}</Button>
      </form>
    </Screen>
  );
}
