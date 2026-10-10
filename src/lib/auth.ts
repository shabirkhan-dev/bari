import { createSignal } from "solid-js";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { describeError } from "./errors";

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
  if (error) throw new Error(describeError(error));
}

export async function signOut() {
  await supabase.auth.signOut();
}

export interface Profile {
  id: string;
  display_name: string;
  phone: string | null;
}

async function readProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, phone")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(describeError(error));
  return data;
}

/** Loads the signed-in user's profile, creating it if the account somehow has none. */
export async function fetchProfile(userId: string): Promise<Profile> {
  const existing = await readProfile(userId);
  if (existing) return existing;
  const { error } = await supabase.rpc("ensure_my_profile");
  if (error) throw new Error(describeError(error));
  const created = await readProfile(userId);
  if (!created) throw new Error("Your profile could not be created. Please try again.");
  return created;
}

export async function saveProfile(userId: string, displayName: string, phone: string) {
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName, phone })
    .eq("id", userId);
  if (error) throw new Error(describeError(error));
}
