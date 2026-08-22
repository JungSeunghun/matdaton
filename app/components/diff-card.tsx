import type { OvernightDiff } from "../lib/types";

function hhmm(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

interface Row {
  id: string;
  icon: string;
  title: string;
  detail: string;
  evidenceUrl?: string;
  at: string;
}

function toRows(diff: OvernightDiff): Row[] {
  const rows: Row[] = [];
  if (diff.commits.length > 0) {
    const [first, ...rest] = diff.commits;
    rows.push({
      id: "commits",
      icon: "⌥",
      title: `커밋 ${diff.commits.length}건`,
      detail: rest.length > 0 ? `${first.message} 외 ${rest.length}` : first.message,
      evidenceUrl: first.url,
      at: hhmm(first.committedAt),
    });
  }
  if (diff.issueEvents.length > 0) {
    const [first] = diff.issueEvents;
    rows.push({
      id: "issues",
      icon: "✎",
      title: `이슈 댓글 ${diff.issueEvents.length}건`,
      detail: `#${first.issueNumber} ${first.issueTitle} — ${first.commentSummary}`,
      evidenceUrl: first.url,
      at: hhmm(first.createdAt),
    });
  }
  if (diff.reviewRequests.length > 0) {
    const [first] = diff.reviewRequests;
    rows.push({
      id: "reviews",
      icon: "⇄",
      title: `리뷰 요청 ${diff.reviewRequests.length}건`,
      detail: `#${first.prNumber} ${first.prTitle}`,
      evidenceUrl: first.url,
      at: hhmm(first.requestedAt),
    });
  }
  if (diff.meetings.length > 0) {
    const hours = Math.floor(diff.availableMinutes / 60);
    const mins = diff.availableMinutes % 60;
    rows.push({
      id: "meetings",
      icon: "▦",
      title: `오늘 회의 ${diff.meetings.length}건`,
      detail: `${diff.meetings.map((m) => `${m.title} ${hhmm(m.startsAt)}`).join(" · ")} — 가용 ${hours}시간 ${mins}분`,
      at: "오늘",
    });
  }
  return rows;
}

export default function DiffCard({ diff }: { diff: OvernightDiff }) {
  const noChanges = diff.commits.length === 0 && diff.issueEvents.length === 0 && diff.reviewRequests.length === 0;
  const rows = toRows(diff);
  return (
    <div className="diff-card">
      {noChanges ? (
        <div className="diff-row">
          <span className="icon-plate" aria-hidden>✓</span>
          <div className="diff-main">
            <p className="diff-title">변경 없음</p>
            <p className="diff-detail">밤사이 변경이 없어 오늘의 계획만 컴파일합니다 (성공 조건).</p>
          </div>
        </div>
      ) : (
        rows.map((row) => (
          <div className="diff-row" key={row.id}>
            <span className="icon-plate" aria-hidden>{row.icon}</span>
            <div className="diff-main">
              <p className="diff-title">
                {row.title} <span className="diff-sep">·</span> {row.detail}
              </p>
              {row.evidenceUrl ? (
                <a className="btn-text" href={row.evidenceUrl} target="_blank" rel="noreferrer">
                  근거 열기 <span aria-hidden>→</span>
                </a>
              ) : null}
            </div>
            <span className="diff-time">{row.at}</span>
          </div>
        ))
      )}
      {diff.missingSources.length > 0 ? (
        <p className="diff-detail">일부 소스 수집 실패: {diff.missingSources.join(", ")} — 수집된 범위로만 컴파일합니다.</p>
      ) : null}
    </div>
  );
}
