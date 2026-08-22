import { describe, expect, it, vi } from "vitest";
import { createApprovalToken } from "@/lib/approval/approval-token";
import { computeApprovedHash } from "@/lib/approval/contract-hash";
import type { ExecutionContract } from "@/lib/contracts/schemas";
import type { ExecutorDeps } from "./executor-agent";
import { executeApprovedNodes } from "./executor-agent";

const secret = "test-hmac-secret";

const contract: ExecutionContract = {
  executionId: "exec_01",
  actions: [],
  prepNodes: [
    {
      nodeId: "node_todo_1",
      tool: "github.create_todo_issue",
      args: { title: "PR #12 리뷰", body: "리뷰 요청 대응" },
      preview: "이슈 생성",
    },
    {
      nodeId: "node_draft_1",
      tool: "drafts.save_issue_comment",
      args: { issueNumber: 3, body: "재현 확인 감사합니다" },
      preview: "코멘트 초안 저장",
    },
  ],
  forbiddenScope: [],
  noChanges: true,
};

function makeToken(approvedNodeIds: string[], ttlSeconds = 600) {
  return createApprovalToken(
    {
      executionId: "exec_01",
      approvedNodeIds,
      approvedHash: computeApprovedHash(contract, approvedNodeIds),
      allowedTools: ["github.create_todo_issue", "drafts.save_issue_comment"],
      ttlSeconds,
    },
    secret,
  );
}

function makeDeps(overrides: Partial<ExecutorDeps> = {}): ExecutorDeps {
  return {
    createTodoIssue: vi.fn(async () => ({ number: 42, url: "https://github.com/acme/repo/issues/42" })),
    saveIssueCommentDraft: vi.fn(async () => ({ draftId: "draft_1" })),
    logToolCall: vi.fn(),
    ...overrides,
  };
}

describe("executeApprovedNodes", () => {
  it("executes only approved nodes and returns node results", async () => {
    const deps = makeDeps();
    const token = makeToken(["node_todo_1", "node_draft_1"]);
    const result = await executeApprovedNodes(
      { contract, repoRef: "acme/repo", token, secret, existingResults: [] },
      deps,
    );

    expect(result.executionId).toBe("exec_01");
    expect(result.nodeResults).toHaveLength(2);
    expect(result.nodeResults[0]).toMatchObject({
      nodeId: "node_todo_1",
      status: "succeeded",
      resourceUrl: "https://github.com/acme/repo/issues/42",
      idempotencyKey: "exec_01:node_todo_1",
    });
    expect(deps.createTodoIssue).toHaveBeenCalledOnce();
    expect(deps.saveIssueCommentDraft).toHaveBeenCalledOnce();
  });

  it("skips unapproved nodes without side effects", async () => {
    const deps = makeDeps();
    const token = makeToken(["node_todo_1"]);
    const result = await executeApprovedNodes(
      { contract, repoRef: "acme/repo", token, secret, existingResults: [] },
      deps,
    );

    const draft = result.nodeResults.find((n) => n.nodeId === "node_draft_1");
    expect(draft?.status).toBe("skipped");
    expect(draft?.errorCode).toBe("node_not_approved");
    expect(deps.saveIssueCommentDraft).not.toHaveBeenCalled();
  });

  it("rejects every write when the token is expired", async () => {
    const deps = makeDeps();
    const token = makeToken(["node_todo_1", "node_draft_1"], -1);
    const result = await executeApprovedNodes(
      { contract, repoRef: "acme/repo", token, secret, existingResults: [] },
      deps,
    );

    expect(result.nodeResults.every((n) => n.status === "failed" && n.errorCode === "expired")).toBe(true);
    expect(deps.createTodoIssue).not.toHaveBeenCalled();
  });

  it("returns the existing result instead of re-executing (idempotency)", async () => {
    const deps = makeDeps();
    const token = makeToken(["node_todo_1", "node_draft_1"]);
    const existing = {
      nodeId: "node_todo_1",
      tool: "github.create_todo_issue" as const,
      status: "succeeded" as const,
      resourceUrl: "https://github.com/acme/repo/issues/40",
      idempotencyKey: "exec_01:node_todo_1",
    };
    const result = await executeApprovedNodes(
      { contract, repoRef: "acme/repo", token, secret, existingResults: [existing] },
      deps,
    );

    expect(result.nodeResults.find((n) => n.nodeId === "node_todo_1")).toEqual(existing);
    expect(deps.createTodoIssue).not.toHaveBeenCalled();
  });

  it("marks a node failed with the error code and keeps other nodes running", async () => {
    const deps = makeDeps({
      createTodoIssue: vi.fn(async () => {
        throw new Error("github_api_error:502");
      }),
    });
    const token = makeToken(["node_todo_1", "node_draft_1"]);
    const result = await executeApprovedNodes(
      { contract, repoRef: "acme/repo", token, secret, existingResults: [] },
      deps,
    );

    expect(result.nodeResults.find((n) => n.nodeId === "node_todo_1")).toMatchObject({
      status: "failed",
      errorCode: "github_api_error:502",
    });
    expect(result.nodeResults.find((n) => n.nodeId === "node_draft_1")?.status).toBe("succeeded");
  });

  it("logs every attempted tool call for the verifier", async () => {
    const deps = makeDeps();
    const token = makeToken(["node_todo_1", "node_draft_1"]);
    await executeApprovedNodes({ contract, repoRef: "acme/repo", token, secret, existingResults: [] }, deps);

    expect(deps.logToolCall).toHaveBeenCalledWith({ tool: "github.create_todo_issue", nodeId: "node_todo_1" });
    expect(deps.logToolCall).toHaveBeenCalledWith({ tool: "drafts.save_issue_comment", nodeId: "node_draft_1" });
  });
});
