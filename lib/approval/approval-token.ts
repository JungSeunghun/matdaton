import { createHmac, timingSafeEqual } from "node:crypto";
import type { ApprovalToken } from "@/lib/contracts/schemas";

export type CreateApprovalTokenInput = {
  executionId: string;
  approvedNodeIds: string[];
  approvedHash: string;
  allowedTools: string[];
  ttlSeconds: number;
};

export type VerifyApprovalTokenInput = {
  secret: string;
  executionId: string;
  expectedHash: string;
  tool: string;
  nodeId: string;
  now?: Date;
};

export type VerifyApprovalTokenResult =
  | { ok: true }
  | {
      ok: false;
      errorCode:
        | "invalid_signature"
        | "expired"
        | "hash_mismatch"
        | "tool_not_allowed"
        | "node_not_approved"
        | "execution_mismatch";
    };

function signPayload(token: Omit<ApprovalToken, "signature">, secret: string): string {
  const payload = [
    token.executionId,
    [...token.approvedNodeIds].sort().join(","),
    token.approvedHash,
    [...token.allowedTools].sort().join(","),
    token.issuedAt,
    token.expiresAt,
  ].join("|");
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function createApprovalToken(input: CreateApprovalTokenInput, secret: string): ApprovalToken {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + input.ttlSeconds * 1000);
  const unsigned = {
    executionId: input.executionId,
    approvedNodeIds: input.approvedNodeIds,
    approvedHash: input.approvedHash,
    allowedTools: input.allowedTools,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  return { ...unsigned, signature: signPayload(unsigned, secret) };
}

export function verifyApprovalToken(
  token: ApprovalToken,
  input: VerifyApprovalTokenInput,
): VerifyApprovalTokenResult {
  const expectedSignature = signPayload(token, input.secret);
  const actual = Buffer.from(token.signature, "hex");
  const expected = Buffer.from(expectedSignature, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, errorCode: "invalid_signature" };
  }
  if (token.executionId !== input.executionId) {
    return { ok: false, errorCode: "execution_mismatch" };
  }
  const now = input.now ?? new Date();
  if (now.getTime() > Date.parse(token.expiresAt)) {
    return { ok: false, errorCode: "expired" };
  }
  if (token.approvedHash !== input.expectedHash) {
    return { ok: false, errorCode: "hash_mismatch" };
  }
  if (!token.allowedTools.includes(input.tool)) {
    return { ok: false, errorCode: "tool_not_allowed" };
  }
  if (!token.approvedNodeIds.includes(input.nodeId)) {
    return { ok: false, errorCode: "node_not_approved" };
  }
  return { ok: true };
}
