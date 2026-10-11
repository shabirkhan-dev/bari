/**
 * Open bottom sheets get a history entry, so the phone's Back button (or back gesture)
 * closes the sheet instead of leaving the screen.
 */
let seq = 0;
let skipPop = 0;
const stack: { token: number; close: () => void }[] = [];

addEventListener("popstate", () => {
  if (skipPop > 0) { skipPop--; return; }
  const top = stack.pop();
  top?.close();
});

/** Call when a sheet opens; returns the function to call when it closes by any other means. */
export function openSheet(close: () => void): () => void {
  const token = ++seq;
  history.pushState({ ...(history.state ?? {}), sheet: token }, "");
  stack.push({ token, close });
  return () => {
    const i = stack.findIndex(s => s.token === token);
    if (i < 0) return; // already closed by Back
    stack.splice(i, 1);
    // Still on the sheet's own entry (no navigation happened meanwhile): remove it.
    if ((history.state as { sheet?: number } | null)?.sheet === token) { skipPop++; history.back(); }
  };
}
