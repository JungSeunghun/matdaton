// MOCK: 실제 파이프라인 연결 전 프론트엔드 개발용 임시 응답
// 모든 형태는 lib/contracts/schemas.ts(zod)를 따른다 (PLAN 2.1).
import type {
  EvidenceReceipt,
  Execution,
  ExecutionContract,
  ExecutionProgressEvent,
  ExecutionResult,
  PolicyReport,
} from "@/lib/contracts/schemas";

const REPO_URL = "https://github.com/octocat/hello-world";
const MOCK_CONTRACT_HASH = "mockhash_3f9c2a71d84b56e0";

export function mockExecutionId(mode: "daily" | "judge" = "daily"): string {
  return `exec_mock_${mode}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function mockOvernightDiff() {
  return {
    commits: [
      {
        sha: "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d",
        message: "fix: resolve race condition in sync worker",
        author: "octocat",
        url: `${REPO_URL}/commit/7fd1a60b01f91b314f59955a4e4d4e80d8edf11d`,
        committedAt: "2026-08-21T22:14:00Z",
      },
      {
        sha: "553c2077f0edc3d5dc5d17262f6aa498e69d6f8e",
        message: "feat: add retry backoff to webhook dispatcher",
        author: "hubot",
        url: `${REPO_URL}/commit/553c2077f0edc3d5dc5d17262f6aa498e69d6f8e`,
        committedAt: "2026-08-21T23:41:00Z",
      },
    ],
    issueEvents: [
      {
        issueNumber: 42,
        issueTitle: "Webhook delivery fails intermittently",
        commentAuthor: "hubot",
        commentSummary: "재현 로그 첨부 — 재시도 로직 검토 요청",
        url: `${REPO_URL}/issues/42#issuecomment-9001`,
        createdAt: "2026-08-22T01:05:00Z",
      },
    ],
    reviewRequests: [
      {
        prNumber: 17,
        prTitle: "Add retry backoff to webhook dispatcher",
        requestedBy: "hubot",
        url: `${REPO_URL}/pull/17`,
        requestedAt: "2026-08-22T00:20:00Z",
      },
    ],
    meetings: [
      {
        title: "데일리 스탠드업",
        startsAt: "2026-08-22T10:00:00+09:00",
        endsAt: "2026-08-22T10:15:00+09:00",
      },
    ],
    availableMinutes: 300,
    missingSources: [],
  };
}

export function mockContract(executionId: string): ExecutionContract {
  return {
    executionId,
    actions: [
      {
        nodeId: "node-1",
        title: "PR #17 리뷰 요청 응답 — 재시도 백오프 로직 검토",
        evidenceUrls: [`${REPO_URL}/pull/17`],
        successCriteria: "PR #17에 리뷰 코멘트가 남고 승인/변경요청 상태가 된다",
        estimatedMinutes: 25,
      },
      {
        nodeId: "node-2",
        title: "이슈 #42 재현 로그 분석 후 원인 코멘트 작성",
        evidenceUrls: [
          `${REPO_URL}/issues/42#issuecomment-9001`,
          `${REPO_URL}/commit/7fd1a60b01f91b314f59955a4e4d4e80d8edf11d`,
        ],
        successCriteria: "이슈 #42에 원인 분석 코멘트 초안이 저장된다",
        estimatedMinutes: 40,
      },
      {
        nodeId: "node-3",
        title: "어젯밤 커밋 2건 기반 후속 할 일 이슈 생성",
        evidenceUrls: [
          `${REPO_URL}/commit/553c2077f0edc3d5dc5d17262f6aa498e69d6f8e`,
        ],
        successCriteria: "후속 작업 할 일 이슈가 저장소에 생성된다",
        estimatedMinutes: 15,
      },
    ],
    prepNodes: [
      {
        nodeId: "node-1",
        tool: "github.create_todo_issue",
        args: { title: "리뷰: PR #17 재시도 백오프", labels: ["first-move"] },
        preview: "[할 일 이슈] 리뷰: PR #17 재시도 백오프 — first-move 라벨",
      },
      {
        nodeId: "node-2",
        tool: "drafts.save_issue_comment",
        args: { issueNumber: 42 },
        preview: "[코멘트 초안] #42 원인 분석 — 게시하지 않고 저장만",
      },
      {
        nodeId: "node-3",
        tool: "github.create_todo_issue",
        args: { title: "커밋 후속 작업 정리", labels: ["first-move"] },
        preview: "[할 일 이슈] 커밋 후속 작업 정리 — first-move 라벨",
      },
    ],
    forbiddenScope: ["force-push", "PR merge", "브랜치 삭제", "이슈 close", "라벨 삭제"],
    noChanges: false,
  };
}

export function mockPolicyReport(executionId: string): PolicyReport {
  return {
    executionId,
    nodeFindings: [
      { nodeId: "node-1", verdict: "allowed", reasons: [] },
      { nodeId: "node-2", verdict: "allowed", reasons: [] },
      { nodeId: "node-3", verdict: "allowed", reasons: [] },
    ],
  };
}

export function mockExecutionResult(executionId: string, approvedNodeIds?: string[]): ExecutionResult {
  const approved = new Set(approvedNodeIds ?? ["node-1", "node-2", "node-3"]);
  const tools = {
    "node-1": "github.create_todo_issue",
    "node-2": "drafts.save_issue_comment",
    "node-3": "github.create_todo_issue",
  } as const;
  return {
    executionId,
    nodeResults: (["node-1", "node-2", "node-3"] as const).map((nodeId) => ({
      nodeId,
      tool: tools[nodeId],
      status: approved.has(nodeId) ? ("succeeded" as const) : ("skipped" as const),
      resourceUrl: approved.has(nodeId) ? `${REPO_URL}/issues/43` : undefined,
      idempotencyKey: `${executionId}:${nodeId}`,
    })),
  };
}

export function mockExecution(
  id: string,
  overrides: { status?: Execution["status"]; mode?: "daily" | "judge"; repoRef?: string } = {},
): Execution {
  return {
    id,
    userId: "mock-user",
    repoRef: overrides.repoRef ?? "octocat/hello-world",
    mode: overrides.mode ?? "daily",
    status: overrides.status ?? "created",
    startedAt: new Date().toISOString(),
    overnightDiff: mockOvernightDiff(),
    contract: mockContract(id),
    contractHash: MOCK_CONTRACT_HASH,
    policyReport: mockPolicyReport(id),
    traceId: `trace_mock_${id}`,
  };
}

export function mockApprovalToken(executionId: string, approvedNodeIds: string[]) {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 10 * 60 * 1000);
  return {
    executionId,
    approvedNodeIds,
    approvedHash: MOCK_CONTRACT_HASH,
    allowedTools: ["github.create_todo_issue", "drafts.save_issue_comment"],
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    signature: "mocksig_a1b2c3d4e5f6",
  };
}

export function mockReceipt(executionId: string, startupSeconds = 84): EvidenceReceipt {
  return {
    executionId,
    mode: "daily",
    ruleResults: [
      {
        name: "근거 URL 실존",
        passed: true,
        evidence: "3개 행동의 근거 URL 4건 모두 GitHub API 재조회 2xx 확인",
      },
      {
        name: "생성물 실존",
        passed: true,
        evidence: `할 일 이슈 ${REPO_URL}/issues/43 및 코멘트 초안 재조회 성공`,
      },
      {
        name: "금지 행동 부재",
        passed: true,
        evidence: "도구 호출 로그 12건 검사 — 금지 범위 API 호출 없음",
      },
      {
        name: "승인 해시 일치",
        passed: true,
        evidence: "실행된 계약 해시가 승인 시점 contractHash와 일치",
      },
      {
        name: "허용 도구 준수",
        passed: true,
        evidence: "모든 쓰기 호출이 allowedTools 범위 내에서 수행됨",
      },
    ],
    checkedScope: ["근거 URL", "생성물", "금지 행동", "승인 해시", "허용 도구"],
    startupSeconds,
    savedMinutes: 28,
    issuedAt: new Date().toISOString(),
  };
}

export function mockJudgeReceipt(executionId: string): EvidenceReceipt {
  return {
    executionId,
    mode: "judge",
    ruleResults: [
      { name: "수집 완료", passed: true, evidence: "커밋·이슈·리뷰·일정 수집 완료" },
      { name: "실행 계약 컴파일", passed: true, evidence: "우선 행동 3개 · 스키마 검증 통과" },
      { name: "근거 URL 실존", passed: true, evidence: "URL 전수 2xx 확인" },
      { name: "금지 행동 부재", passed: true, evidence: "쓰기 API 호출 0건 (읽기 전용)" },
    ],
    checkedScope: ["수집", "계약 컴파일", "근거 URL", "금지 행동 (승인 해시·90초 타이머는 읽기 전용이라 제외)"],
    startupSeconds: null,
    savedMinutes: null,
    issuedAt: new Date().toISOString(),
  };
}

export function mockDailyMetrics(days = 7) {
  const result: { date: string; startupSeconds: number; savedMinutes: number; evidenceLinkRate: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    result.push({
      date: d.toISOString().slice(0, 10),
      startupSeconds: 70 + ((i * 13) % 40),
      savedMinutes: 20 + ((i * 7) % 15),
      evidenceLinkRate: 1,
    });
  }
  return result;
}

export function mockStreamEvents(executionId: string): ExecutionProgressEvent[] {
  const judge = executionId.includes("judge");
  const at = () => new Date().toISOString();
  const total = judge ? 4 : 6;
  const snapshot = (status: Execution["status"], extra: Partial<Execution> = {}): ExecutionProgressEvent => ({
    type: "execution_updated",
    executionId,
    execution: { ...mockExecution(executionId, { status, mode: judge ? "judge" : "daily" }), ...extra },
    at: at(),
  });

  const common: ExecutionProgressEvent[] = [
    { type: "stage_changed", executionId, stage: "scouting", at: at() },
    { type: "agent_started", executionId, agent: "scout", step: 1, total, at: at() },
    { type: "tool_called", executionId, tool: "github.list_commits", agent: "scout", summary: "최근 24시간 커밋 2건", at: at() },
    { type: "tool_called", executionId, tool: "github.list_issue_events", agent: "scout", summary: "이슈 댓글 1건", at: at() },
    { type: "tool_called", executionId, tool: "github.list_review_requests", agent: "scout", summary: "리뷰 요청 1건", at: at() },
    { type: "tool_called", executionId, tool: "calendar.read_ics", agent: "scout", summary: "오늘 회의 1건 · 가용 5시간", at: at() },
    { type: "agent_completed", executionId, agent: "scout", summary: "커밋 2 · 댓글 1 · 리뷰 1 · 회의 1건 수집", at: at() },
    snapshot("scouting"),
    { type: "stage_changed", executionId, stage: "compiling", at: at() },
    { type: "agent_started", executionId, agent: "compiler", step: 2, total, at: at() },
    { type: "agent_completed", executionId, agent: "compiler", summary: "우선 행동 3개 컴파일 · 근거 링크 4건 연결", at: at() },
    snapshot("compiling"),
    { type: "stage_changed", executionId, stage: "policy_check", at: at() },
    { type: "agent_started", executionId, agent: "policy", step: 3, total, at: at() },
    { type: "agent_completed", executionId, agent: "policy", summary: "인젝션 0건 · 차단 노드 0개", at: at() },
  ];

  if (judge) {
    return [
      ...common,
      { type: "stage_changed", executionId, stage: "verifying", at: at() },
      { type: "agent_started", executionId, agent: "verifier", step: 4, total, at: at() },
      { type: "agent_completed", executionId, agent: "verifier", summary: "규칙 4/4 통과 (제한 범위)", at: at() },
      { type: "stage_changed", executionId, stage: "completed", at: at() },
      snapshot("completed", { receipt: mockJudgeReceipt(executionId) }),
    ];
  }

  return [
    ...common,
    { type: "stage_changed", executionId, stage: "waiting_approval", at: at() },
    snapshot("waiting_approval"),
  ];
}
