import { createSignal, Show, untrack } from "solid-js";
import { saveProfile, signOut, type Profile } from "../lib/auth";
import { describeError } from "../lib/errors";
import { formatPkMobile, normalizePkMobile } from "../domain/phone";
import { Button, Card, ErrorNote, Field, inputClass, Screen } from "../ui/kit";

export function Me(props: { me: Profile; onSaved: () => void }) {
  const [name, setName] = createSignal(untrack(() => props.me.display_name));
  const [phone, setPhone] = createSignal(untrack(() => props.me.phone ?? ""));
  const [status, setStatus] = createSignal<"idle" | "saving" | "saved">("idle");
  const [error, setError] = createSignal("");

  const save = async (e: SubmitEvent) => {
    e.preventDefault();
    const p = normalizePkMobile(phone());
    if (name().trim().length < 2) return setError("Enter your name.");
    if (!p) return setError("Enter a Pakistani mobile number, like 0300 1234567.");
    setStatus("saving");
    setError("");
    try {
      await saveProfile(untrack(() => props.me.id), name().trim(), p);
      setStatus("saved");
      props.onSaved();
    } catch (err) {
      setError(describeError(err));
      setStatus("idle");
    }
  };

  return (
    <Screen title="Me" tabs>
      <form class="flex flex-col gap-4" onSubmit={save} novalidate>
        <Card class="flex flex-col gap-5">
          <Field label="Your name">
            <input class={inputClass} autocomplete="name" value={name()} onInput={e => { setName(e.currentTarget.value); setStatus("idle"); }} />
          </Field>
          <Field label="JazzCash number you pay from" hint={normalizePkMobile(phone()) ? `Saved as ${formatPkMobile(normalizePkMobile(phone())!)}` : "Helps the organizer match your payments."}>
            <input class={[inputClass, "tracking-wide"]} type="tel" inputmode="numeric" value={phone()} onInput={e => { setPhone(e.currentTarget.value); setStatus("idle"); }} />
          </Field>
        </Card>
        <Show when={error()}><ErrorNote message={error()} /></Show>
        <Button type="submit" disabled={status() === "saving"}>{status() === "saving" ? "Saving…" : status() === "saved" ? "Saved ✓" : "Save"}</Button>
      </form>

      <Card class="flex flex-col gap-1">
        <p class="font-medium text-bari-ink">Your safety</p>
        <p class="text-sm leading-relaxed text-bari-muted">Bari never asks for your JazzCash PIN, OTP or password, and never moves money. Anyone asking for those is not Bari.</p>
      </Card>

      <Button variant="secondary" onClick={() => signOut()}>Sign out</Button>
      <p class="text-center text-xs text-bari-muted">Bari · bari.rabtx.dev</p>
    </Screen>
  );
}
