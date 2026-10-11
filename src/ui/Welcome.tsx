import { createSignal, For, Show } from "solid-js";
import { signInWithGoogle } from "../lib/auth";
import { describeError } from "../lib/errors";
import { rememberPath } from "../lib/router";
import { lang, setLang, t } from "../i18n";
import { GAvatar, GIcon, GMoney, GNote, GSheet, WideHalo } from "./glass";
import { tick } from "./kit";

/** Signed-out start screen (Figma "Welcome"). Sign-in is Google; joining remembers the code first. */
export function Welcome() {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [joining, setJoining] = createSignal(false);
  const [code, setCode] = createSignal("");

  const start = async (after?: string) => {
    setBusy(true);
    setError("");
    try {
      if (after) rememberPath(after);
      else if (location.pathname !== "/") rememberPath(location.pathname); // e.g. an invite link
      await signInWithGoogle(); // navigates away to Google
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  return (
    <div class="g flex flex-col px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-[calc(22px+env(safe-area-inset-top))]">
      <header class="flex items-center justify-between">
        <span class="g-word text-[22px] leading-none" lang="en">bari</span>
        <div class="g-halo" style={{ width: "108px", height: "44px" }}>
          <div role="radiogroup" aria-label="Language" class="g-core grid grid-cols-2 gap-0" style={{ inset: "4px" }}>
            <For each={[{ v: "en" as const, l: "EN" }, { v: "ur" as const, l: "اردو" }]}>{o => (
              <button type="button" role="radio" lang={o.v} aria-checked={lang() === o.v ? "true" : "false"}
                class="h-full rounded-full text-[12px] font-semibold"
                style={lang() === o.v ? { background: "var(--g-cta)", color: "var(--g-cta-ink)" } : { color: "var(--g-ink)" }}
                onClick={() => { tick(); setLang(o.v); }}>{o.l}</button>
            )}</For>
          </div>
        </div>
      </header>

      <Preview />

      <section class="relative z-10 -mt-6 flex flex-col items-center text-center">
        <h1 class="g-serif text-[38px] leading-[44px] tracking-[-0.01em]">{t("g.w.title1")}<br />{t("g.w.title2")}</h1>
        <p class="mt-3.5 max-w-[310px] text-[14px] leading-[21px]" style={{ color: "var(--g-muted)" }}>{t("g.w.body")}</p>
      </section>

      <div class="mt-auto flex flex-col gap-2.5 pt-6">
        <Show when={error()}><GNote tone="error">{error()}</GNote></Show>
        <WideHalo h={60} dark disabled={busy()} onClick={() => start()}>
          <span class="grid h-6 w-6 place-items-center rounded-full bg-white"><GIcon.google size={14} /></span>
          <span class="text-[15px] font-medium">{busy() ? t("login.opening") : t("login.google")}</span>
        </WideHalo>
        <WideHalo h={60} onClick={() => setJoining(true)}><span class="text-[15px] font-medium">{t("g.w.join")}</span></WideHalo>
        <p class="mt-1 text-center text-[13px]" style={{ color: "var(--g-ink-2)" }}>
          {t("g.w.have")}{" "}
          <button type="button" class="font-semibold underline-offset-4 active:underline" style={{ color: "var(--g-ink)" }} onClick={() => start()}>{t("g.w.login")}</button>
        </p>
      </div>

      <GSheet open={joining()} onClose={() => setJoining(false)} label={t("g.w.join")}>
        <h2 class="g-serif text-[24px]">{t("g.w.join")}</h2>
        <p class="text-[14px]" style={{ color: "var(--g-ink-2)" }}>{t("g.w.joinBody")}</p>
        <label class="flex flex-col gap-1.5">
          <span class="text-[12px]" style={{ color: "var(--g-muted)" }}>{t("g.w.code")}</span>
          <input class="h-14 w-full rounded-2xl px-4 text-center text-[22px] font-semibold uppercase tracking-[0.2em] outline-none" dir="ltr"
            style={{ background: "var(--g-inner)", color: "var(--g-ink)" }} autocomplete="off" autocapitalize="characters" placeholder="K7QM2XWP"
            value={code()} onInput={e => setCode(e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))} />
        </label>
        <WideHalo h={60} dark disabled={busy() || code().length < 6} onClick={() => start(`/join/${code()}`)}>
          <span class="grid h-6 w-6 place-items-center rounded-full bg-white"><GIcon.google size={14} /></span>
          <span class="text-[15px] font-medium">{t("login.google")}</span>
        </WideHalo>
        <p class="text-center text-[12px]" style={{ color: "var(--g-muted)" }}>{t("app.safetyShort")}</p>
      </GSheet>
    </div>
  );
}

/** Decorative stack of app cards (sample data, hidden from screen readers). */
function Preview() {
  const bars = [10, 12, 9, 13, 22, 26, 34, 38, 14, 12];
  return (
    <div aria-hidden="true" class="pointer-events-none relative mx-auto mt-9 h-[372px] w-full max-w-[350px] select-none">
      <div class="g-card absolute start-0 top-[38px] h-[300px] w-[160px] opacity-40" />
      <div class="g-card absolute end-0 top-[38px] h-[300px] w-[160px] opacity-40" />
      <div class="g-card absolute inset-x-[30px] top-0 flex h-[380px] flex-col items-center px-3 pt-4"
        style={{ "mask-image": "linear-gradient(to bottom, #000 62%, transparent 96%)", "-webkit-mask-image": "linear-gradient(to bottom, #000 62%, transparent 96%)" }}>
        <span class="g-halo" style={{ height: "38px" }}><span class="relative m-[4px] flex h-[28px] items-center rounded-full px-5 text-[11px] font-semibold" style={{ background: "var(--g-inner)" }}>{t("g.w.sample")}</span></span>
        <p class="g-serif mt-3 text-[14px]" style={{ color: "var(--g-ink-2)" }}>{t("g.h.pot")}</p>
        <GMoney paisa={3000000} size={28} class="mt-1" />
        <div class="mt-3.5 grid w-full grid-cols-2 gap-2">
          <div class="g-card h-[120px] px-2.5 pt-2.5">
            <p class="g-serif text-[11px]">{t("g.h.savings")}</p>
            <div class="mt-7 flex h-[42px] items-end justify-center gap-[2px]">
              <For each={bars}>{(h, i) => <span class="w-[1.3px]" style={{ height: `${h}px`, background: i() >= 4 && i() <= 7 ? "var(--g-emerald)" : "var(--g-bar)" }} />}</For>
            </div>
          </div>
          <div class="g-card h-[120px] px-2.5 pt-2.5">
            <p class="g-serif text-[11px]">{t("g.h.members")}</p>
            <div class="mt-2.5 grid grid-cols-3 gap-1.5">
              <For each={["Ayesha", "Bilal", "Hira", "Usman", "Sara"]}>{n => <GAvatar name={n} size={24} />}</For>
            </div>
          </div>
        </div>
        <div class="g-card mt-2 w-full px-3 py-2.5">
          <p class="g-serif text-[12px]" style={{ color: "var(--g-ink-2)" }}>{t("g.w.payments")}</p>
          <div class="mt-2 flex items-center gap-2 text-[11px]" style={{ color: "var(--g-faint)" }}>
            <GAvatar name="Ayesha" size={22} />
            <span class="g-serif flex-1">{t("g.w.sampleMember")}</span>
            <span dir="ltr">+Rs 200</span>
          </div>
        </div>
      </div>
    </div>
  );
}
