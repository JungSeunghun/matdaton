import { randomUUID } from "node:crypto";
import { createApprovalToken } from "@/lib/approval/approval-token";
import { computeApprovedHash, computeContractHash } from "@/lib/approval/contract-hash";
import type {
  Execution,
  ExecutionContract,
  ExecutionMode,
  ExecutionProgressEvent,
  ExecutionStatus,
  MetricEventName,
  NodeResult,
  OvernightDiff,
  ToolCallLogEntry,
} from "@/lib/contracts/schemas";
import { WRITE_TOOLS } from "@/lib/contracts/schemas";
import type { ExecutionStore } from "@/lib/store/execution-store";
import { compileExecutionContract } from "@/lib/workflow/agents/compiler-agent";
import { executeApprovedNodes } from "@/lib/workflow/agents/executor-agent";
import { runPolicyChecks, selectBlockedNodeIds } from "@/lib/workflow/agents/policy-agent";
import { collectOvernightDiff, type ScoutDeps } from "@/lib/workflow/agents/scout-agent";
import { runVerifierRules, type VerifierDeps } from "@/lib/workflow/agents/verifier-agent";

export type WorkflowDeps = {
  store: ExecutionStore;
  scoutDeps: ScoutDeps;
  hmacSecret: string;
  approvalTtlSeconds: number;
  createTodoIssue: (
    repoRef: string,
    args: { title: string; body: string; idempotencyKey: string },
  ) => Promise<{ number: number; url: string }>;
  checkUrlExists: (url: string) => Promise<boolean>;
  checkArtifactExists?: (nodeResult: NodeResult) => Promise<boolean>;
  inferContract?: (input: { repoRef: string; diff: OvernightDiff }) => Promise<ExecutionContract>;
  emitProgress: (event: ExecutionProgressEvent) => void;
  now?: () => Date;
};

export type StartExecutionInput = {
  userId: string;
  repoRef: string;
  icsUrl: string | null;
  mode: ExecutionMode;
};

export type ApproveExecutionInput = {
  userId: string;
  executionId: string;
  approvedNodeIds: string[];
};

function nowOf(deps: WorkflowDeps): () => Date {
  return deps.now ?? (() => new Date());
}

function toDateUtc(at: Date): string {
  return at.toISOString().slice(0, 10);
}

async function recordMetricEvent(
  deps: WorkflowDeps,
  userId: string,
  executionId: string,
  name: MetricEventName,
  at: Date,
): Promise<void> {
  await deps.store.appendMetricEvent({
    id: `evt_${randomUUID()}`,
    userId,
    executionId,
    date: toDateUtc(at),
    name,
    value: 1,
    source: "server",
    recordedAt: at.toISOString(),
  });
}

async function transition(
  deps: WorkflowDeps,
  userId: string,
  executionId: string,
  from: ExecutionStatus,
  to: ExecutionStatus,
): Promise<void> {
  const ok = await deps.store.transitionStatus(userId, executionId, from, to);
  if (!ok) throw new Error(`invalid status transition: ${from} -> ${to}`);
}

function makeVerifierDeps(deps: WorkflowDeps): VerifierDeps {
  return {
    checkUrlExists: deps.checkUrlExists,
    // 기본 재검증: 이슈는 URL 존재 확인, 초안은 스토어 저장 여부 확인
    checkArtifactExists:
      deps.checkArtifactExists ??
      (async (nodeResult) => {
        if (nodeResult.tool === "github.create_todo_issue") {
          return nodeResult.resourceUrl != null && (await deps.checkUrlExists(nodeResult.resourceUrl));
        }
        return (await deps.store.getCommentDraft(nodeResult.idempotencyKey)) != null;
      }),
  };
}

export async function startExecution(input: StartExecutionInput, deps: WorkflowDeps): Promise<Execution> {
  const now = nowOf(deps);
  const startedAt = now();
  const executionId = `exec_${randomUUID()}`;

  await deps.store.createExecution({
    id: executionId,
    userId: input.userId,
    repoRef: input.repoRef,
    mode: input.mode,
    status: "created",
    startedAt: startedAt.toISOString(),
    traceId: `trace_${randomUUID()}`,
  });

  let stage = "created";
  try {
    if (input.mode === "daily") {
      await recordMetricEvent(deps, input.userId, executionId, "button_clicked", now());
    }

    stage = "scouting";
    await transition(deps, input.userId, executionId, "created", "scouting");
    deps.emitProgress({ type: "stage_changed", executionId, stage: "scouting" });
    const sinceIso = new Date(startedAt.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const overnightDiff = await collectOvernightDiff(
      { repoRef: input.repoRef, icsUrl: input.icsUrl, sinceIso, dateUtc: toDateUtc(startedAt) },
      deps.scoutDeps,
    );
    await deps.store.updateExecution(input.userId, executionId, { overnightDiff });

    stage = "compiling";
    await transition(deps, input.userId, executionId, "scouting", "compiling");
    deps.emitProgress({ type: "stage_changed", executionId, stage: "compiling" });
    const compiled = await compileExecutionContract({
      executionId,
      repoRef: input.repoRef,
      diff: overnightDiff,
      inferContract: deps.inferContract,
    });
    // 추론 결과의 executionId를 신뢰하지 않고 실제 값으로 고정
    const contract: ExecutionContract = { ...compiled, executionId };
    const contractHash = computeContractHash(contract);
    await deps.store.updateExecution(input.userId, executionId, { contract, contractHash });

    stage = "policy_check";
    await transition(deps, input.userId, executionId, "compiling", "policy_check");
    deps.emitProgress({ type: "stage_changed", executionId, stage: "policy_check" });
    const policyReport = runPolicyChecks({ contract, repoRef: input.repoRef });
    await deps.store.updateExecution(input.userId, executionId, { policyReport });

    if (input.mode === "daily") {
      stage = "waiting_approval";
      await transition(deps, input.userId, executionId, "policy_check", "waiting_approval");
      deps.emitProgress({ type: "stage_changed", executionId, stage: "waiting_approval" });
    } else {
      // judge 모드는 승인·쓰기 도구 없이 읽기 전용으로 검증까지 완주
      stage = "verifying";
      await transition(deps, input.userId, executionId, "policy_check", "verifying");
      deps.emitProgress({ type: "stage_changed", executionId, stage: "verifying" });
      const receipt = await runVerifierRules(
        {
          mode: "judge",
          overnightDiff,
          contract,
          executionResult: null,
          approvedNodeIds: [],
          approvedHash: null,
          toolCallLog: [],
          metricEvents: [],
        },
        makeVerifierDeps(deps),
      );
      await deps.store.updateExecution(input.userId, executionId, { receipt });
      stage = "completed";
      await transition(deps, input.userId, executionId, "verifying", "completed");
    }
  } catch (error) {
    return deps.store.updateExecution(input.userId, executionId, {
      status: "failed",
      failure: { stage, message: error instanceof Error ? error.message : String(error) },
    });
  }

  const execution = await deps.store.getExecution(input.userId, executionId);
  if (!execution) throw new Error(`execution not found: ${executionId}`);
  return execution;
}

export async function approveExecution(input: ApproveExecutionInput, deps: WorkflowDeps): Promise<Execution> {
  const now = nowOf(deps);
  const execution = await deps.store.getExecution(input.userId, input.executionId);
  if (!execution) throw new Error(`execution not found: ${input.executionId}`);
  if (execution.status !== "waiting_approval") {
    throw new Error("execution is not waiting_approval");
  }
  const contract = execution.contract;
  if (!contract) throw new Error("execution has no compiled contract");

  const blockedNodeIds = execution.policyReport ? selectBlockedNodeIds(execution.policyReport) : [];
  const blockedApproved = input.approvedNodeIds.filter((id) => blockedNodeIds.includes(id));
  if (blockedApproved.length > 0) {
    throw new Error(`approval includes policy-blocked nodes: ${blockedApproved.join(", ")}`);
  }

  const approvedHash = computeApprovedHash(contract, input.approvedNodeIds);
  const token = createApprovalToken(
    {
      executionId: execution.id,
      approvedNodeIds: input.approvedNodeIds,
      approvedHash,
      allowedTools: [...WRITE_TOOLS],
      ttlSeconds: deps.approvalTtlSeconds,
    },
    deps.hmacSecret,
  );
  await recordMetricEvent(deps, input.userId, execution.id, "approval_completed", now());
  await deps.store.updateExecution(input.userId, execution.id, { approval: token });

  await transition(deps, input.userId, execution.id, "waiting_approval", "executing");
  deps.emitProgress({ type: "stage_changed", executionId: execution.id, stage: "executing" });

  const toolCallLog: ToolCallLogEntry[] = [...(execution.toolCallLog ?? [])];
  const executionResult = await executeApprovedNodes(
    {
      contract,
      repoRef: execution.repoRef,
      token,
      secret: deps.hmacSecret,
      existingResults: execution.executionResult?.nodeResults ?? [],
    },
    {
      createTodoIssue: deps.createTodoIssue,
      saveIssueCommentDraft: async (args) => {
        await deps.store.saveCommentDraft({
          id: args.idempotencyKey,
          userId: input.userId,
          executionId: args.executionId,
          nodeId: args.nodeId,
          issueNumber: args.issueNumber,
          body: args.body,
          savedAt: now().toISOString(),
        });
        return { draftId: args.idempotencyKey };
      },
      logToolCall: (entry) => toolCallLog.push(entry),
    },
  );
  await deps.store.updateExecution(input.userId, execution.id, { executionResult, toolCallLog });

  await transition(deps, input.userId, execution.id, "executing", "verifying");
  deps.emitProgress({ type: "stage_changed", executionId: execution.id, stage: "verifying" });

  const receipt = await runVerifierRules(
    {
      mode: "daily",
      overnightDiff: execution.overnightDiff ?? null,
      contract,
      executionResult,
      approvedNodeIds: input.approvedNodeIds,
      approvedHash,
      toolCallLog,
      metricEvents: await deps.store.listMetricEvents(input.userId),
    },
    makeVerifierDeps(deps),
  );
  await deps.store.updateExecution(input.userId, execution.id, { receipt });
  await transition(deps, input.userId, execution.id, "verifying", "completed");

  const completed = await deps.store.getExecution(input.userId, execution.id);
  if (!completed) throw new Error(`execution not found: ${execution.id}`);
  return completed;
}
