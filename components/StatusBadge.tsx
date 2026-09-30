const STYLES = {
  pending: "bg-elevated text-ink-2 border border-line-strong",
  paid: "bg-accent/15 text-accent border border-accent/40",
  expired: "bg-danger/10 text-danger border border-danger/30",
} as const;

export function StatusBadge({ status }: { status: keyof typeof STYLES }) {
  return <span className={`mono inline-flex items-center rounded-full px-3 py-0.5 text-[12px] uppercase tracking-wide ${STYLES[status]}`}>{status}</span>;
}
