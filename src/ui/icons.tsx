/** Stroke icons, 24×24, currentColor. Decorative unless given a label by the caller. */
const base = (d: string, size = 22, w = 2) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={w} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export const IconBack = () => base("M15 18l-6-6 6-6", 22, 2.2);
export const IconPlus = (p: { size?: number }) => base("M12 5v14M5 12h14", p.size ?? 22, 2.4);
export const IconHome = () => base("M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z");
export const IconUser = () => base("M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4.5 20.5c.8-3.7 3.9-6 7.5-6s6.7 2.3 7.5 6");
export const IconCopy = () => base("M9 9h10v11H9z M5 15V4h10", 18);
export const IconShare = () => base("M12 15V3 M7.5 7.5L12 3l4.5 4.5 M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7", 20);
export const IconChat = () => base("M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12z", 20);
export const IconCheck = (p: { size?: number }) => base("M5 12.5l4.2 4.2L19 7", p.size ?? 14, 2.6);
export const IconClock = (p: { size?: number }) => base("M12 7v5l3 2 M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z", p.size ?? 14, 2.4);
export const IconHourglass = (p: { size?: number }) => base("M7 3h10 M7 21h10 M8 3c0 5 8 5 8 9s-8 4-8 9 M16 3c0 5-8 5-8 9", p.size ?? 14, 2.2);
export const IconChevron = () => base("M9 6l6 6-6 6", 18, 2.2);
export const IconKey = () => base("M14.5 9.5a4.5 4.5 0 1 1-9 0a4.5 4.5 0 0 1 9 0z M13.2 12.7L20 19.5 M17 16.5l2-2", 22);
export const IconCircle = () => base("M12 20a8 8 0 1 0 0-16a8 8 0 0 0 0 16z M12 4v3", 22);
export const IconGear = () => base("M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z", 21);
export const IconBell = () => base("M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.9 1.9 0 0 0 3.4 0", 21);
export const IconWallet = () => base("M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3 M3 7.5V18a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3 M3 7.5A2.5 2.5 0 0 0 5.5 10H20v6h-4a2 2 0 0 1 0-4h4", 20);
