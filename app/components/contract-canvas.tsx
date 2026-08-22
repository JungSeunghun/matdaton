import { blockedNodeIds, type ExecutionContract, type PolicyReport } from "../lib/types";

export default function ContractCanvas({
  contract,
  contractHash,
  policyReport,
  excluded,
  onToggle,
  readOnly = false,
}: {
  contract: ExecutionContract;
  contractHash?: string;
  policyReport?: PolicyReport;
  excluded: ReadonlySet<string>;
  onToggle?: (nodeId: string) => void;
  readOnly?: boolean;
}) {
  const blocked = new Set(blockedNodeIds(policyReport));
  const prepByNode = new Map(contract.prepNodes.map((p) => [p.nodeId, p]));
  return (
    <div className="contract-canvas">
      <div className="contract-grid">
        {contract.actions.map((action, i) => {
          const isBlocked = blocked.has(action.nodeId);
          const isOff = excluded.has(action.nodeId) || isBlocked;
          const prep = prepByNode.get(action.nodeId);
          return (
            <article className={`action-card${isOff ? " off" : ""}`} key={action.nodeId}>
              <header className="action-head">
                <span className="action-index">{String(i + 1).padStart(2, "0")}</span>
                {readOnly ? (
                  <span className="badge badge-muted">드라이런</span>
                ) : isBlocked ? (
                  <span className="badge badge-error">Policy 차단</span>
                ) : (
                  <button
                    type="button"
                    className={`toggle${isOff ? "" : " on"}`}
                    role="switch"
                    aria-checked={!isOff}
                    aria-label={`${action.title} ${isOff ? "제외됨" : "실행 예정"}`}
                    onClick={() => onToggle?.(action.nodeId)}
                  >
                    <span className="toggle-knob" aria-hidden />
                  </button>
                )}
              </header>
              <h3 className="action-title">{action.title}</h3>
              {prep ? <p className="action-desc">{prep.preview}</p> : null}
              <ul className="criteria">
                <li>{action.successCriteria}</li>
                <li>예상 소요 {action.estimatedMinutes}분</li>
              </ul>
              {prep ? (
                <p className="action-tools">
                  <code>{prep.tool}</code>
                </p>
              ) : null}
              <p className="action-evidence">
                {action.evidenceUrls.map((u) => (
                  <a className="btn-text" key={u} href={u} target="_blank" rel="noreferrer">
                    근거 열기 <span aria-hidden>→</span>
                  </a>
                ))}
              </p>
              {!readOnly && !isBlocked && (
                <button type="button" className="btn-danger-outline" onClick={() => onToggle?.(action.nodeId)}>
                  {isOff ? "다시 포함" : "이 노드 제외"}
                </button>
              )}
            </article>
          );
        })}
      </div>
      <footer className="forbidden">
        <span className="forbidden-icon" aria-hidden>⛔</span>
        <span>
          금지 범위: {contract.forbiddenScope.join(" · ")}
          {contractHash ? (
            <>
              {" "}— 계약 해시 <code>{contractHash}</code>
            </>
          ) : null}
        </span>
      </footer>
    </div>
  );
}
