import { createSignal, Show, untrack } from "solid-js";
import { saveProfile, signOut, type Profile } from "../lib/auth";
import { describeError } from "../lib/errors";
import { setTheme, theme, type ThemeChoice } from "../lib/theme";
import { formatPkMobile, normalizePkMobile } from "../domain/phone";
import { lang, setLang, t, type Lang } from "../i18n";
import { Avatar, Button, Card, ErrorNote, Field, inputClass, Segmented, TabScreen } from "../ui/kit";

export function Me(props: { me: Profile; onSaved: () => void }) {
  const [name, setName] = createSignal(untrack(() => props.me.display_name));
  const [phone, setPhone] = createSignal(untrack(() => props.me.phone ?? ""));
  const [status, setStatus] = createSignal<"idle" | "saving" | "saved">("idle");
  const [error, setError] = createSignal("");

  const save = async (e: SubmitEvent) => {
    e.preventDefault();
    const p = normalizePkMobile(phone());
    if (name().trim().length < 2) return setError(t("profile.errName"));
    if (!p) return setError(t("profile.errPhone"));
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
    <TabScreen>
      <section class="flex flex-col items-center gap-3 pt-6 text-center">
        <Avatar name={props.me.display_name} size={88} />
        <h1 class="text-[26px] font-bold">{props.me.display_name}</h1>
        <Show when={props.me.phone}><p class="num text-ink-2" dir="ltr">{formatPkMobile(props.me.phone!)}</p></Show>
      </section>

      <Card class="flex flex-col gap-5">
        <Field label={t("me.language")}>
          <Segmented<Lang> label={t("me.language")} value={lang()} onChange={setLang}
            options={[{ value: "en", label: "English" }, { value: "ur", label: "اردو" }]} />
        </Field>
        <Field label={t("me.theme")}>
          <Segmented<ThemeChoice> label={t("me.theme")} value={theme()} onChange={setTheme}
            options={[{ value: "auto", label: t("me.auto") }, { value: "light", label: t("me.light") }, { value: "dark", label: t("me.dark") }]} />
        </Field>
      </Card>

      <form class="flex flex-col gap-4" onSubmit={save} novalidate>
        <Card class="flex flex-col gap-5">
          <Field label={t("profile.name")}>
            <input class={inputClass} autocomplete="name" value={name()} onInput={e => { setName(e.currentTarget.value); setStatus("idle"); }} />
          </Field>
          <Field label={t("profile.phone")}
            hint={normalizePkMobile(phone()) ? t("profile.savedAs", { phone: formatPkMobile(normalizePkMobile(phone())!) }) : t("profile.phoneHint")}>
            <input class={[inputClass, "tracking-wide"]} type="tel" inputmode="numeric" dir="ltr" value={phone()} onInput={e => { setPhone(e.currentTarget.value); setStatus("idle"); }} />
          </Field>
          <Show when={error()}><ErrorNote message={error()} /></Show>
          <Button type="submit" variant="soft" disabled={status() === "saving"}>
            {status() === "saving" ? t("common.saving") : status() === "saved" ? t("common.saved") : t("common.save")}
          </Button>
        </Card>
      </form>

      <Card class="flex flex-col gap-1">
        <p class="text-[17px] font-semibold">{t("me.safetyTitle")}</p>
        <p class="text-[15px] leading-relaxed text-ink-2">{t("me.safetyBody")}</p>
      </Card>

      <Button variant="secondary" onClick={() => signOut()}>{t("me.signOut")}</Button>
      <p class="latin text-center text-sm text-ink-3">bari.rabtx.dev</p>
    </TabScreen>
  );
}
