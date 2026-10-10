import { createSignal } from "solid-js";

/** Bumped after notifications are marked read, so the bell badge refetches. */
const [unreadStamp, setUnreadStamp] = createSignal(0);
export { unreadStamp };
export const bumpUnread = () => setUnreadStamp(s => s + 1);
