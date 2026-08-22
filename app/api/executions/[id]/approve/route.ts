import { z } from "zod";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/api/session";
import { createWorkflowDeps } from "@/lib/api/workflow-deps";
import { computeContractHash } from "@/lib/approval/contract-hash";
import { selectBlockedNodeIds } from "@/lib/workflow/agents/policy-agent";
import { approveExecution } from "@/lib/workflow/run-execution";

const ApproveExecutionBodySchema = z.strictObject({
  approvedNodeIds: z.array(z.string()),
});

const APPROVAL_TOKEN_ERROR_CODES = new Set([
  "expired",
  "hash_mismatch",
  "invalid_signature",
  "execution_mismatch",
  "tool_not_allowed",
]);

function auditDenied(
  userId: string,
  executionId: string,
  reason: string,
  nodeIds?: string[],
): void {
  console.warn({
    audit: "approval_denied",
    userId,
    executionId,
    reason,
    ...(nodeIds ? { nodeIds } : {}),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("요청 body는 올바른 JSON이어야 합니다");
  }

  const parsed = ApproveExecutionBodySchema.safeParse(body);
  if (!parsed.success) return badRequest("요청 body가 올바르지 않습니다");

  const { id } = await params;
  const deps = createWorkflowDeps();
  const execution = await deps.store.getExecution(user.userId, id);
  if (!execution) return notFound();
  if (execution.status !== "waiting_approval") {
    return conflict("execution is not waiting_approval");
  }

  const { approvedNodeIds } = parsed.data;
  const contract = execution.contract;
  const policyReport = execution.policyReport;
  if (!contract || !policyReport || contract.executionId !== id || policyReport.executionId !== id) {
    auditDenied(user.userId, id, "contract_policy_integrity_failed", approvedNodeIds);
    return forbidden("계약 또는 정책 무결성 검증에 실패했습니다");
  }

  const blockedNodeIds = selectBlockedNodeIds(policyReport).filter((nodeId) => approvedNodeIds.includes(nodeId));
  if (blockedNodeIds.length > 0) {
    auditDenied(user.userId, id, "policy_blocked_nodes", blockedNodeIds);
    return forbidden("정책에 의해 차단된 노드는 승인할 수 없습니다");
  }

  const prepNodeIds = new Set(contract.prepNodes.map((node) => node.nodeId));
  const unknownNodeIds = approvedNodeIds.filter((nodeId) => !prepNodeIds.has(nodeId));
  if (unknownNodeIds.length > 0) {
    auditDenied(user.userId, id, "unknown_prep_nodes", unknownNodeIds);
    return forbidden("존재하지 않는 준비 노드는 승인할 수 없습니다");
  }

  if (execution.contractHash !== computeContractHash(contract)) {
    auditDenied(user.userId, id, "contract_hash_mismatch", approvedNodeIds);
    return forbidden("계약 무결성 검증에 실패했습니다");
  }

  try {
    const completed = await approveExecution(
      { userId: user.userId, executionId: id, approvedNodeIds },
      deps,
    );
    const tokenViolations = completed.executionResult?.nodeResults.filter(
      (result) => result.errorCode && APPROVAL_TOKEN_ERROR_CODES.has(result.errorCode),
    );
    if (tokenViolations && tokenViolations.length > 0) {
      auditDenied(
        user.userId,
        id,
        tokenViolations.map((result) => result.errorCode).join(","),
        tokenViolations.map((result) => result.nodeId),
      );
      return forbidden("승인 토큰 검증에 실패했습니다");
    }

    return Response.json(completed);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not found")) return notFound();
      if (error.message.includes("waiting_approval")) {
        return conflict("execution is not waiting_approval");
      }
      if (error.message.startsWith("approval token violation:")) {
        auditDenied(user.userId, id, error.message, approvedNodeIds);
        return forbidden("승인 토큰 검증에 실패했습니다");
      }
    }
    throw error;
  }
}
