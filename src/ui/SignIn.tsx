import { createSignal, Show, untrack } from "solid-js";
import { saveProfile, type Profile } from "../lib/auth";
import { formatPkMobile, normalizePkMobile } from "../domain/phone";
import { describeError } from "../lib/errors";
import { lang, setLang, t } from "../i18n";
import { Button, ErrorNote, Field, inputClass, tick } from "./kit";
import { Mark } from "./Mark";

export function Splash() {
  return (
    <main class="grid min-h-dvh place-items-center bg-bg" aria-busy="true">
      <Mark size={88} />
    </main>
  );
}

export function LangSwitch() {
  return (
    <button type="button"
      class="h-10 rounded-full border border-line bg-surface px-4 text-[15px] font-semibold text-ink active:scale-95"
      onClick={() => { tick(); setLang(lang() === "ur" ? "en" : "ur"); }}
      lang={lang() === "ur" ? "en" : "ur"}>
      {lang() === "ur" ? "English" : "اردو"}
    </button>
  );
}

/** One-time step after first sign-in: name + the JazzCash number the member pays from. */
export function CompleteProfile(props: { profile: Profile; onSaved: () => void }) {
  const [name, setName] = createSignal(untrack(() => (props.profile.display_name === "Member" ? "" : props.profile.display_name)));
  const [phone, setPhone] = createSignal(untrack(() => props.profile.phone ?? ""));
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    const n = name().trim();
    const p = normalizePkMobile(phone());
    if (n.length < 2) return setError(t("profile.errName"));
    if (!p) return setError(t("profile.errPhone"));
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
    <main class="flex min-h-dvh flex-col bg-bg px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))]">
      <div class="flex items-center justify-between">
        <Mark size={40} />
        <LangSwitch />
      </div>
      <form class="mt-10 flex flex-1 flex-col gap-6" onSubmit={submit} novalidate>
        <div>
          <h1 class="text-[32px] font-bold leading-tight">{t("profile.title")}</h1>
          <p class="mt-2 text-[17px] text-ink-2">{t("profile.sub")}</p>
        </div>
        <div class="flex flex-col gap-5 rounded-[28px] bg-surface p-5">
          <Field label={t("profile.name")}>
            <input class={inputClass} autocomplete="name" value={name()} onInput={e => setName(e.currentTarget.value)} />
          </Field>
          <Field label={t("profile.phone")}
            hint={normalizePkMobile(phone()) ? t("profile.savedAs", { phone: formatPkMobile(normalizePkMobile(phone())!) }) : t("profile.phoneHint")}>
            <input class={[inputClass, "tracking-wide"]} type="tel" inputmode="numeric" autocomplete="tel" dir="ltr"
              placeholder="0300 1234567" value={phone()} onInput={e => setPhone(e.currentTarget.value)} />
          </Field>
        </div>
        <Show when={error()}><ErrorNote message={error()} /></Show>
        <div class="mt-auto">
          <Button type="submit" class="w-full" disabled={saving()}>{saving() ? t("common.saving") : t("common.continue")}</Button>
        </div>
      </form>
    </main>
  );
}
