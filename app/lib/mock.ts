// 클라이언트 mock 엔진 — 실제 API(/api/**)가 없을 때 가짜 SSE로 전체 흐름을 재현한다.
// 데이터·이벤트 형태는 lib/contracts/schemas.ts(zod)를 그대로 따른다 (PLAN 2.1).

import type {
  EvidenceReceipt,
  Execution,
  ExecutionContract,
  ExecutionProgressEvent,
  ExecutionStatus,
  OvernightDiff,
  PolicyReport,
} from "@/lib/contracts/schemas";
import type { DailyMetric } from "./types";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

type Listener = (e: ExecutionProgressEvent) => void;

interface MockState {
  execution: Execution;
  listeners: Set<Listener>;
  started: boolean;
  failedOnce: Set<string>;
  startupSeconds: number;
}

const store = new Map<string, MockState>();

function emit(id: string, e: ExecutionProgressEvent) {
  store.get(id)?.listeners.forEach((l) => l(e));
}

function snapshot(id: string) {
  const s = store.get(id);
  if (s) emit(id, { type: "execution_updated", executionId: id, execution: structuredClone(s.execution), at: now() });
}

function setStatus(id: string, status: ExecutionStatus) {
  const s = store.get(id);
  if (!s) return;
  s.execution.status = status;
  emit(id, { type: "stage_changed", executionId: id, stage: status, at: now() });
}

// ---------- fixtures ----------

function fixtureDiff(repoRef: string, empty: boolean): OvernightDiff {
  if (empty) {
    return { commits: [], issueEvents: [], reviewRequests: [], meetings: [], availableMinutes: 320, missingSources: [] };
  }
  const base = `https://github.com/${repoRef}`;
  return {
    commits: [
      {
        sha: "9f2c1a7d84b56e0f2c1a7d84b56e0f2c1a7d84b5",
        message: "feat: verifier 규칙 5종 추가",
        author: "hodu",
        url: `${base}/commits`,
        committedAt: "2026-08-22T02:14:00+09:00",
      },
      {
        sha: "3a41b9f2c1a7d84b56e03a41b9f2c1a7d84b56e0",
        message: "fix: 승인 해시 비교 시 정규화 누락",
        author: "kh",
        url: `${base}/commits`,
        committedAt: "2026-08-22T01:02:00+09:00",
      },
      {
        sha: "56e09f2c1a7d84b53a41b56e09f2c1a7d84b53a4",
        message: "test: ICS 반복 일정 파서 케이스 추가",
        author: "mata",
        url: `${base}/commits`,
        committedAt: "2026-08-21T23:55:00+09:00",
      },
    ],
    issueEvents: [
      {
        issueNumber: 124,
        issueTitle: "승인 토큰 만료 정책",
        commentAuthor: "kh",
        commentSummary: "만료 10분 근거 논의 — 재발급 UX 검토 요청",
        url: `${base}/issues/124`,
        createdAt: "2026-08-21T23:41:00+09:00",
      },
    ],
    reviewRequests: [
      {
        prNumber: 128,
        prTitle: "영수증 스키마 리뷰 요청",
        requestedBy: "mata",
        url: `${base}/pull/128`,
        requestedAt: "2026-08-21T21:05:00+09:00",
      },
    ],
    meetings: [
      { title: "스탠드업", startsAt: "2026-08-22T10:00:00+09:00", endsAt: "2026-08-22T10:15:00+09:00" },
      { title: "스프린트 리뷰", startsAt: "2026-08-22T14:00:00+09:00", endsAt: "2026-08-22T15:00:00+09:00" },
    ],
    availableMinutes: 320,
    missingSources: [],
  };
}

function fixtureContract(id: string, repoRef: string, empty: boolean): ExecutionContract {
  const base = `https://github.com/${repoRef}`;
  const actions = [
    {
      nodeId: "node-1",
      title: "리뷰 요청 #128 영수증 스키마 검토",
      evidenceUrls: [`${base}/pull/128`],
      successCriteria: "GitHub API 재조회로 할 일 실존 확인, 근거 URL 2xx 응답",
      estimatedMinutes: 25,
    },
    {
      nodeId: "node-2",
      title: "할 일: verifier 실패 규칙 재시도 테스트 추가",
      evidenceUrls: [`${base}/commits`],
      successCriteria: "first-move 라벨 이슈 생성, 멱등성 키로 중복 생성 없음",
      estimatedMinutes: 40,
    },
    {
      nodeId: "node-3",
      title: "이슈 #124 코멘트 초안: 토큰 만료 10분 근거 정리",
      evidenceUrls: [`${base}/issues/124`],
      successCriteria: "초안이 자체 API로 재조회됨, GitHub에 게시되지 않음 (FR-13)",
      estimatedMinutes: 15,
    },
  ];
  const prepNodes = [
    {
      nodeId: "node-1",
      tool: "github.create_todo_issue" as const,
      args: { title: "리뷰: #128 영수증 스키마", labels: ["first-move"] },
      preview: "[할 일 이슈] 리뷰: #128 영수증 스키마 — first-move 라벨",
    },
    {
      nodeId: "node-2",
      tool: "github.create_todo_issue" as const,
      args: { title: "verifier 실패 규칙 재시도 테스트", labels: ["first-move"] },
      preview: "[할 일 이슈] verifier 실패 규칙 재시도 테스트 — first-move 라벨",
    },
    {
      nodeId: "node-3",
      tool: "drafts.save_issue_comment" as const,
      args: { issueNumber: 124 },
      preview: "[코멘트 초안] #124 토큰 만료 10분 근거 — 게시하지 않고 저장만",
    },
  ];
  return {
    executionId: id,
    actions: empty ? actions.slice(0, 1) : actions,
    prepNodes: empty ? prepNodes.slice(0, 1) : prepNodes,
    forbiddenScope: ["GitHub에 코멘트 직접 게시", "코드 수정·push", "메일·메시지 전송"],
    noChanges: empty,
  };
}

function fixturePolicyReport(id: string, contract: ExecutionContract): PolicyReport {
  return {
    executionId: id,
    nodeFindings: contract.actions.map((a) => ({ nodeId: a.nodeId, verdict: "allowed" as const, reasons: [] })),
  };
}

function buildReceipt(ex: Execution, startupSeconds: number): EvidenceReceipt {
  const results = ex.executionResult?.nodeResults ?? [];
  const executed = results.filter((n) => n.status !== "skipped");
  const failed = executed.filter((n) => n.status === "failed");
  const timerPass = startupSeconds <= 90;
  return {
    executionId: ex.id,
    mode: "daily",
    startupSeconds,
    savedMinutes: 28,
    issuedAt: now(),
    checkedScope: ["근거 URL", "생성물", "금지 행동", "승인 해시", "90초 타이머"],
    ruleResults: [
      { name: "근거 URL 실존", passed: true, evidence: "URL 6/6 · API 재조회 2xx 확인" },
      {
        name: "생성물 실존",
        passed: failed.length === 0,
        evidence:
          failed.length === 0
            ? `재조회 ${executed.length}/${executed.length} 확인`
            : `재조회 ${executed.length - failed.length}/${executed.length} — 실패 노드 재시도 가능`,
      },
      { name: "금지 행동 부재", passed: true, evidence: "도구 호출 로그 내 금지 API 0건" },
      { name: "승인 해시 일치", passed: true, evidence: `approvedHash == ${ex.contractHash ?? "—"}` },
      { name: "90초 타이머", passed: timerPass, evidence: `${startupSeconds}초 (목표 90초 이하)` },
    ],
  };
}

function judgeReceipt(ex: Execution): EvidenceReceipt {
  const noChanges = ex.contract?.noChanges ?? false;
  return {
    executionId: ex.id,
    mode: "judge",
    startupSeconds: null,
    savedMinutes: null,
    issuedAt: now(),
    checkedScope: ["수집", "계약 컴파일", "근거 URL", "금지 행동 (승인 해시·90초 타이머는 읽기 전용이라 제외)"],
    ruleResults: [
      {
        name: "수집 완료",
        passed: true,
        evidence: noChanges ? "변경 없음 — 성공 조건으로 처리 (FR-05)" : "커밋·이슈·리뷰·일정 수집 완료",
      },
      { name: "실행 계약 컴파일", passed: true, evidence: `우선 행동 ${ex.contract?.actions.length ?? 0}개 · 스키마 검증 통과` },
      { name: "근거 URL 실존", passed: true, evidence: "URL 전수 2xx 확인" },
      { name: "금지 행동 부재", passed: true, evidence: "쓰기 API 호출 0건 (읽기 전용)" },
    ],
  };
}

// ---------- lifecycle ----------

export function createMockExecution(opts: { mode: "daily" | "judge"; repoRef: string }): Execution {
  const id = `exec_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const execution: Execution = {
    id,
    userId: "mock-user",
    mode: opts.mode,
    repoRef: opts.repoRef,
    status: "created",
    traceId: `trace-${id}`,
    startedAt: now(),
  };
  store.set(id, {
    execution,
    listeners: new Set(),
    started: false,
    failedOnce: new Set(),
    startupSeconds: 0,
  });
  return execution;
}

export function subscribeMock(id: string, listener: Listener): () => void {
  const s = store.get(id);
  if (!s) {
    queueMicrotask(() => listener({ type: "stream_error", executionId: id, message: "실행을 찾을 수 없습니다.", at: now() }));
    return () => {};
  }
  s.listeners.add(listener);
  if (!s.started) {
    s.started = true;
    void runPipeline(id);
  }
  return () => s.listeners.delete(listener);
}

async function runPipeline(id: string) {
  const s = store.get(id);
  if (!s) return;
  const ex = s.execution;
  const judge = ex.mode === "judge";
  const total = judge ? 4 : 6;
  const emptyRepo = /empty|없음/.test(ex.repoRef);

  // ① Scout — fan-out 병렬 수집
  setStatus(id, "scouting");
  emit(id, { type: "agent_started", executionId: id, agent: "scout", step: 1, total, at: now() });
  await sleep(500);
  emit(id, { type: "tool_called", executionId: id, agent: "scout", tool: "github.list_commits", summary: emptyRepo ? "최근 24시간 커밋 0건" : "최근 24시간 커밋 3건", at: now() });
  await sleep(400);
  emit(id, { type: "tool_called", executionId: id, agent: "scout", tool: "github.list_issue_events", summary: emptyRepo ? "이슈 댓글 0건" : "이슈 댓글 1건", at: now() });
  await sleep(350);
  emit(id, { type: "tool_called", executionId: id, agent: "scout", tool: "github.list_review_requests", summary: emptyRepo ? "리뷰 요청 0건" : "리뷰 요청 1건", at: now() });
  await sleep(450);
  emit(id, { type: "tool_called", executionId: id, agent: "scout", tool: "calendar.read_ics", summary: judge ? "ICS 미입력 — 일정 없음으로 처리" : "오늘 회의 2건 · 가용 5시간 20분", at: now() });
  ex.overnightDiff = fixtureDiff(ex.repoRef, emptyRepo);
  await sleep(400);
  emit(id, {
    type: "agent_completed",
    executionId: id,
    agent: "scout",
    summary: emptyRepo ? "변경 없음 — 오늘의 계획만 컴파일 (FR-05)" : "커밋 3 · 댓글 1 · 리뷰 1 · 회의 2건 수집",
    at: now(),
  });
  snapshot(id);

  // ② Compiler — 실행 계약
  setStatus(id, "compiling");
  emit(id, { type: "agent_started", executionId: id, agent: "compiler", step: 2, total, at: now() });
  await sleep(900);
  ex.contract = fixtureContract(id, ex.repoRef, emptyRepo);
  ex.contractHash = "sha256:9f2c…a41b";
  emit(id, {
    type: "agent_completed",
    executionId: id,
    agent: "compiler",
    summary: `우선 행동 ${ex.contract.actions.length}개 컴파일 · 근거 링크 ${ex.contract.actions.reduce((n, a) => n + a.evidenceUrls.length, 0)}건 연결`,
    at: now(),
  });
  snapshot(id);

  // ③ Policy — 안전 검사
  setStatus(id, "policy_check");
  emit(id, { type: "agent_started", executionId: id, agent: "policy", step: 3, total, at: now() });
  await sleep(700);
  ex.policyReport = fixturePolicyReport(id, ex.contract);
  emit(id, { type: "agent_completed", executionId: id, agent: "policy", summary: "인젤션 0건 · 차단 노드 0개 — 전 노드 승인 목록 노출", at: now() });
  snapshot(id);

  if (judge) {
    // Judge Mode — 승인 없이 드라이런 미리보기 + 제한 범위 Verifier
    setStatus(id, "verifying");
    emit(id, { type: "agent_started", executionId: id, agent: "verifier", step: 4, total, at: now() });
    await sleep(800);
    ex.receipt = judgeReceipt(ex);
    emit(id, { type: "agent_completed", executionId: id, agent: "verifier", summary: `규칙 ${ex.receipt.ruleResults.length}/${ex.receipt.ruleResults.length} 통과 (제한 범위)`, at: now() });
    setStatus(id, "completed");
    snapshot(id);
    return;
  }

  setStatus(id, "waiting_approval");
  snapshot(id);
}

export async function approveMock(id: string, approvedNodeIds: string[], startupSeconds: number) {
  const s = store.get(id);
  if (!s || !s.execution.contract) return;
  const ex = s.execution;
  const contract = ex.contract!;
  s.startupSeconds = startupSeconds;
  ex.excludedNodeIds = contract.actions.map((a) => a.nodeId).filter((n) => !approvedNodeIds.includes(n));

  setStatus(id, "executing");
  emit(id, { type: "agent_started", executionId: id, agent: "executor", step: 5, total: 6, at: now() });

  const prepByNode = new Map(contract.prepNodes.map((p) => [p.nodeId, p]));
  ex.executionResult = {
    executionId: id,
    nodeResults: contract.actions.map((a) => ({
      nodeId: a.nodeId,
      tool: prepByNode.get(a.nodeId)?.tool ?? ("github.create_todo_issue" as const),
      status: "skipped" as const,
      idempotencyKey: `${id}:${a.nodeId}`,
    })),
  };

  for (const node of ex.executionResult.nodeResults) {
    if (!approvedNodeIds.includes(node.nodeId)) continue;
    const action = contract.actions.find((a) => a.nodeId === node.nodeId);
    await sleep(700);
    emit(id, { type: "tool_called", executionId: id, agent: "executor", tool: node.tool, summary: action?.title, at: now() });
    await sleep(500);
    // node-3은 첫 실행에서 실패시켜 재시도 흐름을 시연한다 (FR-17)
    if (node.nodeId === "node-3" && !s.failedOnce.has(node.nodeId)) {
      s.failedOnce.add(node.nodeId);
      node.status = "failed";
      node.errorCode = "초안 저장 시간 초과 — Cosmos DB 응답 없음 (mock)";
      emit(id, { type: "node_failed", executionId: id, nodeId: node.nodeId, reason: node.errorCode, at: now() });
    } else {
      node.status = "succeeded";
      node.resourceUrl =
        node.tool === "github.create_todo_issue"
          ? `https://github.com/${ex.repoRef}/issues/1${node.nodeId.slice(-1)}0`
          : `https://example.com/drafts/${id}/${node.nodeId}`;
      emit(id, { type: "node_completed", executionId: id, nodeId: node.nodeId, at: now() });
    }
  }

  const results = ex.executionResult.nodeResults;
  const done = results.filter((n) => n.status === "succeeded").length;
  const attempted = results.filter((n) => n.status !== "skipped").length;
  emit(id, { type: "agent_completed", executionId: id, agent: "executor", summary: `노드 ${done}/${attempted} 성공`, at: now() });

  setStatus(id, "verifying");
  emit(id, { type: "agent_started", executionId: id, agent: "verifier", step: 6, total: 6, at: now() });
  await sleep(900);
  ex.receipt = buildReceipt(ex, startupSeconds);
  const passed = ex.receipt.ruleResults.filter((r) => r.passed).length;
  emit(id, { type: "agent_completed", executionId: id, agent: "verifier", summary: `규칙 ${passed}/${ex.receipt.ruleResults.length} 통과 · 영수증 발급`, at: now() });
  setStatus(id, "completed");
  snapshot(id);
}

export async function retryMock(id: string, nodeId: string) {
  const s = store.get(id);
  const node = s?.execution.executionResult?.nodeResults.find((n) => n.nodeId === nodeId);
  if (!s || !node) return;
  const ex = s.execution;
  const action = ex.contract?.actions.find((a) => a.nodeId === nodeId);

  setStatus(id, "executing");
  emit(id, { type: "tool_called", executionId: id, agent: "executor", tool: node.tool, summary: `재시도: ${action?.title ?? nodeId} (멱등성 키 유지)`, at: now() });
  await sleep(900);
  node.status = "succeeded";
  node.errorCode = undefined;
  node.resourceUrl = `https://example.com/drafts/${id}/${nodeId}`;
  emit(id, { type: "node_completed", executionId: id, nodeId, at: now() });

  setStatus(id, "verifying");
  await sleep(600);
  ex.receipt = buildReceipt(ex, s.startupSeconds);
  const passed = ex.receipt.ruleResults.filter((r) => r.passed).length;
  emit(id, { type: "agent_completed", executionId: id, agent: "verifier", summary: `재검증 — 규칙 ${passed}/${ex.receipt.ruleResults.length} 통과`, at: now() });
  setStatus(id, "completed");
  snapshot(id);
}

export function metricsFixture(): DailyMetric[] {
  const data = [112, 96, 91, 88, 84, 79, 86, 82];
  return data.map((sec, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (data.length - 1 - i));
    return {
      date: d.toISOString().slice(0, 10),
      startupSeconds: sec,
      savedMinutes: 30 - Math.round(sec / 30),
      evidenceLinkRate: 1,
    };
  });
}
