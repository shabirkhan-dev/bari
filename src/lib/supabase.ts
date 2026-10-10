import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const Env = z.object({
  VITE_SUPABASE_URL: z.url().refine(u => u.startsWith("https://"), "Must be https"),
  // Publishable key only (safe in the browser; RLS protects data). Secret keys must never reach the app.
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().startsWith("sb_publishable_", "Use the publishable key, never a secret key")
});

const parsed = Env.safeParse(import.meta.env);
if (!parsed.success) {
  throw new Error(
    `Supabase is not configured. Copy .env.example to .env and fill it in.\n${z.prettifyError(parsed.error)}`
  );
}

export const supabase = createClient(parsed.data.VITE_SUPABASE_URL, parsed.data.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
