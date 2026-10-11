import { lang, setLang } from "../i18n";
import { tick } from "./kit";
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
