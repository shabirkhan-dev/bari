import { createSignal } from "solid-js";

export type ThemeChoice = "auto" | "light" | "dark";
const KEY = "bari.theme";
const media = matchMedia("(prefers-color-scheme: dark)");

function initial(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch { /* storage blocked */ }
  return "auto";
}

const [theme, setThemeSignal] = createSignal<ThemeChoice>(initial());
export { theme };

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "auto" && media.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#090e0c" : "#eef1ef");
}
apply(theme());
media.addEventListener("change", () => apply(theme()));

export function setTheme(choice: ThemeChoice) {
  try { localStorage.setItem(KEY, choice); } catch { /* storage blocked */ }
  apply(choice);
  setThemeSignal(choice);
}
