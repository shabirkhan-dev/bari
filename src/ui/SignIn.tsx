import { createSignal, Show, untrack } from "solid-js";
import { saveProfile, signInWithGoogle, type Profile } from "../lib/auth";
import { formatPkMobile, normalizePkMobile } from "../domain/phone";
import { Mark } from "./Mark";
import { describeError } from "../lib/errors";

export function Splash() {
  return (
    <main class="grid min-h-dvh place-items-center bg-bari-emerald" aria-busy="true">
      <Mark size={88} onDark />
    </main>
  );
}

export function Login() {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      await signInWithGoogle(); // navigates away to Google
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  return (
    <main class="flex min-h-dvh flex-col bg-bari-emerald px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(4rem,env(safe-area-inset-top))] text-white">
      <div class="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <Mark size={112} onDark />
        <div>
          <h1 class="text-6xl font-bold tracking-tight">bari</h1>
          <p class="mt-3 text-lg text-white/85">Har ek ki bari aati hai.</p>
        </div>
        <p class="max-w-xs text-base leading-relaxed text-white/80">
          Your bachat committee in one place: who has paid, whose turn is next, and every rupee checked.
        </p>
      </div>

      <div class="mx-auto flex w-full max-w-sm flex-col gap-3">
        <Show when={error()}>
          <p role="alert" class="rounded-xl bg-white px-4 py-3 text-sm text-red-800">{error()}</p>
        </Show>
        <button
          type="button"
          class="h-14 w-full rounded-2xl bg-white text-lg font-semibold text-bari-ink shadow-sm active:scale-[0.99] disabled:opacity-70"
          disabled={busy()}
          onClick={start}
        >
          {busy() ? "Opening Google…" : "Continue with Google"}
        </button>
        <p class="text-center text-xs leading-relaxed text-white/75">
          We never ask for your JazzCash PIN, OTP or password.
        </p>
      </div>
    </main>
  );
}

/** One-time step after first sign-in: name as the committee knows you + the JazzCash number you pay from. */
export function CompleteProfile(props: { profile: Profile; onSaved: () => void }) {
  const [name, setName] = createSignal(untrack(() => (props.profile.display_name === "Member" ? "" : props.profile.display_name)));
  const [phone, setPhone] = createSignal(untrack(() => props.profile.phone ?? ""));
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    const n = name().trim();
    const p = normalizePkMobile(phone());
    if (n.length < 2) return setError("Enter your name as the committee knows you.");
    if (!p) return setError("Enter a Pakistani mobile number, like 0300 1234567.");
    setSaving(true);
    setError("");
    try {
      await saveProfile(untrack(() => props.profile.id), n, p);
      props.onSaved();
    } catch (err) {
      setError(describeError(err));
      setSaving(false);
    }
  };

  return (
    <main class="min-h-dvh bg-bari-ground px-6 pb-8 pt-[max(3rem,env(safe-area-inset-top))] text-bari-ink">
      <form class="mx-auto flex max-w-sm flex-col gap-6" onSubmit={submit} novalidate>
        <div class="flex items-center gap-3">
          <Mark size={40} />
          <span class="text-2xl font-bold tracking-tight">bari</span>
        </div>
        <div>
          <h1 class="text-2xl font-semibold">One quick step</h1>
          <p class="mt-1 text-bari-muted">So your committee knows it's you.</p>
        </div>

        <label class="flex flex-col gap-2">
          <span class="font-medium">Your name</span>
          <input
            class="h-12 rounded-xl border border-bari-line bg-white px-4 text-lg outline-none focus:border-bari-emerald focus:ring-2 focus:ring-bari-emerald/20"
            autocomplete="name"
            value={name()}
            onInput={e => setName(e.currentTarget.value)}
          />
        </label>

        <label class="flex flex-col gap-2">
          <span class="font-medium">JazzCash number you pay from</span>
          <input
            class="h-12 rounded-xl border border-bari-line bg-white px-4 text-lg tracking-wide outline-none focus:border-bari-emerald focus:ring-2 focus:ring-bari-emerald/20"
            type="tel"
            inputmode="numeric"
            autocomplete="tel"
            placeholder="0300 1234567"
            value={phone()}
            onInput={e => setPhone(e.currentTarget.value)}
          />
          <span class="text-sm text-bari-muted">
            <Show when={normalizePkMobile(phone())} fallback="Helps the organizer match your payments.">
              {p => `Saved as ${formatPkMobile(p())}`}
            </Show>
          </span>
        </label>

        <Show when={error()}>
          <p role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error()}</p>
        </Show>

        <button
          type="submit"
          class="h-14 rounded-2xl bg-bari-emerald text-lg font-semibold text-white active:scale-[0.99] disabled:opacity-70"
          disabled={saving()}
        >
          {saving() ? "Saving…" : "Continue"}
        </button>
      </form>
    </main>
  );
}
