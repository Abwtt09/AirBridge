export function ReceiverMark({ small = false }: { small?: boolean }) {
  return (
    <div className={`receiver-mark ${small ? "small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 100 100" fill="none">
        <path
          d="M22 47a31 31 0 0 1 56 0M32 53a20 20 0 0 1 36 0"
          stroke="currentColor"
          strokeWidth="4.7"
          strokeLinecap="round"
        />
        <circle cx="50" cy="58" r="4.6" fill="currentColor" />
        <path
          d="m50 69 14 16H36L50 69Z"
          fill="currentColor"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="3"
        />
      </svg>
    </div>
  );
}
