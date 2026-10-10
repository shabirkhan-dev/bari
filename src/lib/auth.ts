import { createSignal } from "solid-js";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/** undefined = still checking, null = signed out. App-wide, so a module-scope signal. */
const [session, setSession] = createSignal<Session | null | undefined>(undefined);
export { session };

supabase.auth.getSession().then(({ data }) => setSession(data.session));
supabase.auth.onAuthStateChange((_event, s) => setSession(s));

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    // Always show the account picker: family phones often have more than one Google account.
    options: { redirectTo: window.location.origin, queryParams: { prompt: "select_account" } }
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export interface Profile {
  id: string;
  display_name: string;
  phone: string | null;
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, phone")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function saveProfile(userId: string, displayName: string, phone: string) {
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName, phone })
    .eq("id", userId);
  if (error) throw error;
}
