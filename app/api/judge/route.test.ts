import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerConfig: vi.fn(),
  createWorkflowDeps: vi.fn(),
  startExecution: vi.fn(),
}));

vi.mock("@/lib/config", () => ({ getServerConfig: mocks.getServerConfig }));
vi.mock("@/lib/api/workflow-deps", () => ({ createWorkflowDeps: mocks.createWorkflowDeps }));
vi.mock("@/lib/workflow/run-execution", () => ({ startExecution: mocks.startExecution }));

import { POST } from "./route";

const deps = { store: "judge-store" };
const completedExecution = {
  id: "exec_judge",
  userId: "judge",
  repoRef: "octocat/hello-world",
  mode: "judge",
  status: "completed",
  startedAt: "2026-08-22T00:00:00.000Z",
  completedAt: "2026-08-22T00:00:01.000Z",
  traceId: "trace_judge",
  receiptId: "receipt_judge",
};

function request(body: string): Request {
  return new Request("http://localhost/api/judge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/judge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerConfig.mockReturnValue({ judgeGithubToken: "judge-token" });
    mocks.createWorkflowDeps.mockReturnValue(deps);
    mocks.startExecution.mockResolvedValue(completedExecution);
  });

  it("normalizes the repository URL and returns the completed execution", async () => {
    const response = await POST(request(JSON.stringify({ repoUrl: "https://github.com/octocat/hello-world.git/" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(completedExecution);
    expect(mocks.getServerConfig).toHaveBeenCalledOnce();
    expect(mocks.createWorkflowDeps).toHaveBeenCalledWith({ githubToken: "judge-token" });
    expect(mocks.startExecution).toHaveBeenCalledWith(
      {
        userId: "judge",
        repoRef: "octocat/hello-world",
        icsUrl: null,
        mode: "judge",
      },
      deps,
    );
  });

  it.each([
    ["malformed JSON", "{"],
    ["missing repoUrl", JSON.stringify({})],
    ["non-string repoUrl", JSON.stringify({ repoUrl: 42 })],
    ["an extra body field", JSON.stringify({ repoUrl: "https://github.com/octocat/hello-world", extra: true })],
    ["a non-GitHub URL", JSON.stringify({ repoUrl: "https://gitlab.com/octocat/hello-world" })],
    ["an extra path segment", JSON.stringify({ repoUrl: "https://github.com/octocat/hello-world/issues" })],
    ["a query", JSON.stringify({ repoUrl: "https://github.com/octocat/hello-world?tab=readme" })],
    ["a hash", JSON.stringify({ repoUrl: "https://github.com/octocat/hello-world#readme" })],
    ["an empty owner", JSON.stringify({ repoUrl: "https://github.com//hello-world" })],
    ["an empty repository", JSON.stringify({ repoUrl: "https://github.com/octocat/" })],
  ])("returns 400 for %s without starting the workflow", async (_case, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "bad_request", message: expect.any(String) },
    });
    expect(mocks.createWorkflowDeps).not.toHaveBeenCalled();
    expect(mocks.startExecution).not.toHaveBeenCalled();
  });
});