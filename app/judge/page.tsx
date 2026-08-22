"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AgentTimeline, { type TimelineEntry } from "../components/agent-timeline";
import ContractCanvas from "../components/contract-canvas";
import DiffCard from "../components/diff-card";
import ReceiptView from "../components/receipt-view";
import StatusBadge from "../components/status-badge";
import { startJudge, subscribeStream } from "../lib/api";
import type { Execution, ExecutionStatus, StreamEvent } from "../lib/types";

const EMPTY_SET: ReadonlySet<string> = new Set();
const URL_PATTERN = /^(https?:\/\/github\.com\/)?[\w.-]+\/[\w.-]+\/?$/;

export default function JudgePage() {
  const [repoUrl, setRepoUrl] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [execution, setExecution] = useState<Execution | null>(null);
  const [status, setStatus] = useState<ExecutionStatus | null>(null);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);

  const unsubscribeRef = useRef<() => void>(() => {});
  const seq = useRef(0);
  const statusRef = useRef<ExecutionStatus | null>(null);
  statusRef.current = status;

  useEffect(() => () => unsubscribeRef.current(), []);

  const onEvent = useCallback((e: StreamEvent) => {
    const push = (entry: Omit<TimelineEntry, "id">) =>
      setEntries((prev) => [...prev, { ...entry, id: `j${seq.current++}` }]);
    switch (e.type) {
      case "stage_changed":
        setStatus(e.stage);
        break;
      case "agent_started":
        push({
          kind: "agent",
          agent: e.agent,
          label: e.step != null && e.total != null ? `단계 시작 · ${e.step}/${e.total}` : "단계 시작",
          at: e.at,
        });
        break;
      case "tool_called":
        push({ kind: "tool", agent: e.agent, label: e.tool, detail: e.summary, at: e.at });
        break;
      case "agent_completed":
        push({ kind: "agent", agent: e.agent, label: "완료", detail: e.summary, at: e.at });
        break;
      case "execution_updated":
        setExecution(e.execution);
        setStatus(e.execution.status);
        break;
      case "stream_error": {
        const st = statusRef.current;
        if (st === "completed" || st === "failed") break;
        setStreamError(e.message);
        push({ kind: "error", label: "오류", detail: e.message, failed: true, at: e.at });
        break;
      }
      default:
        break;
    }
  }, []);

  const handleRun = useCallback(async () => {
    const trimmed = repoUrl.trim();
    if (!URL_PATTERN.test(trimmed)) {
      setInputError("owner/repo 또는 https://github.com/owner/repo 형식으로 입력해 주세요.");
      return;
    }
    setInputError(null);
    setStreamError(null);
    setEntries([]);
    setExecution(null);
    setStatus("created");
    try {
      const id = await startJudge(trimmed);
      unsubscribeRef.current();
      unsubscribeRef.current = subscribeStream(id, onEvent);
    } catch {
      setStreamError("즉석 실행을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setStatus(null);
    }
  }, [repoUrl, onEvent]);

  const running = status != null && !["completed", "failed"].includes(status);
  const done = status === "completed" || status === "failed";

  return (
    <main className="page">
      <section className="hero hero-compact" aria-labelledby="judge-title">
        <span className="orb orb-peach" aria-hidden />
        <p className="caption-upper">JUDGE MODE</p>
        <h1 id="judge-title" className="page-title">
          임의의 공개 저장소로
          <br />
          즉석 검증.
        </h1>
        <p className="page-lead">
          로그인 없이 최근 24시간 변경을 수집→계획→검사합니다. 읽기 전용이며 쓰기 노드는 드라이런 미리보기까지만
          진행합니다.
        </p>

        <div className="judge-form">
          <div className="field-wrap">
            <input
              className={`field${inputError ? " field-error" : ""}`}
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !running) void handleRun();
              }}
              placeholder="https://github.com/owner/repo"
              aria-label="공개 GitHub 저장소 URL"
              aria-invalid={inputError != null}
              disabled={running}
            />
            {inputError ? (
              <p className="field-message" role="alert">
                {inputError}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn-outline" onClick={handleRun} disabled={running || repoUrl.trim() === ""}>
            {running ? "실행 중…" : "즉석 실행"}
          </button>
        </div>

        {streamError ? (
          <div className="error-banner" role="alert">
            <StatusBadge tone="error" label="실패" /> {streamError} — 부분 결과는 아래에 유지됩니다.
          </div>
        ) : null}
      </section>

      {entries.length > 0 && (
        <section className="section" aria-labelledby="judge-progress">
          <div className="section-head">
            <p className="caption-upper" id="judge-progress">
              PIPELINE
            </p>
            {running ? <StatusBadge tone="info" label="실행 중" pulse /> : done ? <StatusBadge tone="success" label="완료" /> : null}
          </div>
          <AgentTimeline entries={entries} running={running} />
        </section>
      )}

      {execution?.overnightDiff && (
        <section className="section" aria-labelledby="judge-diff">
          <p className="caption-upper" id="judge-diff">
            OVERNIGHT DIFF
          </p>
          <DiffCard diff={execution.overnightDiff} />
        </section>
      )}

      {execution?.contract && (
        <section className="section" aria-labelledby="judge-contract">
          <div className="section-head">
            <p className="caption-upper" id="judge-contract">
              DRY-RUN PREVIEW
            </p>
            <StatusBadge tone="muted" label="읽기 전용 — 실행되지 않음" />
          </div>
          <ContractCanvas contract={execution.contract} policyReport={execution.policyReport} excluded={EMPTY_SET} readOnly />
        </section>
      )}

      {execution?.receipt && done && (
        <section className="section" aria-labelledby="judge-receipt">
          <p className="caption-upper" id="judge-receipt">
            RECEIPT
          </p>
          <ReceiptView execution={execution} />
        </section>
      )}
    </main>
  );
}
