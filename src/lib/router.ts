import { createSignal, flush } from "solid-js";

/**
 * A deliberately tiny router: path in a signal, History API, and native-style
 * slide transitions via the View Transitions API (Chrome on Android supports it;
 * elsewhere navigation is instant). Kept in-house instead of a router package
 * because the Solid 2 router is still pre-release.
 */
const [path, setPath] = createSignal(location.pathname);
export { path };

type Direction = "forward" | "back" | "none";

function go(to: string, replace: boolean, direction: Direction) {
  if (to === location.pathname) return;
  const apply = () => {
    if (replace) history.replaceState({ depth: depth() }, "", to);
    else history.pushState({ depth: depth() + 1 }, "", to);
    lastDepth = depth();
    setPath(to);
  };
  transition(apply, direction);
}

function depth(): number {
  return (history.state?.depth as number | undefined) ?? 0;
}

function transition(apply: () => void, direction: Direction) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduce || direction === "none") return apply();
  document.documentElement.dataset.nav = direction;
  doc.startViewTransition(() => {
    apply();
    flush(); // render the new screen synchronously so the transition captures it
  });
}

export const navigate = (to: string, opts: { replace?: boolean; direction?: Direction } = {}) =>
  go(to, opts.replace ?? false, opts.direction ?? "forward");

/** Back within the app if there is history, else to a fallback screen. */
export function back(fallback = "/") {
  if (depth() > 0) history.back();
  else go(fallback, true, "back");
}

let lastDepth = depth();
addEventListener("popstate", () => {
  const d = depth();
  const dir: Direction = d < lastDepth ? "back" : "forward";
  lastDepth = d;
  transition(() => setPath(location.pathname), dir);
});

/** Match "/c/:id" style patterns. Returns params or null. */
export function match(pattern: string, p: string): Record<string, string> | null {
  const keys: string[] = [];
  const re = new RegExp(
    "^" + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "/?$"
  );
  const m = re.exec(p);
  if (!m) return null;
  return Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
}

/** Remember where to go after sign-in (e.g. an invite link opened while signed out). */
const AFTER_LOGIN = "bari.afterLogin";
export function rememberPath(p: string) {
  try { localStorage.setItem(AFTER_LOGIN, p); } catch { /* storage unavailable: fine */ }
}
export function takeRememberedPath(): string | null {
  try {
    const p = localStorage.getItem(AFTER_LOGIN);
    localStorage.removeItem(AFTER_LOGIN);
    return p;
  } catch {
    return null;
  }
}
