import { actionTitle, type Execution } from "../lib/types";
import StatusBadge from "./status-badge";

export default function ReceiptView({
  execution,
  onRetry,
  retrying,
}: {
  execution: Execution;
  onRetry?: (nodeId: string) => void;
  retrying?: string | null;
}) {
  const receipt = execution.receipt;
  if (!receipt) return null;
  const nodes = execution.executionResult?.nodeResults ?? [];
  const failedNodes = nodes.filter((n) => n.status === "failed");
  const judge = execution.mode === "judge";

  return (
    <div className="receipt">
      <header className="receipt-head">
        <p className="caption-upper">EVIDENCE RECEIPT</p>
        {judge ? (
          <p className="receipt-metric">
            읽기 전용 즉석 실행 <span className="receipt-sub">{execution.repoRef}</span>
          </p>
        ) : (
          <p className="receipt-metric">
            시동 시간 <strong>{receipt.startupSeconds != null ? `${receipt.startupSeconds}초` : "—"}</strong>
            <span className="receipt-sub">절약 {receipt.savedMinutes != null ? `${receipt.savedMinutes}분` : "—"}</span>
          </p>
        )}
      </header>

      <ul className="rule-list" aria-label="Verifier 규칙 결과">
        {receipt.ruleResults.map((rule) => (
          <li className="rule-row" key={rule.name}>
            <StatusBadge tone={rule.passed ? "success" : "error"} label={rule.passed ? "통과" : "실패"} />
            <div className="rule-body">
              <p className="rule-name">{rule.name}</p>
              <p className="rule-evidence">{rule.evidence}</p>
            </div>
          </li>
        ))}
      </ul>

      {nodes.length > 0 && (
        <div className="node-results">
          <p className="caption-upper">실행 노드</p>
          {nodes.map((node) => (
            <div className="node-row" key={node.nodeId}>
              <StatusBadge
                tone={node.status === "succeeded" ? "success" : node.status === "failed" ? "error" : "muted"}
                label={node.status === "succeeded" ? "성공" : node.status === "failed" ? "실패" : "제외"}
              />
              <div className="node-body">
                <p className="node-title">{actionTitle(execution, node.nodeId)}</p>
                {node.errorCode ? <p className="node-message">{node.errorCode}</p> : null}
                {node.resourceUrl ? (
                  <a className="btn-text" href={node.resourceUrl} target="_blank" rel="noreferrer">
                    결과 열기 <span aria-hidden>→</span>
                  </a>
                ) : null}
              </div>
              {node.status === "failed" && onRetry ? (
                <button
                  type="button"
                  className="btn-outline"
                  disabled={retrying === node.nodeId}
                  onClick={() => onRetry(node.nodeId)}
                >
                  {retrying === node.nodeId ? "재시도 중…" : "재시도"}
                </button>
              ) : null}
            </div>
          ))}
          {failedNodes.length > 0 && (
            <p className="partial-note">
              실패를 숨기지 않습니다 — 성공한 노드 결과는 유지되며 실패 노드만 재시도합니다 (FR-17).
            </p>
          )}
        </div>
      )}

      {receipt.checkedScope.length > 0 ? (
        <p className="scope-note">검사 범위: {receipt.checkedScope.join(" · ")}</p>
      ) : null}

      <footer className="receipt-foot">
        <span>{execution.id}</span>
        <a className="btn-text info" href={`#trace-${execution.traceId}`}>
          trace 보기 <span aria-hidden>→</span>
        </a>
        <span>{new Date(receipt.issuedAt).toLocaleString("ko-KR")}</span>
      </footer>
    </div>
  );
}
