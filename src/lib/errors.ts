/**
 * Turns anything thrown (Error, Supabase PostgrestError/AuthError plain objects, strings)
 * into a readable message, instead of "[object Object]".
 */
export function describeError(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; code?: unknown; hint?: unknown; details?: unknown };
    const parts = [
      typeof o.message === "string" ? o.message : undefined,
      typeof o.hint === "string" && o.hint ? `Hint: ${o.hint}` : undefined,
      typeof o.code === "string" && o.code ? `(code ${o.code})` : undefined
    ].filter(Boolean);
    if (parts.length) return parts.join(" ");
  }
  return "Unknown error";
}
