import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const Env = z.object({
  VITE_SUPABASE_URL: z.url().refine(u => u.startsWith("https://"), "Must be https"),
  // The public anon key only. The service-role key must never reach the browser.
  VITE_SUPABASE_ANON_KEY: z.string().min(20)
});

const parsed = Env.safeParse(import.meta.env);
if (!parsed.success) {
  throw new Error(
    `Supabase is not configured. Copy .env.example to .env and fill it in.\n${z.prettifyError(parsed.error)}`
  );
}

export const supabase = createClient(parsed.data.VITE_SUPABASE_URL, parsed.data.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
