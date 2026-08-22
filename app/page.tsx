"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AgentTimeline, { type TimelineEntry } from "./components/agent-timeline";
import ContractCanvas from "./components/contract-canvas";
import DiffCard from "./components/diff-card";
import ReceiptView from "./components/receipt-view";
import StatusBadge from "./components/status-badge";
import { approve, isMockMode, retryNode, startDaily, subscribeStream } from "./lib/api";
import { blockedNodeIds, STATUS_STEPS, type Execution, type ExecutionStatus, type StreamEvent } from "./lib/types";

const DEFAULT_REPO = "acme/first-move";
const TOTAL_STEPS = 6;

export default function Home() {
  const [execution, setExecution] = useState<Execution | null>(null);
  const [status, setStatus] = useState<ExecutionStatus | null>(null);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [mock, setMock] = useState(false);

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [approvedAt, setApprovedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const unsubscribeRef = useRef<() => void>(() => {});
  const seq = useRef(0);
  const statusRef = useRef<ExecutionStatus | null>(null);
  statusRef.current = status;

  useEffect(() => {
    void isMockMode().then(setMock);
    return () => unsubscribeRef.current();
  }, []);

  // 준비 시간 타이머 — button_clicked → approval_completed (PRD 목표 측정)
  useEffect(() => {
    if (startedAt == null || approvedAt != null) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(t);
  }, [startedAt, approvedAt]);

  const push = useCallback((entry: Omit<TimelineEntry, "id">) => {
    setEntries((prev) => [...prev, { ...entry, id: `e${seq.current++}` }]);
  }, []);

  const onEvent = useCallback(
    (e: StreamEvent) => {
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
        case "node_completed":
          push({ kind: "node", label: "노드 성공", at: e.at });
          setRetrying(null);
          break;
        case "node_failed":
          push({ kind: "node", label: "노드 실패", detail: e.reason, failed: true, at: e.at });
          setRetrying(null);
          break;
        case "execution_updated":
          setExecution(e.execution);
          setStatus(e.execution.status);
          break;
        case "stream_error": {
          // 승인 대기·종료 상태에서의 스트림 종료는 정상 흐름이다
          const st = statusRef.current;
          if (st == null || ["waiting_approval", "completed", "failed", "rejected", "expired"].includes(st)) break;
          setError(e.message);
          push({ kind: "error", label: "오류", detail: e.message, failed: true, at: e.at });
          break;
        }
      }
    },
    [push],
  );

  const handleStart = useCallback(async () => {
    setError(null);
    setEntries([]);
    setExecution(null);
    setExcluded(new Set());
    setApprovedAt(null);
    setElapsed(0);
    setStartedAt(Date.now());
    setStatus("created");
    try {
      const id = await startDaily({ repoRef: DEFAULT_REPO });
      unsubscribeRef.current();
      unsubscribeRef.current = subscribeStream(id, onEvent);
    } catch {
      setError("실행을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setStatus(null);
      setStartedAt(null);
    }
  }, [onEvent]);

  const approvedNodeIds = useMemo(() => {
    if (!execution?.contract) return [];
    const blocked = new Set(blockedNodeIds(execution.policyReport));
    return execution.contract.actions
      .filter((a) => !excluded.has(a.nodeId) && !blocked.has(a.nodeId))
      .map((a) => a.nodeId);
  }, [execution, excluded]);

  const handleApprove = useCallback(async () => {
    if (!execution || startedAt == null) return;
    const startupSeconds = Math.floor((Date.now() - startedAt) / 1000);
    setApprovedAt(Date.now());
    setElapsed(startupSeconds);
    try {
      const updated = await approve(execution.id, approvedNodeIds, startupSeconds);
      if (updated) {
        setExecution(updated);
        setStatus(updated.status);
      }
    } catch (err) {
      setApprovedAt(null);
      setError(err instanceof Error ? err.message : "승인 요청에 실패했습니다.");
    }
  }, [execution, startedAt, approvedNodeIds]);

  const handleRetry = useCallback(
    async (nodeId: string) => {
      if (!execution) return;
      setRetrying(nodeId);
      try {
        const updated = await retryNode(execution.id, nodeId);
        if (updated) {
          setExecution(updated);
          setStatus(updated.status);
          setRetrying(null);
        }
      } catch (err) {
        setRetrying(null);
        setError(err instanceof Error ? err.message : "재시도에 실패했습니다.");
      }
    },
    [execution],
  );

  const handleToggle = useCallback((nodeId: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const running =
    status != null && !["completed", "failed", "waiting_approval", "rejected", "expired"].includes(status);
  const stepInfo = status ? STATUS_STEPS[status] : undefined;
  const waitingApproval = status === "waiting_approval";
  const showReceipt = execution?.receipt != null && (status === "completed" || status === "failed");
  const idle = status == null;

  return (
    <main className="page">
      {/* ── 히어로: 하루 시작 ── */}
      <section className="hero" aria-labelledby="hero-title">
        <span className="orb orb-lavender" aria-hidden />
        <span className="orb orb-sky" aria-hidden />
        <p className="caption-upper">FIRST MOVE</p>
        <h1 id="hero-title">
          오늘의 첫 수를
          <br />
          두세요.
        </h1>
        <p className="hero-caption">
          밤사이 변경과 오늘의 제약을 90초 안에 컴파일합니다.
          {mock ? " · mock 모드 (API 연결 전)" : ""}
        </p>

        {idle ? (
          <button type="button" className="btn-primary hero-cta" onClick={handleStart}>
            하루 시작
          </button>
        ) : (
          <div className="timer-pill" role="status">
            <span className={`badge-icon${running || waitingApproval ? " pulse" : ""}`} aria-hidden>
              ●
            </span>
            {approvedAt == null ? `${elapsed}초 경과` : `준비 시간 ${elapsed}초`}
            {stepInfo ? ` · ${stepInfo.label} · ${stepInfo.step}/${TOTAL_STEPS}` : status === "completed" ? " · 완료" : ""}
          </div>
        )}

        {error ? (
          <div className="error-banner" role="alert">
            <StatusBadge tone="error" label="실패" /> {error}
          </div>
        ) : null}
      </section>

      {/* ── 진행 스트리밍 ── */}
      {entries.length > 0 && (
        <section className="section" aria-labelledby="progress-title">
          <p className="caption-upper" id="progress-title">
            LIVE PROGRESS
          </p>
          <AgentTimeline entries={entries} running={running} />
        </section>
      )}

      {/* ── Overnight Diff ── */}
      {execution?.overnightDiff && (
        <section className="section" aria-labelledby="diff-title">
          <p className="caption-upper" id="diff-title">
            OVERNIGHT DIFF
          </p>
          <DiffCard diff={execution.overnightDiff} />
        </section>
      )}

      {/* ── 드라이런 미리보기 + 승인 ── */}
      {execution?.contract && (waitingApproval || showReceipt || status === "executing" || status === "verifying") && (
        <section className="section" aria-labelledby="contract-title">
          <div className="section-head">
            <p className="caption-upper" id="contract-title">
              EXECUTION CONTRACT
            </p>
            {waitingApproval ? <StatusBadge tone="warning" label="승인 대기" /> : null}
          </div>
          <ContractCanvas
            contract={execution.contract}
            contractHash={execution.contractHash}
            policyReport={execution.policyReport}
            excluded={excluded}
            onToggle={waitingApproval ? handleToggle : undefined}
            readOnly={!waitingApproval}
          />
        </section>
      )}

      {/* ── 영수증 ── */}
      {showReceipt && execution && (
        <section className="section" aria-labelledby="receipt-title">
          <p className="caption-upper" id="receipt-title">
            RECEIPT
          </p>
          <ReceiptView execution={execution} onRetry={handleRetry} retrying={retrying} />
          <button type="button" className="btn-outline restart" onClick={handleStart}>
            새 실행 시작
          </button>
        </section>
      )}

      {/* ── 하단 고정 승인 바 ── */}
      {waitingApproval && (
        <div className="approve-bar">
          <span className="approve-summary">
            {approvedNodeIds.length}개 노드 실행 예정
            {excluded.size > 0 ? ` · ${excluded.size}개 제외` : ""}
          </span>
          <button
            type="button"
            className="btn-primary"
            onClick={handleApprove}
            disabled={approvedNodeIds.length === 0}
          >
            승인하고 실행
          </button>
        </div>
      )}
    </main>
  );
}
