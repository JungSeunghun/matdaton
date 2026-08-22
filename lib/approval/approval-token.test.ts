import { describe, expect, it } from "vitest";
import { createApprovalToken, verifyApprovalToken } from "./approval-token";

const secret = "test-hmac-secret";
const baseInput = {
  executionId: "exec_01",
  approvedNodeIds: ["node_todo_1"],
  approvedHash: "sha256:abc",
  allowedTools: ["github.create_todo_issue", "drafts.save_issue_comment"],
  ttlSeconds: 600,
};

describe("createApprovalToken", () => {
  it("issues a signed token with expiry", () => {
    const token = createApprovalToken(baseInput, secret);
    expect(token.executionId).toBe("exec_01");
    expect(token.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(Date.parse(token.expiresAt)).toBeGreaterThan(Date.parse(token.issuedAt));
  });
});

describe("verifyApprovalToken", () => {
  const expectedHash = "sha256:abc";

  it("accepts a valid token", () => {
    const token = createApprovalToken(baseInput, secret);
    const result = verifyApprovalToken(token, {
      secret,
      executionId: "exec_01",
      expectedHash,
      tool: "github.create_todo_issue",
      nodeId: "node_todo_1",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const token = { ...createApprovalToken(baseInput, secret), signature: "0".repeat(64) };
    const result = verifyApprovalToken(token, {
      secret,
      executionId: "exec_01",
      expectedHash,
      tool: "github.create_todo_issue",
      nodeId: "node_todo_1",
    });
    expect(result).toEqual({ ok: false, errorCode: "invalid_signature" });
  });

  it("rejects an expired token", () => {
    const token = createApprovalToken({ ...baseInput, ttlSeconds: -1 }, secret);
    const result = verifyApprovalToken(token, {
      secret,
      executionId: "exec_01",
      expectedHash,
      tool: "github.create_todo_issue",
      nodeId: "node_todo_1",
    });
    expect(result).toEqual({ ok: false, errorCode: "expired" });
  });

  it("rejects a hash mismatch after contract modification", () => {
    const token = createApprovalToken(baseInput, secret);
    const result = verifyApprovalToken(token, {
      secret,
      executionId: "exec_01",
      expectedHash: "sha256:different",
      tool: "github.create_todo_issue",
      nodeId: "node_todo_1",
    });
    expect(result).toEqual({ ok: false, errorCode: "hash_mismatch" });
  });

  it("rejects a tool outside allowedTools", () => {
    const token = createApprovalToken(baseInput, secret);
    const result = verifyApprovalToken(token, {
      secret,
      executionId: "exec_01",
      expectedHash,
      tool: "github.merge_pull_request",
      nodeId: "node_todo_1",
    });
    expect(result).toEqual({ ok: false, errorCode: "tool_not_allowed" });
  });

  it("rejects a node outside approvedNodeIds", () => {
    const token = createApprovalToken(baseInput, secret);
    const result = verifyApprovalToken(token, {
      secret,
      executionId: "exec_01",
      expectedHash,
      tool: "github.create_todo_issue",
      nodeId: "node_other",
    });
    expect(result).toEqual({ ok: false, errorCode: "node_not_approved" });
  });

  it("rejects a token issued for another execution", () => {
    const token = createApprovalToken(baseInput, secret);
    const result = verifyApprovalToken(token, {
      secret,
      executionId: "exec_02",
      expectedHash,
      tool: "github.create_todo_issue",
      nodeId: "node_todo_1",
    });
    expect(result).toEqual({ ok: false, errorCode: "execution_mismatch" });
  });
});
