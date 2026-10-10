import { For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { initials } from "./kit";

export type SeatStatus = "paid" | "checking" | "due" | "late" | "none";
export interface Seat {
  name: string;
  status: SeatStatus;
  /** Has received a payout (gold). */
  gold?: boolean;
  self?: boolean;
}

const STROKE: Record<SeatStatus, string> = {
  paid: "var(--ok)",
  checking: "var(--warn)",
  due: "var(--line)",
  late: "var(--late)",
  none: "var(--line)"
};

/**
 * Bari's signature: the committee as a ring of seats, straight from the logo.
 * Empty seats are dashed while members join; the gold arc is the round's progress.
 */
export function MemberRing(props: {
  total: number;
  seats: Seat[];
  /** 0..1 — how much of the current pot is confirmed. */
  progress?: number;
  size?: number;
  label: string;
  children?: JSX.Element;
}) {
  const S = () => props.size ?? 300;
  const C = () => S() / 2;
  const seatR = () => Math.min(26, (Math.PI * (S() / 2 - 30)) / props.total * 0.62);
  const R = () => S() / 2 - seatR() - 6;
  const pos = (i: number) => {
    const a = (-90 + (360 / props.total) * i) * (Math.PI / 180);
    return { x: C() + R() * Math.cos(a), y: C() + R() * Math.sin(a) };
  };
  const arc = () => {
    const p = Math.max(0, Math.min(1, props.progress ?? 0));
    if (p <= 0) return "";
    if (p >= 1) return `M ${C()} ${C() - R()} A ${R()} ${R()} 0 1 1 ${C() - 0.01} ${C() - R()}`;
    const a = (-90 + 360 * p) * (Math.PI / 180);
    const x = C() + R() * Math.cos(a), y = C() + R() * Math.sin(a);
    return `M ${C()} ${C() - R()} A ${R()} ${R()} 0 ${p > 0.5 ? 1 : 0} 1 ${x} ${y}`;
  };
  const slots = () => Array.from({ length: props.total }, (_, i) => props.seats[i] ?? null);

  return (
    <div class="relative mx-auto" style={{ width: `${S()}px`, height: `${S()}px` }}>
      <svg width={S()} height={S()} viewBox={`0 0 ${S()} ${S()}`} role="img" aria-label={props.label}>
        <circle cx={C()} cy={C()} r={R()} fill="none" stroke="var(--line)" stroke-width="3" />
        <Show when={arc()}>
          <path d={arc()} fill="none" stroke="var(--turn)" stroke-width="5" stroke-linecap="round" />
        </Show>
        <For each={slots()}>{(seat, i) => (
          <Show when={seat} fallback={
            <circle cx={pos(i()).x} cy={pos(i()).y} r={seatR() - 2} fill="var(--bg)" stroke="var(--ink-3)" stroke-width="1.8" stroke-dasharray="4 4" />
          }>
            {s => (
              <g class="seat" style={{ "animation-delay": `${i() * 45}ms` }}>
                <circle cx={pos(i()).x} cy={pos(i()).y} r={seatR()} fill="var(--surface)"
                  stroke={s().gold ? "var(--turn)" : STROKE[s().status]} stroke-width={s().self ? 4 : 3} />
                <text x={pos(i()).x} y={pos(i()).y} text-anchor="middle" dominant-baseline="central"
                  fill="var(--ink)" font-family="Outfit, sans-serif" font-weight="700" font-size={String(Math.max(10, seatR() * 0.62))}>
                  {initials(s().name)}
                </text>
                <Show when={s().status === "late" || s().status === "checking"}>
                  <circle cx={pos(i()).x + seatR() * 0.72} cy={pos(i()).y - seatR() * 0.72} r={Math.max(4, seatR() * 0.24)}
                    fill={STROKE[s().status]} stroke="var(--bg)" stroke-width="2" />
                </Show>
              </g>
            )}
          </Show>
        )}</For>
      </svg>
      <Show when={props.children}>
        <div class="absolute inset-0 flex flex-col items-center justify-center text-center" style={{ padding: `${seatR() * 2 + 18}px` }}>
          {props.children}
        </div>
      </Show>
    </div>
  );
}
