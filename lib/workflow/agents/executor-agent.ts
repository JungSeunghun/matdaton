import { verifyApprovalToken } from "@/lib/approval/approval-token";
import { computeApprovedHash, createIdempotencyKey } from "@/lib/approval/contract-hash";
import type { ApprovalToken, ExecutionContract, ExecutionResult, NodeResult } from "@/lib/contracts/schemas";
import type { ToolCallLogEntry } from "./verifier-agent";

export type ExecutorInput = {
  contract: ExecutionContract;
  repoRef: string;
  token: ApprovalToken;
  secret: string;
  existingResults: NodeResult[];
};

export type ExecutorDeps = {
  createTodoIssue: (
    repoRef: string,
    args: { title: string; body: string; idempotencyKey: string },
  ) => Promise<{ number: number; url: string }>;
  saveIssueCommentDraft: (args: {
    executionId: string;
    nodeId: string;
    issueNumber: number;
    body: string;
    idempotencyKey: string;
  }) => Promise<{ draftId: string }>;
  logToolCall: (entry: ToolCallLogEntry) => void;
};

export async function executeApprovedNodes(input: ExecutorInput, deps: ExecutorDeps): Promise<ExecutionResult> {
  const { contract, token, secret } = input;
  const expectedHash = computeApprovedHash(contract, token.approvedNodeIds);
  const nodeResults: NodeResult[] = [];

  for (const node of contract.prepNodes) {
    const idempotencyKey = createIdempotencyKey(contract.executionId, node.nodeId);

    const existing = input.existingResults.find(
      (r) => r.idempotencyKey === idempotencyKey && r.status === "succeeded",
    );
    if (existing) {
      nodeResults.push(existing);
      continue;
    }

    const verdict = verifyApprovalToken(token, {
      secret,
      executionId: contract.executionId,
      expectedHash,
      tool: node.tool,
      nodeId: node.nodeId,
    });
    if (!verdict.ok) {
      nodeResults.push({
        nodeId: node.nodeId,
        tool: node.tool,
        status: verdict.errorCode === "node_not_approved" ? "skipped" : "failed",
        idempotencyKey,
        errorCode: verdict.errorCode,
      });
      continue;
    }

    deps.logToolCall({ tool: node.tool, nodeId: node.nodeId });
    try {
      nodeResults.push(await executeNode(node, idempotencyKey, input, deps));
    } catch (error) {
      nodeResults.push({
        nodeId: node.nodeId,
        tool: node.tool,
        status: "failed",
        idempotencyKey,
        errorCode: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  return { executionId: contract.executionId, nodeResults };
}

async function executeNode(
  node: ExecutionContract["prepNodes"][number],
  idempotencyKey: string,
  input: ExecutorInput,
  deps: ExecutorDeps,
): Promise<NodeResult> {
  if (node.tool === "github.create_todo_issue") {
    const issue = await deps.createTodoIssue(input.repoRef, {
      title: String(node.args.title ?? ""),
      body: String(node.args.body ?? ""),
      idempotencyKey,
    });
    return {
      nodeId: node.nodeId,
      tool: node.tool,
      status: "succeeded",
      resourceUrl: issue.url,
      resourceRef: `issue#${issue.number}`,
      idempotencyKey,
    };
  }

  const draft = await deps.saveIssueCommentDraft({
    executionId: input.contract.executionId,
    nodeId: node.nodeId,
    issueNumber: Number(node.args.issueNumber ?? 0),
    body: String(node.args.body ?? ""),
    idempotencyKey,
  });
  return {
    nodeId: node.nodeId,
    tool: node.tool,
    status: "succeeded",
    resourceRef: draft.draftId,
    idempotencyKey,
  };
}
