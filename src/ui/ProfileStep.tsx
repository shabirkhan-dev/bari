import { createSignal, For, onCleanup, Show, untrack } from "solid-js";
import { saveProfile, signOut, type Profile } from "../lib/auth";
import { describeError } from "../lib/errors";
import { formatPkMobile, normalizePkMobile } from "../domain/phone";
import { t } from "../i18n";
import { GIcon, gInput, gInputStyle, GNote, Halo, WideHalo } from "./glass";
import { tick } from "./kit";

/**
 * One-time step after Google sign-in (Figma "Verify phone" look, without SMS):
 * 1) the JazzCash number you pay from, on a keypad; 2) your name.
 */
export function ProfileStep(props: { profile: Profile; onSaved: () => void }) {
  const [step, setStep] = createSignal<1 | 2>(1);
  const [digits, setDigits] = createSignal(untrack(() => props.profile.phone ?? ""));
  const [name, setName] = createSignal(untrack(() => (props.profile.display_name === "Member" ? "" : props.profile.display_name)));
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const valid = () => !!normalizePkMobile(digits());

  const press = (k: string) => {
    tick();
    setError("");
    if (k === "del") setDigits(d => d.slice(0, -1));
    else if (digits().length < 11) setDigits(d => d + k);
  };
  const next = () => {
    if (!valid()) return setError(t("profile.errPhone"));
    setError("");
    setStep(2);
  };
  const save = async () => {
    const p = normalizePkMobile(digits());
    if (name().trim().length < 2) return setError(t("profile.errName"));
    if (!p) { setStep(1); return setError(t("profile.errPhone")); }
    setSaving(true);
    setError("");
    try { await saveProfile(props.profile.id, name().trim(), p); props.onSaved(); }
    catch (e) { setError(describeError(e)); setSaving(false); }
  };
  // A hardware keyboard works too.
  const onKey = (e: KeyboardEvent) => {
    if (step() !== 1 || (e.target as HTMLElement | null)?.tagName === "INPUT") return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === "Backspace") press("del");
    else if (e.key === "Enter") next();
  };
  document.addEventListener("keydown", onKey);
  onCleanup(() => document.removeEventListener("keydown", onKey));
  // "0300 123 4417" shown in boxes as it's typed.
  const shown = () => digits().padEnd(11, " ");

  return (
    <div class="g flex flex-col px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-[calc(12px+env(safe-area-inset-top))]">
      <header class="relative flex h-14 items-center justify-center">
        <span class="absolute start-0">
          <Halo w={56} label={t("common.back")} onClick={() => (step() === 2 ? setStep(1) : void signOut())}><GIcon.undo /></Halo>
        </span>
        <span class="text-[12px]" style={{ color: "var(--g-muted)" }}>{t("pf.step", { n: step() })}</span>
      </header>

      <Show when={step() === 1} fallback={
        <>
          <h1 class="g-serif mt-8 text-center text-[32px]">{t("pf.nameTitle")}</h1>
          <p class="mt-2 text-center text-[13px]" style={{ color: "var(--g-muted)" }}>{t("pf.nameSub")}</p>
          <input class={[gInput, "mt-8 text-center"]} style={gInputStyle} autocomplete="name" value={name()} aria-label={t("profile.name")}
            onInput={e => setName(e.currentTarget.value)} onKeyDown={e => { if (e.key === "Enter") void save(); }} />
          <div class="mt-auto flex flex-col gap-3 pt-6">
            <Show when={error()}><GNote tone="error">{error()}</GNote></Show>
            <WideHalo h={64} dark disabled={saving()} onClick={save}><span class="text-[15px] font-medium">{saving() ? t("common.saving") : t("pf.done")}</span></WideHalo>
          </div>
        </>
      }>
        <h1 class="g-serif mt-6 text-center text-[32px]">{t("pf.numberTitle")}</h1>
        <p class="mx-auto mt-2 max-w-[300px] text-center text-[13px]" style={{ color: "var(--g-muted)" }}>{t("pf.numberSub")}</p>

        <div class="mt-6 flex justify-center gap-1" dir="ltr" role="textbox" aria-label={t("profile.phone")} aria-readonly="true">
          <For each={[...shown()]}>{(ch, i) => (
            <span class={["grid h-12 w-[26px] place-items-center rounded-[10px] text-[20px]", (i() === 3 || i() === 6) && "me-1.5"]}
              style={{
                "font-family": "Newsreader, serif",
                background: "var(--g-card-strong)",
                border: `1px solid ${i() === digits().length ? "var(--g-chip)" : "var(--g-card-border)"}`
              }}>{ch.trim()}</span>
          )}</For>
        </div>
        <p class="mt-3 text-center text-[13px]" style={{ color: valid() ? "var(--g-emerald)" : "var(--g-muted)" }} aria-live="polite">
          {valid() ? t("profile.savedAs", { phone: formatPkMobile(normalizePkMobile(digits())!) }) : t("profile.phoneHint")}
        </p>

        <div class="mx-auto mt-5 grid w-full max-w-[330px] grid-cols-3 gap-2.5" dir="ltr">
          <For each={["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"]}>{k => (
            <Show when={k} fallback={<span />}>
              <button type="button" class="g-halo h-[60px] w-full" aria-label={k === "del" ? t("pf.delete") : k} onClick={() => press(k)}>
                <span class="g-core text-[22px] font-medium">{k === "del" ? <GIcon.backspace /> : k}</span>
              </button>
            </Show>
          )}</For>
        </div>

        <div class="mt-auto flex flex-col gap-3 pt-6">
          <Show when={error()}><GNote tone="error">{error()}</GNote></Show>
          <WideHalo h={64} dark disabled={!valid()} onClick={next}><span class="text-[15px] font-medium">{t("pf.next")}</span></WideHalo>
        </div>
      </Show>
    </div>
  );
}
