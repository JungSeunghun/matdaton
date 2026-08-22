import { AGENT_LABELS, type AgentName } from "../lib/types";

export interface TimelineEntry {
  id: string;
  kind: "agent" | "tool" | "node" | "error";
  agent?: AgentName;
  label: string;
  detail?: string;
  failed?: boolean;
  at?: string;
}

function timeOf(iso: string | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export default function AgentTimeline({ entries, running }: { entries: TimelineEntry[]; running: boolean }) {
  if (entries.length === 0) return null;
  return (
    <ol className="timeline" aria-label="에이전트 진행 타임라인">
      {entries.map((e, i) => {
        const last = i === entries.length - 1;
        const dotClass = e.failed ? "tl-dot error" : last && running ? "tl-dot active pulse" : "tl-dot done";
        return (
          <li key={e.id} className={`tl-item tl-${e.kind}`}>
            <span className={dotClass} aria-hidden />
            <div className="tl-body">
              <p className="tl-label">
                {e.agent ? <strong>{AGENT_LABELS[e.agent]}</strong> : null} {e.label}
              </p>
              {e.detail ? <p className="tl-detail">{e.detail}</p> : null}
            </div>
            <span className="tl-time">{timeOf(e.at)}</span>
          </li>
        );
      })}
    </ol>
  );
}
