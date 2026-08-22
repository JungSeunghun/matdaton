import type { CommentDraft, Execution, ExecutionStatus, MetricEvent } from "@/lib/contracts/schemas";
import { canTransition } from "@/lib/workflow/execution-state";
import type { ExecutionStore } from "./execution-store";

export function createMemoryStore(): ExecutionStore {
  const executions = new Map<string, Execution>();
  const metricEvents: MetricEvent[] = [];
  const commentDrafts = new Map<string, CommentDraft>();

  const keyOf = (userId: string, executionId: string) => `${userId}:${executionId}`;

  return {
    async createExecution(execution: Execution) {
      const key = keyOf(execution.userId, execution.id);
      if (executions.has(key)) throw new Error(`execution already exists: ${execution.id}`);
      executions.set(key, structuredClone(execution));
    },

    async getExecution(userId: string, executionId: string) {
      const execution = executions.get(keyOf(userId, executionId));
      return execution ? structuredClone(execution) : null;
    },

    async updateExecution(userId: string, executionId: string, patch: Partial<Execution>) {
      const key = keyOf(userId, executionId);
      const existing = executions.get(key);
      if (!existing) throw new Error(`execution not found: ${executionId}`);
      const updated = { ...existing, ...structuredClone(patch) };
      executions.set(key, updated);
      return structuredClone(updated);
    },

    async transitionStatus(userId: string, executionId: string, from: ExecutionStatus, to: ExecutionStatus) {
      const key = keyOf(userId, executionId);
      const existing = executions.get(key);
      if (!existing || existing.status !== from || !canTransition(from, to)) return false;
      executions.set(key, { ...existing, status: to });
      return true;
    },

    async appendMetricEvent(event: MetricEvent) {
      metricEvents.push(structuredClone(event));
    },

    async listMetricEvents(userId: string, date?: string) {
      return metricEvents
        .filter((e) => e.userId === userId && (date === undefined || e.date === date))
        .map((e) => structuredClone(e));
    },

    async saveCommentDraft(draft: CommentDraft) {
      commentDrafts.set(draft.id, structuredClone(draft));
    },

    async getCommentDraft(id: string) {
      const draft = commentDrafts.get(id);
      return draft ? structuredClone(draft) : null;
    },
  };
}
