/** The Bari mark: five members on a ring; gold = whose turn it is. Follows the theme. */
export function Mark(props: { size?: number }) {
  return (
    <svg width={props.size ?? 64} height={props.size ?? 64} viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="40" fill="none" stroke="var(--ink)" stroke-opacity="0.18" stroke-width="7" />
      <path d="M 21.96 47.64 A 40 40 0 0 1 60 20" fill="none" stroke="var(--turn)" stroke-width="7" stroke-linecap="round" />
      <circle cx="98.04" cy="47.64" r="8" fill="var(--brand)" stroke="var(--surface)" stroke-width="3" />
      <circle cx="83.51" cy="92.36" r="8" fill="var(--brand)" stroke="var(--surface)" stroke-width="3" />
      <circle cx="36.49" cy="92.36" r="8" fill="var(--brand)" stroke="var(--surface)" stroke-width="3" />
      <circle cx="21.96" cy="47.64" r="8" fill="var(--brand)" stroke="var(--surface)" stroke-width="3" />
      <circle cx="60" cy="20" r="12" fill="var(--turn)" stroke="var(--surface)" stroke-width="3" />
    </svg>
  );
}
