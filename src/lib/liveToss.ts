import { createSignal, onCleanup } from "solid-js";
import { supabase } from "./supabase";
import { session } from "./auth";

/**
 * A live toss over Supabase Realtime: who's watching (presence) and the organizer's
 * countdown / cancel / result (broadcast). The draw itself still happens on the server.
 */
export type LiveEvent = { type: "countdown"; round: number; ids: string[] } | { type: "cancel" } | { type: "drawn"; round: number };

export function useTossChannel(committeeId: string, onEvent: (e: LiveEvent) => void) {
  const [watching, setWatching] = createSignal(1);
  const me = session()?.user.id ?? "anon";
  let ready = false;
  const channel = supabase.channel(`toss:${committeeId}`, { config: { presence: { key: me }, broadcast: { self: false } } });
  channel
    .on("presence", { event: "sync" }, () => setWatching(Math.max(1, Object.keys(channel.presenceState()).length)))
    .on("broadcast", { event: "toss" }, ({ payload }) => onEvent(payload as LiveEvent))
    .subscribe(status => {
      if (status === "SUBSCRIBED") { ready = true; void channel.track({ at: Date.now() }); }
    });
  onCleanup(() => { void supabase.removeChannel(channel); });
  const send = (e: LiveEvent) => { if (ready) void channel.send({ type: "broadcast", event: "toss", payload: e }); };
  return { watching, send };
}
