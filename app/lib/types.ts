// SSE 이벤트·실행 데이터 계약 — lib/contracts/schemas.ts(zod)가 단일 기준 (PLAN 2.1)
// 이 파일은 스키마 타입 재수출 + UI 전용 상수·헬퍼만 가진다.

import type { AgentName, Execution, ExecutionStatus, PolicyReport } from "@/lib/contracts/schemas";

export type {
  AgentName,
  Execution,
  ExecutionContract,
  ExecutionMode,
  ExecutionProgressEvent as StreamEvent,
  ExecutionStatus,
  EvidenceReceipt,
  NodeResult,
  OvernightDiff,
  PolicyReport,
  PriorityAction,
  PrepNode,
  RuleResult,
} from "@/lib/contracts/schemas";

/** Policy가 차단한 노드 id 목록 (nodeFindings에서 파생) */
export function blockedNodeIds(report: PolicyReport | undefined): string[] {
  return (report?.nodeFindings ?? []).filter((f) => f.verdict === "blocked").map((f) => f.nodeId);
}

/** nodeId → 계약 행동 제목 조회 (NodeResult에는 제목이 없다) */
export function actionTitle(execution: Execution, nodeId: string): string {
  return execution.contract?.actions.find((a) => a.nodeId === nodeId)?.title ?? nodeId;
}

/** 일별 메트릭 API 응답 — evidenceLinkRate는 백엔드 집계 전이라 optional */
export interface DailyMetric {
  date: string;
  startupSeconds: number | null;
  savedMinutes: number | null;
  evidenceLinkRate?: number;
}

export const AGENT_LABELS: Record<AgentName, string> = {
  scout: "Scout",
  compiler: "Compiler",
  policy: "Policy",
  executor: "Executor",
  verifier: "Verifier",
};

export const STATUS_STEPS: Partial<Record<ExecutionStatus, { step: number; label: string }>> = {
  scouting: { step: 1, label: "Scout 수집 중" },
  compiling: { step: 2, label: "Compiler 계약 컴파일 중" },
  policy_check: { step: 3, label: "Policy 안전 검사 중" },
  waiting_approval: { step: 4, label: "승인 대기" },
  executing: { step: 5, label: "Executor 실행 중" },
  verifying: { step: 6, label: "Verifier 검증 중" },
};
