import type { CommentDraft, Execution, ExecutionStatus, MetricEvent } from "@/lib/contracts/schemas";

export type ExecutionStore = {
  createExecution: (execution: Execution) => Promise<void>;
  getExecution: (userId: string, executionId: string) => Promise<Execution | null>;
  updateExecution: (userId: string, executionId: string, patch: Partial<Execution>) => Promise<Execution>;
  /** 조건부 상태 전이 — 현재 상태가 from이고 상태 기계상 허용될 때만 갱신 */
  transitionStatus: (
    userId: string,
    executionId: string,
    from: ExecutionStatus,
    to: ExecutionStatus,
  ) => Promise<boolean>;
  appendMetricEvent: (event: MetricEvent) => Promise<void>;
  listMetricEvents: (userId: string, date?: string) => Promise<MetricEvent[]>;
  saveCommentDraft: (draft: CommentDraft) => Promise<void>;
  getCommentDraft: (id: string) => Promise<CommentDraft | null>;
};
