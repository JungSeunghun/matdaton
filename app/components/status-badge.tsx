type Tone = "info" | "warning" | "success" | "error" | "muted";

const ICONS: Record<Tone, string> = {
  info: "●",
  warning: "◆",
  success: "✓",
  error: "✕",
  muted: "○",
};

export default function StatusBadge({
  tone,
  label,
  pulse = false,
}: {
  tone: Tone;
  label: string;
  pulse?: boolean;
}) {
  return (
    <span className={`badge badge-${tone}`} role="status">
      <span className={`badge-icon${pulse ? " pulse" : ""}`} aria-hidden>
        {ICONS[tone]}
      </span>
      {label}
    </span>
  );
}
