/** The Bari mark: five members on a ring; gold = whose turn it is. */
export function Mark(props: { size?: number; onDark?: boolean }) {
  const node = () => (props.onDark ? "#FFFFFF" : "#0F5F4F");
  const gap = () => (props.onDark ? "#0F5F4F" : "#F4F7F5");
  return (
    <svg width={props.size ?? 64} height={props.size ?? 64} viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="40" fill="none" stroke={props.onDark ? "#FFFFFF" : "#0E2A23"} stroke-opacity="0.22" stroke-width="7" />
      <path d="M 21.96 47.64 A 40 40 0 0 1 60 20" fill="none" stroke="#E0A526" stroke-width="7" stroke-linecap="round" />
      <circle cx="98.04" cy="47.64" r="8" fill={node()} stroke={gap()} stroke-width="3" />
      <circle cx="83.51" cy="92.36" r="8" fill={node()} stroke={gap()} stroke-width="3" />
      <circle cx="36.49" cy="92.36" r="8" fill={node()} stroke={gap()} stroke-width="3" />
      <circle cx="21.96" cy="47.64" r="8" fill={node()} stroke={gap()} stroke-width="3" />
      <circle cx="60" cy="20" r="12" fill="#E0A526" stroke={gap()} stroke-width="3" />
    </svg>
  );
}
