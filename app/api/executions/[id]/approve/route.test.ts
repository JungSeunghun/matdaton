import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeContractHash } from "@/lib/approval/contract-hash";
import {
  ExecutionContractSchema,
  type Execution,
  type ExecutionContract,
} from "@/lib/contracts/schemas";

const mocks = vi.hoisted(() => ({
  approveExecution: vi.fn(),
  createWorkflowDeps: vi.fn(),
  getExecution: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/api/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/api/workflow-deps", () => ({
  createWorkflowDeps: mocks.createWorkflowDeps,
}));
vi.mock("@/lib/workflow/run-execution", () => ({
  approveExecution: mocks.approveExecution,
}));

import { POST } from "./route";

const contract: ExecutionContract = ExecutionContractSchema.parse({
  executionId: "exec_01",
  actions: [
    {
      nodeId: "action_1",
      title: "Review the overnight pull request",
      evidenceUrls: ["https://github.com/acme/repo/pull/1"],
      successCriteria: "The review is complete",
      estimatedMinutes: 10,
    },
    {
      nodeId: "action_2",
      title: "Triage the new issue",
      evidenceUrls: ["https://github.com/acme/repo/issues/2"],
      successCriteria: "The issue has an owner",
      estimatedMinutes: 15,
    },
    {
      nodeId: "action_3",
      title: "Check the latest commit",
      evidenceUrls: ["https://github.com/acme/repo/commit/abc123"],
      successCriteria: "The commit is verified",
      estimatedMinutes: 5,
    },
  ],
  prepNodes: [
    {
      nodeId: "prep_todo_1",
      tool: "github.create_todo_issue",
      args: { title: "Follow up on overnight changes", body: "Review the collected evidence." },
      preview: "Create a follow-up issue",
    },
    {
      nodeId: "prep_comment_1",
      tool: "drafts.save_issue_comment",
      args: { issueNumber: 2, body: "I will investigate this today." },
      preview: "Save a draft issue comment",
    },
  ],
  forbiddenScope: ["merge", "push"],
  noChanges: false,
});

const waitingExecution: Execution = {
  id: "exec_01",
  userId: "user_1",
  repoRef: "acme/repo",
  mode: "daily",
  status: "waiting_approval",
  startedAt: "2026-08-22T07:50:00.000Z",
  contract,
  contractHash: computeContractHash(contract),
  policyReport: {
    executionId: "exec_01",
    nodeFindings: [
      { nodeId: "prep_todo_1", verdict: "allowed", reasons: [] },
      { nodeId: "prep_comment_1", verdict: "allowed", reasons: [] },
    ],
  },
  traceId: "trace_01",
};

const completedExecution: Execution = {
  ...waitingExecution,
  status: "completed",
  executionResult: {
    executionId: "exec_01",
    nodeResults: [
      {
        nodeId: "prep_todo_1",
        tool: "github.create_todo_issue",
        status: "succeeded",
        resourceUrl: "https://github.com/acme/repo/issues/3",
        resourceRef: "3",
        idempotencyKey: "exec_01:prep_todo_1",
      },
    ],
  },
};

const deps = { store: { getExecution: mocks.getExecution } };
let warnSpy: ReturnType<typeof vi.spyOn>;

function request(body: string, id = waitingExecution.id) {
  return POST(
    new Request(`http://localhost/api/executions/${id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("POST /api/executions/:id/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.getSessionUser.mockResolvedValue({ userId: "user_1", login: "octocat" });
    mocks.createWorkflowDeps.mockReturnValue(deps);
    mocks.getExecution.mockResolvedValue(waitingExecution);
    mocks.approveExecution.mockResolvedValue(completedExecution);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("approves selected prep nodes and returns the completed execution", async () => {
    const approvedNodeIds = ["prep_todo_1"];

    const response = await request(JSON.stringify({ approvedNodeIds }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(completedExecution);
    expect(mocks.getExecution).toHaveBeenCalledWith("user_1", "exec_01");
    expect(mocks.approveExecution).toHaveBeenCalledWith(
      { userId: "user_1", executionId: "exec_01", approvedNodeIds },
      deps,
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await request(JSON.stringify({ approvedNodeIds: [] }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
    expect(mocks.createWorkflowDeps).not.toHaveBeenCalled();
    expect(mocks.getExecution).not.toHaveBeenCalled();
    expect(mocks.approveExecution).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"],
    ["missing approvedNodeIds", JSON.stringify({})],
    ["a non-array approvedNodeIds", JSON.stringify({ approvedNodeIds: "prep_todo_1" })],
    ["a non-string node id", JSON.stringify({ approvedNodeIds: [42] })],
    ["an extra property", JSON.stringify({ approvedNodeIds: [], unexpected: true })],
  ])("returns 400 for %s", async (_case, body) => {
    const response = await request(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "bad_request" } });
    expect(mocks.createWorkflowDeps).not.toHaveBeenCalled();
    expect(mocks.getExecution).not.toHaveBeenCalled();
    expect(mocks.approveExecution).not.toHaveBeenCalled();
  });

  it("returns 404 when the store cannot find the execution", async () => {
    mocks.getExecution.mockResolvedValue(null);

    const response = await request(
      JSON.stringify({ approvedNodeIds: [] }),
      "missing_or_other_users_execution",
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "not_found" } });
    expect(mocks.getExecution).toHaveBeenCalledWith(
      "user_1",
      "missing_or_other_users_execution",
    );
    expect(mocks.approveExecution).not.toHaveBeenCalled();
  });

  it("returns 409 when the execution is not waiting for approval", async () => {
    mocks.getExecution.mockResolvedValue({ ...waitingExecution, status: "executing" });

    const response = await request(JSON.stringify({ approvedNodeIds: [] }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "conflict" } });
    expect(mocks.approveExecution).not.toHaveBeenCalled();
  });

  it("returns 403 without approving a policy-blocked node", async () => {
    mocks.getExecution.mockResolvedValue({
      ...waitingExecution,
      policyReport: {
        executionId: "exec_01",
        nodeFindings: [
          { nodeId: "prep_todo_1", verdict: "blocked", reasons: ["unsafe arguments"] },
          { nodeId: "prep_comment_1", verdict: "allowed", reasons: [] },
        ],
      },
    });

    const response = await request(JSON.stringify({ approvedNodeIds: ["prep_todo_1"] }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
    expect(mocks.approveExecution).not.toHaveBeenCalled();
  });

  it("returns 403 without approving when the stored contract hash is stale", async () => {
    mocks.getExecution.mockResolvedValue({
      ...waitingExecution,
      contractHash: computeContractHash({ ...contract, forbiddenScope: ["push"] }),
    });

    const response = await request(JSON.stringify({ approvedNodeIds: ["prep_todo_1"] }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
    expect(mocks.approveExecution).not.toHaveBeenCalled();
  });

  it("returns 403 without approving a node absent from contract prepNodes", async () => {
    const response = await request(JSON.stringify({ approvedNodeIds: ["prep_missing"] }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
    expect(mocks.approveExecution).not.toHaveBeenCalled();
  });

  it("returns 403 and warns when approval finishes with a token violation", async () => {
    mocks.approveExecution.mockResolvedValue({
      ...completedExecution,
      executionResult: {
        executionId: "exec_01",
        nodeResults: [
          {
            nodeId: "prep_todo_1",
            tool: "github.create_todo_issue",
            status: "failed",
            idempotencyKey: "exec_01:prep_todo_1",
            errorCode: "expired",
          },
        ],
      },
    });

    const response = await request(JSON.stringify({ approvedNodeIds: ["prep_todo_1"] }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
    expect(mocks.approveExecution).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns 403 and warns when approval rejects an expired token", async () => {
    mocks.approveExecution.mockRejectedValue(new Error("approval token violation: expired"));

    const response = await request(JSON.stringify({ approvedNodeIds: ["prep_todo_1"] }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
    expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({
      audit: "approval_denied",
      reason: "approval token violation: expired",
    }));
  });
});