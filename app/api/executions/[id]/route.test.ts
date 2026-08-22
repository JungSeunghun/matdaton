import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Execution } from "@/lib/contracts/schemas";

const { createWorkflowDepsMock, getExecutionMock, getSessionUserMock } = vi.hoisted(() => ({
  createWorkflowDepsMock: vi.fn(),
  getExecutionMock: vi.fn(),
  getSessionUserMock: vi.fn(),
}));

vi.mock("@/lib/api/session", () => ({
  getSessionUser: getSessionUserMock,
}));

vi.mock("@/lib/api/workflow-deps", () => ({
  createWorkflowDeps: createWorkflowDepsMock,
}));

import { GET } from "./route";

const execution: Execution = {
  id: "exec_01",
  userId: "user_1",
  repoRef: "acme/repo",
  mode: "daily",
  status: "waiting_approval",
  startedAt: "2026-08-22T07:50:00.000Z",
  traceId: "trace_01",
};

function requestExecution(id = execution.id) {
  return GET(new Request(`http://localhost/api/executions/${id}`), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/executions/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionUserMock.mockResolvedValue({ userId: "user_1", login: "octocat" });
    createWorkflowDepsMock.mockReturnValue({ store: { getExecution: getExecutionMock } });
  });

  it("returns the full execution for the authenticated user", async () => {
    getExecutionMock.mockResolvedValue(execution);

    const response = await requestExecution();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(execution);
    expect(getExecutionMock).toHaveBeenCalledWith("user_1", "exec_01");
  });

  it("returns the common 401 error when unauthenticated", async () => {
    getSessionUserMock.mockResolvedValue(null);

    const response = await requestExecution();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "unauthorized", message: "인증이 필요합니다" },
    });
    expect(createWorkflowDepsMock).not.toHaveBeenCalled();
    expect(getExecutionMock).not.toHaveBeenCalled();
  });

  it("returns the same common 404 error when the store cannot find the execution", async () => {
    getExecutionMock.mockResolvedValue(null);

    const response = await requestExecution("missing_or_other_users_execution");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "리소스를 찾을 수 없습니다" },
    });
    expect(getExecutionMock).toHaveBeenCalledWith(
      "user_1",
      "missing_or_other_users_execution",
    );
  });
});