// MOCK: 실제 파이프라인 연결 전 프론트엔드 개발용 임시 응답

const REPO_URL = "https://github.com/octocat/hello-world";

export function mockExecutionId(): string {
  return `exec_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

export function mockContract(executionId: string) {
  return {
    executionId,
    actions: [
      {
        nodeId: "node-1",
        title: "PR #17 리뷰 요청 응답 — 재시도 백오프 로직 검토",
        evidenceUrls: [`${REPO_URL}/pull/17`],
        successCriteria: "PR #17에 리뷰 코멘트가 남고 승인/변경요청 상태가 된다",
        forbidden: ["force-push", "PR merge", "브랜치 삭제"],
      },
      {
        nodeId: "node-2",
        title: "이슈 #42 재현 로그 분석 후 원인 코멘트 작성",
        evidenceUrls: [
          `${REPO_URL}/issues/42#issuecomment-9001`,
          `${REPO_URL}/commit/7fd1a60b01f91b314f59955a4e4d4e80d8edf11d`,
        ],
        successCriteria: "이슈 #42에 원인 분석 코멘트 초안이 저장된다",
        forbidden: ["이슈 close", "라벨 삭제"],
      },
      {
        nodeId: "node-3",
        title: "어젯밤 커밋 2건 기반 후속 할 일 이슈 생성",
        evidenceUrls: [
          `${REPO_URL}/commit/553c2077f0edc3d5dc5d17262f6aa498e69d6f8e`,
        ],
        successCriteria: "후속 작업 할 일 이슈가 저장소에 생성된다",
        forbidden: ["기존 이슈 수정", "마일스톤 변경"],
      },
    ],
    contractHash: "mockhash_3f9c2a71d84b56e0",
  };
}

export function mockPolicyReport(executionId: string) {
  return {
    executionId,
    findings: [
      { nodeId: "node-1", verdict: "allowed", reasons: [] },
      { nodeId: "node-2", verdict: "allowed", reasons: [] },
      { nodeId: "node-3", verdict: "allowed", reasons: [] },
    ],
    blockedNodes: [],
  };
}

export function mockExecution(
  id: string,
  overrides: { status?: string; mode?: "daily" | "judge"; repoRef?: string } = {},
) {
  return {
    id,
    userId: "mock-user",
    repoRef: overrides.repoRef ?? "octocat/hello-world",
    mode: overrides.mode ?? "daily",
    status: overrides.status ?? "created",
    overnightDiff: mockOvernightDiff(),
    contract: mockContract(id),
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
    approvedHash: "mockhash_3f9c2a71d84b56e0",
    allowedTools: ["github.create_todo_issue", "drafts.save_issue_comment"],
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    signature: "mocksig_a1b2c3d4e5f6",
  };
}

export function mockReceipt(executionId: string) {
  return {
    executionId,
    mode: "daily",
    rules: [
      {
        name: "근거 URL 실존",
        passed: true,
        evidence: "3개 행동의 근거 URL 4건 모두 GitHub API 재조회 2xx 확인",
      },
      {
        name: "생성물 실존",
        passed: true,
        evidence: `할 일 이슈 ${REPO_URL}/issues/43 및 코멘트 초안 2건 재조회 성공`,
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
    startupSeconds: 84,
    savedMinutes: 28,
    issuedAt: new Date().toISOString(),
  };
}

export function mockDailyMetrics(days = 7) {
  const result: { date: string; startupSeconds: number; savedMinutes: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    result.push({
      date: d.toISOString().slice(0, 10),
      startupSeconds: 70 + ((i * 13) % 40),
      savedMinutes: 20 + ((i * 7) % 15),
    });
  }
  return result;
}

export function mockStreamEvents(executionId: string) {
  return [
    { type: "stage_changed", executionId, stage: "scouting" },
    { type: "agent_started", executionId, agent: "scout" },
    { type: "tool_called", executionId, tool: "github.list_commits", agent: "scout" },
    { type: "tool_called", executionId, tool: "github.list_issue_events", agent: "scout" },
    { type: "tool_called", executionId, tool: "github.list_review_requests", agent: "scout" },
    { type: "tool_called", executionId, tool: "calendar.read_ics", agent: "scout" },
    { type: "agent_completed", executionId, agent: "scout" },
    { type: "stage_changed", executionId, stage: "compiling" },
    { type: "agent_started", executionId, agent: "compiler" },
    { type: "agent_completed", executionId, agent: "compiler" },
    { type: "stage_changed", executionId, stage: "policy_check" },
    { type: "agent_started", executionId, agent: "policy" },
    { type: "agent_completed", executionId, agent: "policy" },
    { type: "stage_changed", executionId, stage: "waiting_approval" },
  ];
}
