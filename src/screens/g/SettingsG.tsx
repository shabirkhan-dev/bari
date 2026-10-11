import { createMemo, createSignal, Errored, Loading, Show, untrack } from "solid-js";
import { mySettings, setReminder, type MySettings } from "../../lib/api";
import { saveProfile, signOut, type Profile } from "../../lib/auth";
import { describeError } from "../../lib/errors";
import { back } from "../../lib/router";
import { disablePush, enablePush, pushSupported } from "../../lib/push";
import { setTheme, theme, type ThemeChoice } from "../../lib/theme";
import { formatPkMobile, normalizePkMobile } from "../../domain/phone";
import { lang, setLang, t, timeOfDay, type Lang } from "../../i18n";
import { GAvatar, GIcon, gInput, gInputStyle, GLabel, GNote, GRow, GScreen, GSegmented, GSheet, Halo, Toggle, WideHalo } from "../../ui/glass";
import { tick } from "../../ui/kit";
import { TimeField } from "../../ui/pickers";
import { maskedPhone } from "./common";

export function SettingsG(props: { me: Profile; onSaved: () => void }) {
  const [editing, setEditing] = createSignal(false);
  const [rules, setRules] = createSignal(false);

  return (
    <GScreen title={t("st.title")} bottom={
      <>
        <Halo w={64} label={t("common.back")} onClick={() => back("/")}><GIcon.undo /></Halo>
        <button type="button" class="g-halo flex-1" style={{ height: "64px" }} onClick={() => { tick(); void signOut(); }}>
          <span class="g-core justify-start gap-3 ps-[5px]">
            <span class="grid h-10 w-10 place-items-center rounded-full border border-dashed" style={{ "border-color": "var(--g-dash)" }}><GIcon.logout /></span>
            <span class="text-[14px] font-medium">{t("st.logout")}</span>
          </span>
        </button>
      </>
    }>
      <button type="button" class="g-card mt-3 flex w-full items-center gap-4 px-4 py-4 text-start" onClick={() => { tick(); setEditing(true); }}>
        <Halo w={72}><GAvatar name={props.me.display_name} seed={props.me.id} size={58} /></Halo>
        <span class="min-w-0 flex-1">
          <span class="g-serif block truncate text-[21px]">{props.me.display_name}</span>
          <Show when={props.me.phone}><span class="mt-1 block text-[12px]" style={{ color: "var(--g-muted)" }} dir="ltr">{maskedPhone(props.me.phone!)}</span></Show>
        </span>
        <span style={{ color: "var(--g-muted)" }}><GIcon.arrow /></span>
      </button>

      <GLabel>{t("st.appearance")}</GLabel>
      <GSegmented<ThemeChoice> label={t("st.appearance")} value={theme()} onChange={setTheme}
        options={[{ value: "light", label: t("st.light") }, { value: "dark", label: t("st.dark") }, { value: "auto", label: t("st.auto") }]} />

      <GLabel>{t("st.language")}</GLabel>
      <GSegmented<Lang> label={t("st.language")} value={lang()} onChange={l => { setLang(l); void setReminder(null, null, l).catch(() => undefined); }}
        options={[{ value: "en", label: "English" }, { value: "ur", label: "اردو" }]} />

      <section class="g-card mt-5 px-4">
        <Reminder />
        <GRow icon={<GIcon.phone />} title={t("st.account")} sub={props.me.phone ? maskedPhone(props.me.phone) : ""}
          trailing={<Halo w={92} h={48} onClick={() => setEditing(true)}><span class="text-[13px] font-medium">{t("st.change")}</span></Halo>} />
        <GRow icon={<GIcon.help />} title={t("st.help")} sub={t("st.helpSub")} onClick={() => setRules(true)} last
          trailing={<span style={{ color: "var(--g-muted)" }}><GIcon.arrow /></span>} />
      </section>
      <p class="mt-4 text-center text-[11px]" style={{ color: "var(--g-faint)" }} lang="en">bari.rabtx.dev</p>

      <EditSheet open={editing()} me={props.me} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); props.onSaved(); }} />
      <GSheet open={rules()} onClose={() => setRules(false)} label={t("st.help")}>
        <h2 class="g-serif text-[24px]">{t("st.help")}</h2>
        {(["st.rules1", "st.rules2", "st.rules3", "st.rules4"] as const).map((k, i) => (
          <div class="flex gap-3">
            <span class="g-step">{i + 1}</span>
            <p class="text-[14px] leading-relaxed" style={{ color: "var(--g-ink-2)" }}>{t(k)}</p>
          </div>
        ))}
      </GSheet>
    </GScreen>
  );
}

/** Daily reminder: a push at the chosen time when today isn't paid yet. */
function Reminder() {
  const s = createMemo(() => mySettings());
  const off = () => <GRow icon={<GIcon.bell size={18} />} title={t("st.reminder")} sub={t("st.reminderOff")} />;
  return (
    <Errored fallback={off}>
      <Loading fallback={off()}>
        <ReminderRow s={s()} />
      </Loading>
    </Errored>
  );
}

function ReminderRow(props: { s: MySettings }) {
  const [on, setOn] = createSignal(untrack(() => props.s.reminder_on));
  const [time, setTime] = createSignal(untrack(() => props.s.reminder_time));
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal("");
  const [picking, setPicking] = createSignal(false);

  const turn = async (v: boolean, at: string) => {
    setBusy(true);
    setNote("");
    try {
      if (v) await enablePush(); else await disablePush();
      await setReminder(v, at, lang());
      setOn(v);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setNote(m === "denied" ? t("st.reminderDenied") : m === "push-unavailable" ? t("st.reminderUnavailable") : m === "unsupported" ? t("st.reminderUnsupported") : describeError(e));
      setOn(false);
    } finally { setBusy(false); }
  };

  return (
    <>
      <GRow icon={<GIcon.bell size={18} />} title={t("st.reminder")}
        sub={on() ? t("st.reminderAt", { time: timeOfDay(time()) }) : t("st.reminderOff")}
        onClick={() => setPicking(true)}
        trailing={<Toggle on={on()} label={t("st.reminder")} disabled={busy() || !pushSupported()} onChange={v => void turn(v, time())} />} />
      <Show when={note()}><p class="pb-3 text-[12px]" style={{ color: "var(--g-amber)" }}>{note()}</p></Show>
      <GSheet open={picking()} onClose={() => setPicking(false)} label={t("st.reminderTime")}>
        <h2 class="g-serif text-[24px]">{t("st.reminderTime")}</h2>
        <TimeField value={time()} label={t("st.reminderTime")} onChange={setTime} />
        <WideHalo h={60} dark disabled={busy()} onClick={() => { setPicking(false); void turn(true, time()); }}>
          <span class="text-[15px] font-medium">{t("common.save")}</span>
        </WideHalo>
      </GSheet>
    </>
  );
}

function EditSheet(props: { open: boolean; me: Profile; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = createSignal(untrack(() => props.me.display_name));
  const [phone, setPhone] = createSignal(untrack(() => props.me.phone ?? ""));
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const save = async () => {
    const p = normalizePkMobile(phone());
    if (name().trim().length < 2) return setError(t("profile.errName"));
    if (!p) return setError(t("profile.errPhone"));
    setBusy(true);
    setError("");
    try { await saveProfile(props.me.id, name().trim(), p); props.onSaved(); }
    catch (e) { setError(describeError(e)); }
    finally { setBusy(false); }
  };
  return (
    <GSheet open={props.open} onClose={props.onClose} label={t("st.editProfile")}>
      <h2 class="g-serif text-[24px]">{t("st.editProfile")}</h2>
      <label class="block">
        <span class="mb-1.5 block text-[12px]" style={{ color: "var(--g-muted)" }}>{t("profile.name")}</span>
        <input class={gInput} style={gInputStyle} autocomplete="name" value={name()} onInput={e => setName(e.currentTarget.value)} />
      </label>
      <label class="block">
        <span class="mb-1.5 block text-[12px]" style={{ color: "var(--g-muted)" }}>{t("profile.phone")}</span>
        <input class={[gInput, "tracking-wide"]} style={gInputStyle} type="tel" inputmode="numeric" dir="ltr" value={phone()} onInput={e => setPhone(e.currentTarget.value)} />
        <span class="mt-1.5 block text-[12px]" style={{ color: "var(--g-muted)" }}>
          {normalizePkMobile(phone()) ? t("profile.savedAs", { phone: formatPkMobile(normalizePkMobile(phone())!) }) : t("profile.phoneHint")}
        </span>
      </label>
      <Show when={error()}><GNote tone="error">{error()}</GNote></Show>
      <WideHalo h={60} dark disabled={busy()} onClick={save}><span class="text-[15px] font-medium">{busy() ? t("common.saving") : t("common.save")}</span></WideHalo>
    </GSheet>
  );
}
